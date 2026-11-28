import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findKeyIssues, scanFile } from "./check-i18n.mjs";

const fixture = fileURLToPath(new URL("./fixtures/i18n/cyrillic.tsx", import.meta.url));
const cleanFixture = fileURLToPath(new URL("./fixtures/i18n/clean.tsx", import.meta.url));

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

test("plural variants are covered by production usage of their base key", () => {
  const { deadKeys } = findKeyIssues(
    ["cart.item", "cart.item_one", "cart.item_few", "cart.item_many"],
    new Set(["cart.item"]),
    new Set(),
  );

  assert.deepEqual(deadKeys, []);
});
