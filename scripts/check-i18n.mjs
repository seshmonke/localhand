#!/usr/bin/env node
/**
 * 100% i18n gate for runtime copy.
 *
 * TypeScript 7 exposes its native AST through typescript/unstable/sync instead
 * of the legacy in-process compiler API, so files are parsed in a short-lived
 * snapshot. Production TS/TSX is scanned for cyrillic strings/templates/JSX
 * text outside packages/i18n/resources/ru.ts; static t("...") keys are checked
 * for missing and dead entries. Tests, e2e, stories, comments, seed and provider
 * payload are excluded (allowlist with reason in scripts/i18n-allowlist.json).
 *
 * Usage:
 *   node scripts/check-i18n.mjs
 *   node scripts/check-i18n.mjs --update-baseline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "i18n-baseline.json");
const ALLOWLIST_FILE = join(ROOT, "scripts", "i18n-allowlist.json");
const CATALOG = join(ROOT, "packages", "i18n", "src", "resources", "ru.ts");
const INDEX_HTML = "apps/web/index.html";
const PROJECTS = [
  "apps/web/tsconfig.json",
  "apps/api/tsconfig.json",
  "packages/shared/tsconfig.json",
  "packages/i18n/tsconfig.json",
].map((file) => join(ROOT, file));
const SCAN_ROOTS = ["apps/web/src", "apps/api/src", "packages/shared/src"];
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const TEST_DIR = /(^|\/)(?:e2e|test)(\/|$)/u;
const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/u;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const CYRILLIC = /[\u0400-\u04FF]/u;
const PLURAL = /_(?:zero|one|two|few|many|other)$/u;

const ALLOWLIST = JSON.parse(readFileSync(ALLOWLIST_FILE, "utf8"));
for (const entry of ALLOWLIST) {
  if (!entry.reason) throw new Error("check-i18n: allowlist entry without reason");
}

function toRepoPath(filePath) {
  const rel = relative(ROOT, resolve(filePath));
  return (rel.startsWith("..") ? resolve(filePath) : rel).split(sep).join("/");
}

function text(node) {
  return typeof node?.text === "string" ? node.text : "";
}

function normalize(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function hasCyrillic(value) {
  return CYRILLIC.test(value);
}

function unwrap(node) {
  while (
    node &&
    (node.kind === SyntaxKind.AsExpression ||
      node.kind === SyntaxKind.SatisfiesExpression ||
      node.kind === SyntaxKind.ParenthesizedExpression)
  ) {
    node = node.expression;
  }
  return node;
}

function isTestFile(path) {
  return TEST_FILE.test(path) || TEST_DIR.test(path);
}

function isProduction(path) {
  return !isTestFile(path) && !STORY_FILE.test(path);
}

function scanTree(sourceFile, repoPath) {
  const found = new Map();
  const add = (kind, raw) => {
    const value = normalize(raw);
    if (!value || !hasCyrillic(value)) return;
    const id = `${kind}\u0000${value}`;
    const entry = found.get(id) ?? { file: repoPath, kind, text: value, count: 0 };
    entry.count += 1;
    found.set(id, entry);
  };

  const visit = (node) => {
    if (node.kind === SyntaxKind.StringLiteral) {
      add(node.parent?.kind === SyntaxKind.JsxAttribute ? "jsx-attribute" : "string", text(node));
    } else if (node.kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      add("template", text(node));
    } else if (node.kind === SyntaxKind.TemplateExpression) {
      add(
        "template",
        [text(node.head), ...node.templateSpans.map((span) => text(span.literal))].join("${…}"),
      );
    } else if (node.kind === SyntaxKind.JsxText) {
      add("jsx-text", text(node));
    }
    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);
  return [...found.values()].sort((a, b) =>
    `${a.kind}:${a.text}`.localeCompare(`${b.kind}:${b.text}`),
  );
}

function keyUsages(sourceFile, repoPath) {
  const keys = new Set();
  const dynamic = [];
  const visit = (node) => {
    if (node.kind === SyntaxKind.CallExpression) {
      const callee = node.expression;
      const translate =
        (callee.kind === SyntaxKind.Identifier && callee.text === "t") ||
        (callee.kind === SyntaxKind.PropertyAccessExpression && callee.name.text === "t");
      const argument = node.arguments?.[0];
      if (translate && argument?.kind === SyntaxKind.StringLiteral) {
        keys.add(text(argument));
      } else if (translate && argument?.kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
        keys.add(text(argument));
      } else if (translate) {
        dynamic.push(`${repoPath}:${sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1}`);
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return { keys, dynamic };
}

/** Scan one TS/TSX file from disk (used by the unit test fixture). */
export function scanFile(filePath) {
  const api = new API();
  try {
    const absolute = resolve(filePath);
    const snapshot = api.updateSnapshot({ openFiles: [absolute] });
    const project = snapshot.getDefaultProjectForFile(absolute);
    const sourceFile = project?.program.getSourceFile(absolute);
    if (!sourceFile) throw new Error(`check-i18n: cannot parse ${filePath}`);
    return scanTree(sourceFile, toRepoPath(absolute));
  } finally {
    api.close();
  }
}

