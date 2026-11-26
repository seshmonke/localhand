import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = [
  /(^|\/)\.env($|\.)(?!example$)/,
  /(^|\/)(id_rsa|id_ed25519|kubeconfig)(\.|$)/,
  /\.(pem|key|p12|pfx|jks|keystore|sqlite|sqlite3|db|dump|bak|backup|har)$/i,
  /(^|\/)(secrets|\.secrets|\.aws|\.gcp|\.azure|dumps|backups|docs\/private|docs\/finance|notes|research|\.scrum\/questions|\.scrum\/private)(\/|$)/,
];

const contentRules = [
  {
    label: "private key",
    pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  {
    label: "GitHub token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "OpenAI/DeepSeek key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    label: "database URL with password",
    pattern: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@(?!localhost|127\.0\.0\.1|db[:/])/,
  },
  {
    label: "absolute local path",
    pattern: /(\/home\/[A-Za-z0-9._-]+\/|\/Users\/[A-Za-z0-9._-]+\/)/,
  },
  {
    label: "real-looking phone",
    pattern: /(?<!\d)(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/,
  },
  {
    label: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  },
];

const allowedEmailDomains = ["example.com", "example.org", "users.noreply.github.com"];
const skipContent = new Set(["pnpm-lock.yaml"]);

const violations = [];

for (const file of tracked) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) {
    violations.push(`${file}: forbidden path`);
    continue;
  }
  if (skipContent.has(file)) continue;

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;

  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const rule of contentRules) {
      if (!rule.pattern.test(line)) continue;
      if (rule.label === "email") {
        const match = line.match(rule.pattern)?.[0] ?? "";
        const domain = match.split("@")[1] ?? "";
        if (allowedEmailDomains.includes(domain)) continue;
      }
      violations.push(`${file}:${index + 1}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Public repo check failed:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`Public repo check: ${tracked.length} tracked files, no secrets/PII patterns found`);
