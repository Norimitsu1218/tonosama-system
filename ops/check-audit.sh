#!/usr/bin/env sh
set -eu

BASELINE_PATH="ops/audit-baseline.json"

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

if [ ! -f "${BASELINE_PATH}" ]; then
  fail "${BASELINE_PATH} is missing." "Run: npm audit --json > /tmp/audit.json and create ${BASELINE_PATH} with schemaVersion/generatedAt/rules."
fi

node <<'NODE'
const fs = require("node:fs");
const { execSync } = require("node:child_process");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

const baselinePath = "ops/audit-baseline.json";
let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
} catch {
  fail("audit baseline is not valid JSON.", "Fix JSON syntax in ops/audit-baseline.json.");
}

if (typeof baseline.schemaVersion !== "number") {
  fail("audit baseline schemaVersion is missing.", "Set schemaVersion:number in ops/audit-baseline.json.");
}
if (typeof baseline.generatedAt !== "string") {
  fail("audit baseline generatedAt is missing.", "Set generatedAt ISO string in ops/audit-baseline.json.");
}
if (!Array.isArray(baseline.rules)) {
  fail("audit baseline rules must be an array.", "Set ops/audit-baseline.json rules to an array.");
}

for (const entry of baseline.rules) {
  if (
    !entry ||
    typeof entry.package !== "string" ||
    typeof entry.advisory !== "string" ||
    typeof entry.severity !== "string" ||
    typeof entry.reason !== "string" ||
    typeof entry.expiresAt !== "string"
  ) {
    fail(
      "audit baseline entry shape is invalid.",
      "Each rule needs package, advisory, severity, reason, expiresAt."
    );
  }
  if (entry.severity.toLowerCase() === "critical") {
    fail(
      "critical severity is not allowed in baseline.",
      "Fix/remove critical vulnerabilities instead of suppressing them."
    );
  }
}

const baselineMap = new Map();
for (const entry of baseline.rules) {
  baselineMap.set(`${entry.package}|${entry.advisory}|${entry.severity}`, entry);
}

let auditRaw = "";
try {
  auditRaw = execSync("npm audit --json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch (error) {
  const stdout = typeof error?.stdout === "string" ? error.stdout : "";
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const candidate = stdout.trim().length > 0 ? stdout : stderr;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed?.message && !parsed?.vulnerabilities) {
      fail(
        `npm audit request failed: ${parsed.message}`,
        "Check network/DNS to registry.npmjs.org, then rerun audit."
      );
    }
    auditRaw = candidate;
  } catch {
    fail("npm audit failed and returned non-JSON output.", "Run npm audit --json locally and inspect failure.");
  }
}

let audit;
try {
  audit = JSON.parse(auditRaw);
} catch {
  fail("npm audit output is not valid JSON.", "Run npm audit --json and inspect output.");
}

const findings = [];
const vulnerabilities = audit?.vulnerabilities ?? {};
for (const [pkg, info] of Object.entries(vulnerabilities)) {
  const row = info || {};
  const via = Array.isArray(row.via) ? row.via : [];
  const defaultSeverity = typeof row.severity === "string" ? row.severity : "unknown";
  if (via.length === 0) {
    findings.push({ package: pkg, vulnId: `pkg:${pkg}`, severity: defaultSeverity });
    continue;
  }
  for (const item of via) {
    if (typeof item === "string") {
      findings.push({ package: pkg, vulnId: item, severity: defaultSeverity });
      continue;
    }
    if (item && typeof item === "object") {
      const vulnId =
        typeof item.source === "number"
          ? `source:${item.source}`
          : typeof item.url === "string"
            ? item.url
            : typeof item.title === "string"
              ? item.title
              : `pkg:${pkg}`;
      const severity = typeof item.severity === "string" ? item.severity : defaultSeverity;
      findings.push({ package: pkg, vulnId, severity });
    }
  }
}

const uniq = new Map();
for (const row of findings) {
  const key = `${row.package}|${row.vulnId}|${row.severity}`;
  if (!uniq.has(key)) {
    uniq.set(key, row);
  }
}

const today = new Date().toISOString().slice(0, 10);
const unsuppressed = [];
const expired = [];
for (const row of uniq.values()) {
  const key = `${row.package}|${row.vulnId}|${row.severity}`;
  const baselineEntry = baselineMap.get(key);
  if (!baselineEntry) {
    unsuppressed.push(row);
    continue;
  }
  if (baselineEntry.expiresAt < today) {
    expired.push({ ...row, expiresAt: baselineEntry.expiresAt });
  }
}

if (unsuppressed.length > 0 || expired.length > 0) {
  if (unsuppressed.length > 0) {
    process.stderr.write("New vulnerabilities not in baseline:\n");
    for (const row of unsuppressed) {
      process.stderr.write(`- ${row.package} | ${row.severity} | ${row.vulnId}\n`);
    }
  }
  if (expired.length > 0) {
    process.stderr.write("Expired baseline vulnerabilities:\n");
    for (const row of expired) {
      process.stderr.write(`- ${row.package} | ${row.severity} | ${row.vulnId} | expired=${row.expiresAt}\n`);
    }
  }
  fail(
    "audit baseline check failed.",
    "Update dependencies or baseline entries with valid reason and expiresAt."
  );
}

process.stdout.write("CI preflight: audit baseline check passed.\n");
NODE