function catalogKeys(sourceFile) {
  const keys = [];
  const visit = (node) => {
    if (node.kind === SyntaxKind.VariableDeclaration && node.name?.text === "ru") {
      const object = unwrap(node.initializer);
      if (object?.kind === SyntaxKind.ObjectLiteralExpression) {
        for (const property of object.properties) {
          if (property.kind !== SyntaxKind.PropertyAssignment) continue;
          if (
            property.name?.kind === SyntaxKind.StringLiteral ||
            property.name?.kind === SyntaxKind.NumericLiteral ||
            property.name?.kind === SyntaxKind.Identifier
          ) {
            keys.push(text(property.name));
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  if (keys.length === 0) throw new Error(`check-i18n: no keys in ${toRepoPath(CATALOG)}`);
  return keys;
}

/** Compare catalog keys with usages. Plural variants follow their base key. */
export function findKeyIssues(catalog, usedInProduction, usedInTests) {
  const known = new Set(catalog);
  const missing = [...new Set([...usedInProduction, ...usedInTests])]
    .filter((key) => !known.has(key))
    .sort();

  const groups = new Map();
  for (const key of catalog) {
    const base = key.replace(PLURAL, "");
    groups.set(base, [...(groups.get(base) ?? []), key]);
  }

  const deadKeys = [];
  for (const [base, variants] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const candidates = [base, ...variants];
    if (candidates.some((key) => usedInProduction.has(key))) continue;
    deadKeys.push({
      key: base,
      testOnly: candidates.some((key) => usedInTests.has(key)),
      variants,
    });
  }
  return { missing, deadKeys };
}

function indexHtmlFindings() {
  const entry = ALLOWLIST.find((item) => item.file === INDEX_HTML);
  let source = readFileSync(join(ROOT, INDEX_HTML), "utf8");
  for (const allowed of entry.texts) source = source.replaceAll(allowed, "");
  return source
    .split(/\r?\n/u)
    .filter((line) => hasCyrillic(line))
    .map((line) => ({ file: INDEX_HTML, kind: "html-text", text: normalize(line), count: 1 }));
}

function allowedCyrillic(finding) {
  return ALLOWLIST.some(
    (entry) => entry.file === finding.file && (!entry.texts || entry.texts.includes(finding.text)),
  );
}

function scanProject() {
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openProjects: PROJECTS });
    const files = new Map();
    for (const project of snapshot.getProjects()) {
      for (const absolute of project.program.getSourceFileNames()) {
        const path = toRepoPath(absolute);
        if (!SOURCE_FILE.test(path)) continue;
        if (!SCAN_ROOTS.some((root) => path.startsWith(`${root}/`))) continue;
        if (!files.has(absolute)) files.set(absolute, { path, project });
      }
    }

    const i18nProject = snapshot
      .getProjects()
      .find((project) => project.id.endsWith("packages/i18n/tsconfig.json"));
    const catalogFile = i18nProject?.program.getSourceFile(CATALOG);
    if (!i18nProject || !catalogFile) {
      throw new Error(`check-i18n: cannot read ${toRepoPath(CATALOG)}`);
    }
    const catalog = catalogKeys(catalogFile);

    const findings = [];
    const productionKeys = new Set();
    const testKeys = new Set();
    const dynamic = [];
    let productionFiles = 0;
    let testFiles = 0;

    for (const { path, project } of [...files.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    )) {
      const sourceFile = project.program.getSourceFile(join(ROOT, path));
      if (!sourceFile) continue;
      const usages = keyUsages(sourceFile, path);
      dynamic.push(...usages.dynamic);
      if (isProduction(path)) {
        productionFiles += 1;
        findings.push(...scanTree(sourceFile, path));
        usages.keys.forEach((key) => productionKeys.add(key));
      } else if (isTestFile(path)) {
        testFiles += 1;
        usages.keys.forEach((key) => testKeys.add(key));
      }
    }
    for (const absolute of i18nProject.program.getSourceFileNames()) {
      const path = toRepoPath(absolute);
      if (!path.startsWith("packages/i18n/src/") || !isTestFile(path)) continue;
      const sourceFile = i18nProject.program.getSourceFile(absolute);
      if (sourceFile) keyUsages(sourceFile, path).keys.forEach((key) => testKeys.add(key));
    }
    findings.push(...indexHtmlFindings());

    const allowedFindings = findings.filter((finding) => allowedCyrillic(finding));
    const actionable = findings.filter((finding) => !allowedFindings.includes(finding));
    const issues = findKeyIssues(catalog, productionKeys, testKeys);
    const deadKeys = issues.deadKeys.filter((finding) => {
      const candidates = [finding.key, ...finding.variants];
      return !ALLOWLIST.some((entry) => entry.key && candidates.includes(entry.key));
    });

    return {
      actionable: actionable.sort((a, b) =>
        `${a.file}:${a.kind}:${a.text}`.localeCompare(`${b.file}:${b.kind}:${b.text}`),
      ),
      allowed: allowedFindings.reduce((sum, finding) => sum + finding.count, 0),
      missing: issues.missing,
      deadKeys,
      dynamic,
      productionFiles,
      testFiles,
      catalogKeys: catalog.length,
      productionUsages: productionKeys.size,
    };
  } finally {
    api.close();
  }
}

function baselineFrom(result) {
  return {
    version: 1,
    cyrillic: result.actionable.map(({ file, kind, text: value, count }) => ({
      file,
      kind,
      text: value,
      count,
    })),
    deadKeys: result.deadKeys.map(({ key, testOnly }) => ({ key, testOnly })),
  };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  if (baseline.version !== 1) throw new Error("check-i18n: unsupported baseline version");
  return baseline;
}

function newViolations(result, baseline) {
  const id = (finding) => `${finding.file}\u0000${finding.kind}\u0000${finding.text}`;
  const saved = new Map((baseline.cyrillic ?? []).map((finding) => [id(finding), finding]));
  const added = [];
  for (const finding of result.actionable) {
    const previous = saved.get(id(finding));
    if (!previous) added.push(`${finding.file} (${finding.kind}): ${finding.text}`);
    else if (finding.count > previous.count) {
      added.push(`${finding.file} (${finding.kind}): ${finding.text} (+count)`);
    }
  }
  const savedDead = new Set((baseline.deadKeys ?? []).map((finding) => finding.key));
  for (const finding of result.deadKeys) {
    if (!savedDead.has(finding.key)) added.push(`dead key: ${finding.key}`);
  }
  return added;
}

function main() {
  const update = process.argv.includes("--update-baseline");
  const result = scanProject();
  const baseline = readBaseline();
  const occurrences = result.actionable.reduce((sum, finding) => sum + finding.count, 0);
  console.log(
    `i18n scan: ${result.productionFiles} production files, ${result.testFiles} test files; ` +
      `${result.catalogKeys} keys, ${result.productionUsages} production usages`,
  );
  console.log(
    `cyrillic: ${result.actionable.length} baselined findings / ${occurrences} occurrences; ` +
      `${result.allowed} allowlisted occurrences`,
  );
  if (result.missing.length > 0) console.error(`missing keys: ${result.missing.join(", ")}`);
  if (result.deadKeys.length > 0) {
    console.error(`dead keys: ${result.deadKeys.map((finding) => finding.key).join(", ")}`);
  }
  if (result.dynamic.length > 0) {
    console.warn(`warning: dynamic t() keys are not checked: ${result.dynamic.join(", ")}`);
  }

  if (update) {
    if (result.missing.length > 0) {
      console.error("check-i18n: fix missing keys before updating the baseline");
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify(baselineFrom(result), null, 2)}\n`);
    console.log(`baseline updated: ${result.actionable.length} findings`);
    return;
  }

  if (!baseline) {
    console.error("check-i18n: scripts/i18n-baseline.json is missing; run pnpm check:i18n:update");
    process.exit(1);
  }

  const added = newViolations(result, baseline);
  if (result.missing.length > 0 || added.length > 0) {
    console.error("new i18n violations (move text to packages/i18n/resources/ru.ts or allowlist):");
    for (const entry of added) console.error(`  + ${entry}`);
    process.exit(1);
  }
  console.log(`i18n check passed (baseline: ${(baseline.cyrillic ?? []).length} findings)`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
