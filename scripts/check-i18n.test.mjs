import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findKeyIssues, scanFile, scanProject, validateAllowlist } from "./check-i18n.mjs";

const fixture = fileURLToPath(new URL("./fixtures/i18n/cyrillic.tsx", import.meta.url));
const cleanFixture = fileURLToPath(new URL("./fixtures/i18n/clean.tsx", import.meta.url));
const projectFixture = fileURLToPath(new URL("./fixtures/i18n/project", import.meta.url));

const ALLOWED = validateAllowlist([
  {
    file: "ui/button.tsx",
    kinds: ["jsx-attribute"],
    texts: ["Подсказка"],
    reason: "fixture",
  },
  { file: "ui/button.tsx", kinds: ["jsx-text"], texts: ["Кнопка"], reason: "fixture" },
  { file: "i18n/fallback.ts", kinds: ["string"], texts: ["Запасной текст"], reason: "fixture" },
  { file: "index.html", kinds: ["html-text"], texts: ["Тестовый заголовок"], reason: "fixture" },
]);

function makeProject(t) {
  const root = mkdtempSync(join(tmpdir(), "i18n-gate-"));
  cpSync(projectFixture, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    projects: [join(root, "tsconfig.json")],
    scanRoots: ["ui", "i18n"],
    catalogPath: join(root, "catalog", "ru.ts"),
    baselinePath: join(root, "baseline.json"),
    indexHtmlPath: join(root, "index.html"),
    allowlist: [],
  };
}

test("scanner catches cyrillic runtime strings in production-like TSX", () => {
  const findings = scanFile(fixture).map((finding) => `${finding.kind}:${finding.text}`);

  assert.deepEqual(findings.sort(), [
    "jsx-attribute:Подсказка",
    "jsx-text:Текст в JSX",
    "string:Проверочная строка",
    "template:Шаблон без подстановки",
  ]);
});

test("scanner ignores comments and non-cyrillic source", () => {
  assert.deepEqual(
    scanFile(fixture).filter((finding) => finding.kind === "comment"),
    [],
  );
  assert.deepEqual(scanFile(cleanFixture), []);
});

test("scans packages/ui and packages/i18n outside the catalog", (t) => {
  const config = makeProject(t);
  const result = scanProject(config, []);
  const findings = result.actionable.map((finding) => `${finding.file}:${finding.text}`);

  assert.ok(findings.includes("ui/button.tsx:Кнопка"));
  assert.ok(findings.includes("ui/button.tsx:Подсказка"));
  assert.ok(findings.includes("i18n/fallback.ts:Запасной текст"));
  assert.ok(!findings.some((finding) => finding.includes("catalog/ru.ts")));
});

test("allowlist matches file+kind+text, not a whole file", (t) => {
  const config = makeProject(t);
  config.allowlist = ALLOWED;
  assert.deepEqual(scanProject(config, ALLOWED).actionable, []);

  const buttonPath = join(config.root, "ui/button.tsx");
  writeFileSync(buttonPath, readFileSync(buttonPath, "utf8").replace("Кнопка", "КнопкаНовая"));
  const result = scanProject(config, ALLOWED);
  assert.ok(
    result.actionable.some(
      (finding) => finding.file === "ui/button.tsx" && finding.text === "КнопкаНовая",
    ),
  );
});

test("index.html allowlist keeps the title but catches a new meta line", (t) => {
  const config = makeProject(t);
  config.allowlist = ALLOWED;
  assert.deepEqual(scanProject(config, ALLOWED).actionable, []);

  writeFileSync(
    config.indexHtmlPath,
    readFileSync(config.indexHtmlPath, "utf8").replace(
      "</head>",
      '<meta name="description" content="Новое описание" /></head>',
    ),
  );
  const result = scanProject(config, ALLOWED);
  assert.ok(
    result.actionable.some(
      (finding) => finding.kind === "html-text" && finding.text.includes("Новое описание"),
    ),
  );
});

test("key gate reports missing and test-only dead keys", () => {
  const { missing, deadKeys } = findKeyIssues(
    ["common.ok", "cart.item", "cart.item_one", "cart.item_few"],
    new Set(["common.ok", "unknown.key"]),
    new Set(["cart.item"]),
  );

  assert.deepEqual(missing, ["unknown.key"]);
  assert.deepEqual(
    deadKeys.map((finding) => [finding.key, finding.testOnly]),
    [["cart.item", true]],
  );
});
