'use strict';

/**
 * US-03-T04: Semantic Validator Output Schema Verification
 *
 * Reads a JSON file produced by (or simulating) the validate-work-breakdown-semantic
 * agent and verifies that it conforms to the declared output contract:
 *
 *   {
 *     "valid": boolean,
 *     "findings": [
 *       {
 *         "taskId":       string,
 *         "type":         "hidden_multiplicity"|"scope_creep"|"estimate_incompatible"|"bundled_verifiable"|"other",
 *         "severity":     "error"|"warning",
 *         "blocking":     boolean,
 *         "splitRequired": boolean,
 *         "description":  string
 *       }
 *     ]
 *   }
 *
 * Invariants:
 *   - valid === false  iff  any finding has blocking === true
 *   - severity === "error"   when blocking === true
 *   - severity === "warning" when blocking === false
 *
 * Usage:
 *   node verify-us-03-t04.js <path-to-output.json>
 *
 * Exit 0 = all checks pass; Exit 1 = one or more checks fail.
 */

const fs   = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_TYPES = new Set([
  'hidden_multiplicity',
  'scope_creep',
  'estimate_incompatible',
  'bundled_verifiable',
  'other',
]);

const VALID_SEVERITIES = new Set(['error', 'warning']);

// ─── CLI argument ─────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node verify-us-03-t04.js <path-to-output.json>');
  process.exit(2);
}

const resolved = path.resolve(filePath);

// ─── Report accumulators ─────────────────────────────────────────────────────

const passes   = [];
const failures = [];

function pass(label) {
  passes.push(label);
}

function fail(label, detail) {
  failures.push({ label, detail });
}

// ─── Load and parse the output JSON ──────────────────────────────────────────

let output;
try {
  const raw = fs.readFileSync(resolved, 'utf8');
  output = JSON.parse(raw);
} catch (err) {
  console.error(`FATAL: Cannot read or parse file at ${resolved}`);
  console.error(`       ${err.message}`);
  process.exit(2);
}

// ─── Check 1: top-level "valid" field is a boolean ───────────────────────────

if (typeof output.valid === 'boolean') {
  pass('Check 1 — "valid" is a boolean');
} else {
  fail(
    'Check 1 — "valid" is a boolean',
    `Expected boolean, got: ${JSON.stringify(typeof output.valid)} (value: ${JSON.stringify(output.valid)})`
  );
}

// ─── Check 2: top-level "findings" field is an array ─────────────────────────

if (Array.isArray(output.findings)) {
  pass(`Check 2 — "findings" is an array (${output.findings.length} item(s))`);
} else {
  fail(
    'Check 2 — "findings" is an array',
    `Expected array, got: ${JSON.stringify(typeof output.findings)}`
  );
}

// ─── Per-finding checks (only when findings is an array) ─────────────────────

const findings = Array.isArray(output.findings) ? output.findings : [];

// Check 3: every finding has all 6 required fields with correct types

{
  const REQUIRED_FIELDS = ['taskId', 'type', 'severity', 'blocking', 'splitRequired', 'description'];
  let allPresent = true;

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const label   = finding.taskId ? `finding[${i}] (taskId="${finding.taskId}")` : `finding[${i}]`;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in finding)) {
        fail(
          'Check 3 — every finding has all 6 required fields',
          `${label} is missing field "${field}"`
        );
        allPresent = false;
      }
    }

    // Type-check the boolean fields
    if ('blocking' in finding && typeof finding.blocking !== 'boolean') {
      fail(
        'Check 3 — every finding has all 6 required fields',
        `${label}: "blocking" must be boolean, got ${JSON.stringify(typeof finding.blocking)}`
      );
      allPresent = false;
    }

    if ('splitRequired' in finding && typeof finding.splitRequired !== 'boolean') {
      fail(
        'Check 3 — every finding has all 6 required fields',
        `${label}: "splitRequired" must be boolean, got ${JSON.stringify(typeof finding.splitRequired)}`
      );
      allPresent = false;
    }
  }

  if (allPresent) {
    pass(`Check 3 — every finding has all 6 required fields with correct types`);
  }
}

// Check 4: every finding.type is one of the allowed values

{
  let allValid = true;
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    if (!VALID_TYPES.has(finding.type)) {
      fail(
        'Check 4 — every finding.type is a valid enum value',
        `finding[${i}] (taskId="${finding.taskId}") has type "${finding.type}"; ` +
        `allowed: ${[...VALID_TYPES].join(', ')}`
      );
      allValid = false;
    }
  }
  if (allValid) {
    pass('Check 4 — every finding.type is a valid enum value');
  }
}

// Check 5: every finding.severity is "error" or "warning"

{
  let allValid = true;
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    if (!VALID_SEVERITIES.has(finding.severity)) {
      fail(
        'Check 5 — every finding.severity is "error" or "warning"',
        `finding[${i}] (taskId="${finding.taskId}") has severity "${finding.severity}"`
      );
      allValid = false;
    }
  }
  if (allValid) {
    pass('Check 5 — every finding.severity is "error" or "warning"');
  }
}

// Check 6: valid === false iff any finding has blocking === true

{
  const hasBlockingFinding = findings.some(f => f.blocking === true);
  const validField         = output.valid;

  const expectedValid = !hasBlockingFinding;

  if (typeof validField === 'boolean' && validField === expectedValid) {
    pass(
      `Check 6 — valid === false iff any finding has blocking:true ` +
      `(blocking findings: ${findings.filter(f => f.blocking).length})`
    );
  } else {
    fail(
      'Check 6 — valid === false iff any finding has blocking:true',
      `hasBlockingFinding=${hasBlockingFinding}, so valid should be ${expectedValid}, but got ${JSON.stringify(validField)}`
    );
  }
}

// Check 7: severity === "error" when blocking === true; "warning" when blocking === false

{
  let allConsistent = true;
  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];

    if (finding.blocking === true && finding.severity !== 'error') {
      fail(
        'Check 7 — severity is "error" when blocking:true, "warning" when blocking:false',
        `finding[${i}] (taskId="${finding.taskId}") has blocking:true but severity="${finding.severity}" (expected "error")`
      );
      allConsistent = false;
    }

    if (finding.blocking === false && finding.severity !== 'warning') {
      fail(
        'Check 7 — severity is "error" when blocking:true, "warning" when blocking:false',
        `finding[${i}] (taskId="${finding.taskId}") has blocking:false but severity="${finding.severity}" (expected "warning")`
      );
      allConsistent = false;
    }
  }

  if (allConsistent) {
    pass('Check 7 — severity is "error" when blocking:true, "warning" when blocking:false');
  }
}

// ─── Print report ─────────────────────────────────────────────────────────────

console.log('\n=== Semantic Validator Output — Schema Contract Verification ===\n');
console.log(`File: ${resolved}\n`);

for (const p of passes) {
  console.log(`  PASS  ${p}`);
}

if (failures.length > 0) {
  console.log('');
  for (const f of failures) {
    console.log(`  FAIL  ${f.label}`);
    console.log(`          ${f.detail}`);
  }
  console.log(`\nResult: FAIL — ${failures.length} failure(s), ${passes.length} check(s) passed\n`);
  process.exit(1);
} else {
  console.log(`\nResult: PASS — all ${passes.length} checks passed\n`);
  process.exit(0);
}
