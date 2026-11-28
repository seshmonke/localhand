import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  indexHtmlFindings,
  runCheck,
  scanFile,
  scanProject,
  validateAllowlist,
} from "./check-i18n.mjs";
const fixture = fileURLToPath(new URL("./fixtures/i18n/cyrillic.tsx", import.meta.url));
const cleanFixture = fileURLToPath(new URL("./fixtures/i18n/clean.tsx", import.meta.url));
const projectFixture = fileURLToPath(new URL("./fixtures/i18n/project", import.meta.url));
const ALLOWED = validateAllowlist([
  { file: "ui/button.tsx", kinds: ["jsx-attribute"], texts: ["Подсказка"], reason: "fixture" },
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
function quiet() {
  const messages = [];
  const push = (...args) => messages.push(args.join(" "));
  return { messages, log: push, warn: push, error: push };
}
function writeBaseline(config, value) {
  writeFileSync(config.baselinePath, `${JSON.stringify(value, null, 2)}\n`);
}
const EMPTY_BASELINE = { version: 1, cyrillic: [], deadKeys: [] };
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
test("scanner catches fixture kinds and ignores comments/clean source", () => {
  const findings = scanFile(fixture).map((finding) => `${finding.kind}:${finding.text}`);
  assert.deepEqual(findings.sort(), [
    "jsx-attribute:Подсказка",
    "jsx-text:Текст в JSX",
    "string:Проверочная строка",
    "template:Шаблон без подстановки",
  ]);
  assert.deepEqual(scanFile(cleanFixture), []);
});
test("fails closed when a project config is missing", (t) => {
  const config = makeProject(t);
  rmSync(config.projects[0]);
  assert.throws(() => scanProject(config, []), /missing project config/);
});
test("scans packages/ui and packages/i18n outside the catalog", (t) => {
  const config = makeProject(t);
  const findings = scanProject(config, []).actionable.map((f) => `${f.file}:${f.text}`);
  assert.ok(findings.includes("ui/button.tsx:Кнопка"));
  assert.ok(findings.includes("ui/button.tsx:Подсказка"));
  assert.ok(findings.includes("i18n/fallback.ts:Запасной текст"));
  assert.ok(!findings.some((finding) => finding.includes("catalog/ru.ts")));
});
test("allowlist matches file+kind+text and index strips only html-text", (t) => {
  const config = makeProject(t);
  config.allowlist = ALLOWED;
  assert.deepEqual(scanProject(config, ALLOWED).actionable, []);
  const buttonPath = join(config.root, "ui/button.tsx");
  writeFileSync(buttonPath, readFileSync(buttonPath, "utf8").replace("Кнопка", "КнопкаНовая"));
  assert.ok(scanProject(config, ALLOWED).actionable.some((f) => f.text === "КнопкаНовая"));
  const notHtml = validateAllowlist([
    { file: "index.html", kinds: ["string"], texts: ["Тестовый заголовок"], reason: "probe" },
  ]);
  assert.ok(indexHtmlFindings(config, notHtml).some((f) => f.text.includes("Тестовый заголовок")));
});
test("new violation and count growth fail the gate", (t) => {
  const config = makeProject(t);
  assert.equal(runCheck(["--init-baseline"], config, quiet()).exitCode, 0);
  const buttonPath = join(config.root, "ui/button.tsx");
  writeFileSync(
    buttonPath,
    readFileSync(buttonPath, "utf8").replace("{label}Кнопка", "{label}Кнопка<span>Кнопка</span>"),
  );
  const probe = quiet();
  assert.equal(runCheck([], config, probe).exitCode, 1);
  assert.match(probe.messages.join("\n"), /\(\+count\)/);
});
test("baseline init/update is idempotent, prunes, and refuses to mask", (t) => {
  const config = makeProject(t);
  assert.equal(runCheck(["--update-baseline"], config, quiet()).exitCode, 1);
  assert.equal(runCheck(["--init-baseline"], config, quiet()).exitCode, 0);
  const firstHash = hash(config.baselinePath);
  assert.equal(runCheck(["--update-baseline"], config, quiet()).exitCode, 0);
  assert.equal(hash(config.baselinePath), firstHash);
  assert.equal(runCheck(["--init-baseline"], config, quiet()).exitCode, 1);
  writeFileSync(join(config.root, "ui/new.ts"), 'export const value = "Секрет";\n');
  const before = readFileSync(config.baselinePath, "utf8");
  const probe = quiet();
  assert.equal(runCheck(["--update-baseline"], config, probe).exitCode, 1);
  assert.match(probe.messages.join("\n"), /refusing to mask/);
  assert.equal(readFileSync(config.baselinePath, "utf8"), before);
  rmSync(join(config.root, "ui/new.ts"));
  writeFileSync(join(config.root, "i18n/fallback.ts"), 'export const fallback = "plain";\n');
  assert.equal(runCheck(["--update-baseline"], config, quiet()).exitCode, 0);
  assert.ok(!readFileSync(config.baselinePath, "utf8").includes("Запасной текст"));
});
test("missing and dead keys fail the gate", (t) => {
  const config = makeProject(t);
  writeBaseline(config, EMPTY_BASELINE);
  writeFileSync(
    config.catalogPath,
    'export const ru = { "probe.ok": "Готово", "probe.dead": "Мёртвый" } as const;\n',
  );
  writeFileSync(
    join(config.root, "ui/missing.ts"),
    'declare function t(key: string): string; export const value = t("probe.missing");\n',
  );
  const probe = quiet();
  assert.equal(runCheck([], config, probe).exitCode, 1);
  assert.match(probe.messages.join("\n"), /missing keys: probe\.missing/);
  assert.match(probe.messages.join("\n"), /dead keys: probe\.dead/);
  assert.equal(runCheck(["--update-baseline"], config, quiet()).exitCode, 1);
});
test("allowlist requires texts+kinds", () => {
  assert.throws(
    () => validateAllowlist([{ file: "x.ts", kinds: ["string"], reason: "r" }]),
    /texts/,
  );
  assert.throws(() => validateAllowlist([{ file: "x.ts", texts: ["x"], reason: "r" }]), /kinds/);
  assert.throws(() => validateAllowlist([{ file: "x.ts" }]), /without reason/);
});
