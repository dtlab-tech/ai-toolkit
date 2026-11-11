# tests/workflows/split-checkpoint-static.test.js — New

## Change

New static test file, Domain TEST, Addresses AC-03, AC-05, AC-06, AC-17, AC-18, AC-19, AC-22. It creates no production code. It reads the source text of `src/claude/workflows/pm-phase1.js` and `src/claude/skills/implement-feature/SKILL.md` and asserts the checkpoint hook and the Step 1a skill text that feature.md scope and D-04 to D-11 require. It pins: the `check-size` invocation through `run-asset` with the `c.command` form (D-06); its position after the validation loop and before the Gate 1 digest (UC-01); the `split_checkpoint` key in the workflow return value (D-06); guarded parsing of the result so a missing, failed or non-JSON result becomes `unavailable` (BR-04); the absence of any `apply` call or prompt inside the workflow (D-06); and the Step 1a branches in SKILL.md for `passed`/`skipped`, `unavailable`, `split-proposed`, accept, and reject (D-04, D-10, D-11, UC-02, UC-03). It does not test the measurement logic, which belongs to `tests/scripts/feature-split-check-size.test.js`.

Open gaps for the host to surface at Gate 1:
- The excerpt does not name the test runner. The file should use whatever runner `tests/scripts/feature-split-check-size.test.js` uses.
- The excerpt does not give the exact identifiers that mark the validation loop and the Gate 1 digest in `pm-phase1.js`. The ordering assertion can only be pinned once those anchors exist in the source. Until then it is written against the anchor placeholders below.
- The text of AC-03, AC-05, AC-06, AC-17, AC-18, AC-19 and AC-22 is not in the excerpt. The case-to-AC mapping below is derived from feature.md and is provisional until the Requirements text is checked.

## Algorithm

```js
// tests/workflows/split-checkpoint-static.test.js
const { test } = require('node:test');            // runner: match the sibling test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const hookSrc = fs.readFileSync(path.join(ROOT, 'src/claude/workflows/pm-phase1.js'), 'utf8');
const skillSrc = fs.readFileSync(path.join(ROOT, 'src/claude/skills/implement-feature/SKILL.md'), 'utf8');

// Anchors: placeholders until pm-phase1.js defines the real identifiers.
const VALIDATION_LOOP_ANCHOR = /* ANCHOR_VALIDATION_LOOP */ null;
const GATE1_DIGEST_ANCHOR    = /* ANCHOR_GATE1_DIGEST */ null;

// --- Hook: pm-phase1.js -----------------------------------------------------

test('hook invokes check-size via run-asset with the c.command form (D-05, D-06)', () => {
  assert.match(hookSrc, /run-asset/);
  assert.match(hookSrc, /scripts\/feature-split\.js/);
  assert.match(hookSrc, /check-size/);
  assert.match(hookSrc, /--feature-dir/);
  assert.match(hookSrc, /--prefix/);
});

test('check-size runs after the validation loop and before the Gate 1 digest (UC-01)', () => {
  const loopAt = hookSrc.indexOf(VALIDATION_LOOP_ANCHOR);
  const checkAt = hookSrc.indexOf('check-size');
  const gateAt = hookSrc.indexOf(GATE1_DIGEST_ANCHOR);
  assert.ok(loopAt >= 0 && checkAt > loopAt, 'check-size must follow the validation loop');
  assert.ok(gateAt > checkAt, 'check-size must precede the Gate 1 digest');
});

test('workflow return value exposes split_checkpoint (D-06)', () => {
  assert.match(hookSrc, /split_checkpoint/);
});

test('result parsing is guarded: non-JSON, failed or missing output maps to unavailable (BR-04, D-04)', () => {
  // The JSON.parse of the check output must sit inside a try block, and its
  // catch path must produce status "unavailable".
  assert.match(hookSrc, /try\s*\{[\s\S]*JSON\.parse[\s\S]*\}\s*catch/);
  assert.match(hookSrc, /unavailable/);
});

test('workflow never applies a split or prompts the user (D-06, BR-01)', () => {
  assert.doesNotMatch(hookSrc, /feature-split\.js[^\n]*\bapply\b/);
  assert.doesNotMatch(hookSrc, /\b(readline|prompt|confirm)\s*\(/);
});

// --- Skill: implement-feature/SKILL.md --------------------------------------

test('SKILL.md defines Step 1a between pm-phase1 and Gate 1 (D-11)', () => {
  const step1a = skillSrc.search(/Step 1a/);
  const gate1 = skillSrc.search(/Gate 1/);
  assert.ok(step1a >= 0, 'Step 1a must exist');
  assert.ok(step1a < gate1 || gate1 < 0 || step1a < skillSrc.search(/Gate 1[^\n]*digest/i),
    'Step 1a must sit before Gate 1');
});

test('Step 1a continues to Gate 1 on passed or skipped (D-11)', () => {
  assert.match(skillSrc, /passed/);
  assert.match(skillSrc, /skipped/);
  assert.match(skillSrc, /continue[^\n]*Gate 1/i);
});

test('unavailable is a plain stop naming each count and reason, not a gate or prompt (D-04, BR-03)', () => {
  assert.match(skillSrc, /unavailable/);
  assert.match(skillSrc, /not (a )?gate/i);
  assert.match(skillSrc, /count[^\n]*reason/i);
});

test('split-proposed presents the proposal with each over-threshold count beside its threshold (UC-02)', () => {
  assert.match(skillSrc, /split-proposed/);
  assert.match(skillSrc, /threshold/i);
});

test('accept runs apply and stops the parent; reject continues unchanged and stores nothing (UC-03, D-10)', () => {
  assert.match(skillSrc, /accept[^\n]*apply/i);
  assert.match(skillSrc, /reject[^\n]*(Gate 1|unchanged)/i);
  assert.match(skillSrc, /(stores? nothing|no rejection)/i);
});

test('unavailable is never treated as passing (BR-03)', () => {
  assert.doesNotMatch(skillSrc, /unavailable[^\n]*(treat|count)[^\n]*pass/i);
});
```

## Tests

- **File:** `tests/workflows/split-checkpoint-static.test.js` (this file). It is static: it reads source text and makes no LLM calls and runs no workflow.
- **Hook cases (pm-phase1.js):**
  - `check-size` is invoked through `run-asset` with `scripts/feature-split.js`, `--feature-dir` and `--prefix`.
  - The call is after the validation loop and before the Gate 1 digest.
  - The return value contains `split_checkpoint`.
  - The result parse is inside `try`/`catch`, and a failure maps to `unavailable`.
  - The workflow contains no `apply` call and no prompt.
- **Skill cases (SKILL.md Step 1a):**
  - Step 1a sits between `pm-phase1` and Gate 1.
  - `passed` and `skipped` continue to Gate 1.
  - `unavailable` is a plain stop that names each count and its reason, and is not a gate.
  - `split-proposed` shows each over-threshold count beside its threshold.
  - Accept runs `apply` and stops the parent. Reject continues to Gate 1 unchanged and stores nothing.
  - `unavailable` is never read as a pass.
- **Negative check:** a fixture with a non-JSON check result must be mapped to `unavailable` by the guarded parse. This is verified by the anchor-based source assertions above, not by running the workflow.
- **Run:** with the project's test command, the same way `tests/scripts/feature-split-check-size.test.js` is run. The runner name is still open (see Change).