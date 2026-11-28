#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SyntaxKind } from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const TEST_DIR = /(^|\/)(?:e2e|test)(\/|$)/u;
const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/u;
const CYRILLIC = /[\u0400-\u04FF]/u;
const PLURAL = /_(?:zero|one|two|few|many|other)$/u;
export const DEFAULT_CONFIG = {
  root: ROOT,
  projects: [
    "apps/web/tsconfig.json",
    "apps/api/tsconfig.json",
    "packages/shared/tsconfig.json",
    "packages/ui/tsconfig.json",
    "packages/i18n/tsconfig.json",
  ].map((file) => join(ROOT, file)),
  scanRoots: [
    "apps/web/src",
    "apps/api/src",
    "packages/shared/src",
    "packages/ui/src",
    "packages/i18n/src",
  ],
  testUsageRoots: [
    "apps/web/src",
    "apps/api/src",
    "packages/shared/src",
    "packages/ui/src",
    "packages/i18n/src",
  ],
  catalogPath: join(ROOT, "packages", "i18n", "src", "resources", "ru.ts"),
  baselinePath: join(ROOT, "scripts", "i18n-baseline.json"),
  allowlistPath: join(ROOT, "scripts", "i18n-allowlist.json"),
  indexHtmlPath: join(ROOT, "apps/web", "index.html"),
};
function toRepoPath(filePath, root) {
  const rel = relative(root, resolve(filePath));
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
export function validateAllowlist(allowlist) {
  for (const entry of allowlist) {
    if (!entry.reason) throw new Error("check-i18n: allowlist entry without reason");
    if (!entry.file && !entry.key) throw new Error("check-i18n: allowlist entry without file/key");
    if (entry.file && (!entry.texts?.length || !entry.kinds?.length)) {
      throw new Error(`check-i18n: allowlist entry needs texts+kinds: ${entry.file}`);
    }
  }
  return allowlist;
}
export function readAllowlist(path) {
  return validateAllowlist(JSON.parse(readFileSync(path, "utf8")));
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
    compareText(`${a.kind}:${a.text}`, `${b.kind}:${b.text}`),
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
/** Scan one TS/TSX file from disk (used by unit tests). */
export function scanFile(filePath, root = ROOT) {
  const api = new API();
  try {
    const absolute = resolve(filePath);
    const snapshot = api.updateSnapshot({ openFiles: [absolute] });
    const project = snapshot.getDefaultProjectForFile(absolute);
    const sourceFile = project?.program.getSourceFile(absolute);
    if (!sourceFile) throw new Error(`check-i18n: cannot parse ${filePath}`);
    return scanTree(sourceFile, toRepoPath(absolute, root));
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
  if (keys.length === 0) throw new Error("check-i18n: no catalog keys parsed");
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
  for (const [base, variants] of [...groups].sort(([a], [b]) => compareText(a, b))) {
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
export function indexHtmlFindings(config, allowlist) {
  const repoPath = toRepoPath(config.indexHtmlPath, config.root);
  const entry = allowlist.find(
    (item) => item.file === repoPath && item.kinds.includes("html-text"),
  );
  let source = readFileSync(config.indexHtmlPath, "utf8");
  for (const allowed of entry?.texts ?? []) source = source.replaceAll(allowed, "");
  return source
    .split(/\r?\n/u)
    .filter((line) => hasCyrillic(line))
    .map((line) => ({ file: repoPath, kind: "html-text", text: normalize(line), count: 1 }));
}
export function isAllowed(finding, allowlist) {
  return allowlist.some(
    (entry) =>
      entry.file === finding.file &&
      entry.kinds.includes(finding.kind) &&
      entry.texts.includes(finding.text),
  );
}
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function scanProject(config = DEFAULT_CONFIG, allowlist = []) {
  const catalogRepoPath = toRepoPath(config.catalogPath, config.root);
  for (const project of config.projects) {
    if (!existsSync(project))
      throw new Error(`check-i18n: missing project config ${toRepoPath(project, config.root)}`);
  }
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openProjects: config.projects });
    const files = new Map();
    const projects = snapshot.getProjects();
    const expected = config.projects.map((project) => resolve(project));
    const loaded = new Set(projects.map((project) => resolve(project.id)));
    if (projects.length !== expected.length || expected.some((project) => !loaded.has(project))) {
      throw new Error(`check-i18n: loaded ${projects.length}/${expected.length} projects`);
    }
    for (const project of projects) {
      for (const absolute of project.program.getSourceFileNames()) {
        const path = toRepoPath(absolute, config.root);
        if (!SOURCE_FILE.test(path)) continue;
        if (path === catalogRepoPath) continue;
        if (!config.scanRoots.some((root) => path.startsWith(`${root}/`))) continue;
        if (!files.has(absolute)) files.set(absolute, { path, project });
      }
    }
    const catalogFile = projects
      .map((project) => project.program.getSourceFile(config.catalogPath))
      .find(Boolean);
    if (!catalogFile) throw new Error(`check-i18n: cannot read ${catalogRepoPath}`);
    const catalog = catalogKeys(catalogFile);
    const findings = [];
    const productionKeys = new Set();
    const testKeys = new Set();
    const dynamic = [];
    const productionRoots = new Set();
    let productionFiles = 0;
    let testFiles = 0;
    for (const { path, project } of [...files.values()].sort((a, b) =>
      compareText(a.path, b.path),
    )) {
      const sourceFile = project.program.getSourceFile(join(config.root, path));
      if (!sourceFile) throw new Error(`check-i18n: cannot read source ${path}`);
      const usages = keyUsages(sourceFile, path);
      dynamic.push(...usages.dynamic);
      if (isProduction(path)) {
        productionFiles += 1;
        productionRoots.add(config.scanRoots.find((root) => path.startsWith(`${root}/`)));
        findings.push(...scanTree(sourceFile, path));
        usages.keys.forEach((key) => productionKeys.add(key));
      } else if (isTestFile(path)) {
        testFiles += 1;
        usages.keys.forEach((key) => testKeys.add(key));
      }
    }
    for (const project of projects) {
      for (const absolute of project.program.getSourceFileNames()) {
        const path = toRepoPath(absolute, config.root);
        if (!config.scanRoots.some((root) => path.startsWith(`${root}/`))) continue;
        if (!isTestFile(path)) continue;
        const sourceFile = project.program.getSourceFile(absolute);
        if (!sourceFile) throw new Error(`check-i18n: cannot read source ${path}`);
        keyUsages(sourceFile, path).keys.forEach((key) => testKeys.add(key));
      }
    }
    for (const root of config.scanRoots) {
      if (!productionRoots.has(root))
        throw new Error(`check-i18n: scan root has no production files: ${root}`);
    }
    findings.push(...indexHtmlFindings(config, allowlist));
    const allowedFindings = findings.filter((finding) => isAllowed(finding, allowlist));
    const actionable = findings.filter((finding) => !isAllowed(finding, allowlist));
    const issues = findKeyIssues(catalog, productionKeys, testKeys);
    const deadKeys = issues.deadKeys.filter((finding) => {
      const candidates = [finding.key, ...finding.variants];
      return !allowlist.some((entry) => entry.key && candidates.includes(entry.key));
    });
    return {
      actionable: actionable.sort((a, b) =>
        compareText(`${a.file}:${a.kind}:${a.text}`, `${b.file}:${b.kind}:${b.text}`),
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
export function baselineFrom(result) {
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
export function readBaseline(path) {
  if (!existsSync(path)) return null;
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  if (baseline.version !== 1) throw new Error("check-i18n: unsupported baseline version");
  return baseline;
}
export function newViolations(result, baseline) {
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
const CONSOLE_IO = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
/** Run one gate invocation. Returns an exit code instead of terminating the process. */
export function runCheck(argv, config = DEFAULT_CONFIG, io = CONSOLE_IO) {
  const update = argv.includes("--update-baseline");
  const init = argv.includes("--init-baseline");
  const allowlist = config.allowlist
    ? validateAllowlist(config.allowlist)
    : readAllowlist(config.allowlistPath);
  const result = scanProject(config, allowlist);
  const baseline = readBaseline(config.baselinePath);
  const occurrences = result.actionable.reduce((sum, finding) => sum + finding.count, 0);
  io.log(
    `i18n scan: ${result.productionFiles} production files, ${result.testFiles} test files; ` +
      `${result.catalogKeys} keys, ${result.productionUsages} production usages`,
  );
  io.log(
    `cyrillic: ${result.actionable.length} baselined findings / ${occurrences} occurrences; ` +
      `${result.allowed} allowlisted occurrences`,
  );
  if (result.missing.length > 0) io.error(`missing keys: ${result.missing.join(", ")}`);
  if (result.deadKeys.length > 0) {
    io.error(`dead keys: ${result.deadKeys.map((finding) => finding.key).join(", ")}`);
  }
  if (result.dynamic.length > 0) {
    io.warn(`warning: dynamic t() keys are not checked: ${result.dynamic.join(", ")}`);
  }
  const added = baseline ? newViolations(result, baseline) : [];
  if (update) {
    if (!baseline) {
      io.error("check-i18n: baseline is missing; use --init-baseline once");
      return { exitCode: 1, result, baseline, added };
    }
    if (result.missing.length > 0 || added.length > 0) {
      io.error("check-i18n: refusing to mask new violations in the baseline");
      for (const entry of added) io.error(`  + ${entry}`);
      return { exitCode: 1, result, baseline, added };
    }
    writeFileSync(config.baselinePath, `${JSON.stringify(baselineFrom(result), null, 2)}\n`);
    io.log(`baseline updated: ${result.actionable.length} findings`);
    return { exitCode: 0, result, baseline, added };
  }
  if (init) {
    if (baseline) {
      io.error("check-i18n: baseline already exists; refusing to overwrite it");
      return { exitCode: 1, result, baseline, added };
    }
    writeFileSync(config.baselinePath, `${JSON.stringify(baselineFrom(result), null, 2)}\n`);
    io.log(`baseline initialized: ${result.actionable.length} findings`);
    return { exitCode: 0, result, baseline, added };
  }
  if (!baseline) {
    io.error("check-i18n: baseline is missing; run pnpm check:i18n:update");
    return { exitCode: 1, result, baseline, added };
  }
  if (result.missing.length > 0 || added.length > 0) {
    io.error("new i18n violations (move text to the catalog or allowlist):");
    for (const entry of added) io.error(`  + ${entry}`);
    return { exitCode: 1, result, baseline, added };
  }
  io.log(`i18n check passed (baseline: ${(baseline.cyrillic ?? []).length} findings)`);
  return { exitCode: 0, result, baseline, added };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCheck(process.argv.slice(2), DEFAULT_CONFIG, CONSOLE_IO).exitCode;
}
