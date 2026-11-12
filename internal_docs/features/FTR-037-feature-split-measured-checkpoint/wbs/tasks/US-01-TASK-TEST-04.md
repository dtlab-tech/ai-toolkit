<a id="task-US-01-TASK-TEST-04"></a>
### US-01-TASK-TEST-04

- **Task ID:** US-01-TASK-TEST-04
- **Title:** Add static tests pinning the pm-phase1 check-size hook
- **Outcome:** tests/workflows/split-checkpoint-static.test.js exists with passing hook assertions: run-asset call form with feature-split.js, --feature-dir and --prefix; check-size positioned after the validation loop and before the Gate 1 digest; split_checkpoint in the return; guarded JSON parse mapping failures to unavailable; no apply call or prompt in the workflow.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-08
- **Acceptance criteria:** AC-17, AC-18, AC-22
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add static tests for pm-phase1 check-size hook

**Implementation notes:**

**Scope.** Create one new file, `tests/workflows/split-checkpoint-static.test.js`. Change no production code. The file is static: it reads `src/claude/workflows/pm-phase1.js` as text and asserts on it. It runs no workflow and makes no LLM calls.

**Scope exclusions from the Tech-Spec excerpt.** The component excerpt also describes SKILL.md Step 1a assertions (`implement-feature/SKILL.md`, AC-19, D-04/D-10/D-11). Those are not in this task's outcome or acceptance criteria, so do not add them here. The Tech-Spec excerpt's `unavailable never treated as pass` check is also skill-side and is excluded for the same reason.

**Runner (decision, deviates from the excerpt).** The excerpt's sample uses `node:test`. AGENTS.md specifies Jest (`describe`/`test`/`expect` globals, run by `npm test`). Use Jest. The excerpt also does not name the runner used by the sibling `tests/scripts/feature-split-check-size.test.js`, which may not exist yet. If that sibling file exists and uses a different runner, match it and say so in the commit body.

**Open gap: validation-loop anchor.** The excerpt does not give the identifier that marks the validation loop in `pm-phase1.js`. The Gate 1 digest anchor is concrete: the Tech-Spec says the hook sits "before the `docsDigest` computation", so use `docsDigest`. Before writing the ordering test, read `pm-phase1.js` and find the real validation-loop identifier. This is reading the file under test, not exploring the wider tree. If no clear identifier exists, stop and report it. Do not guess one. Do not use `null` as an anchor: `indexOf(null)` searches for the string `"null"` and makes the assertion meaningless.

**Open gap: acceptance-criteria text.** The text of AC-17, AC-18 and AC-22 is not in the excerpt. The mapping above comes from the component `Addresses` column and is provisional until the Requirements text is checked.

**Algorithm (Jest, AGENTS.md pattern).** Read the source once at module load. Locate the `c.command(['run-asset', ...])` call with a regex that spans lines, so the `check-size` argument is inside the same call. Compare its index with the two anchors.

```javascript
'use strict';

const fs   = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'workflows', 'pm-phase1.js');
const hookSrc   = fs.readFileSync(HOOK_PATH, 'utf8');

// Real identifier for the validation loop, filled in after reading pm-phase1.js.
const VALIDATION_LOOP_ANCHOR = '<REAL_VALIDATION_LOOP_IDENTIFIER>';
const GATE1_DIGEST_ANCHOR    = 'docsDigest';

// Matches the c.command call whose argv is run-asset ... check-size, across lines.
const CHECK_SIZE_CALL = /c\.command\(\s*\[\s*'run-asset'[\s\S]*?'check-size'/;

describe('pm-phase1 check-size hook: call form', () => {
  test('invokes check-size via c.command with run-asset on scripts/feature-split.js', () => {
    expect(hookSrc).toMatch(CHECK_SIZE_CALL);
    expect(hookSrc).toMatch(/'scripts\/feature-split\.js'/);
  });

  test('passes --feature-dir and --prefix to check-size', () => {
    expect(hookSrc).toMatch(/'--feature-dir'/);
    expect(hookSrc).toMatch(/'--prefix'/);
  });
});

describe('pm-phase1 check-size hook: position', () => {
  test('check-size runs after the validation loop and before the Gate 1 digest', () => {
    const loopAt   = hookSrc.indexOf(VALIDATION_LOOP_ANCHOR);
    const callAt   = hookSrc.search(CHECK_SIZE_CALL);
    const digestAt = hookSrc.indexOf(GATE1_DIGEST_ANCHOR);
    expect(loopAt).toBeGreaterThanOrEqual(0);
    expect(callAt).toBeGreaterThan(loopAt);
    expect(digestAt).toBeGreaterThan(callAt);
  });
});

describe('pm-phase1 check-size hook: return and parsing', () => {
  test('returns split_checkpoint in the workflow result object', () => {
    expect(hookSrc).toMatch(/\bsplit_checkpoint\s*[:,}]/);
  });

  test('parses check-size output inside try/catch and maps failure to unavailable', () => {
    expect(hookSrc).toMatch(/try\s*\{[\s\S]*?JSON\.parse\([\s\S]*?\}\s*catch/);
    expect(hookSrc).toMatch(/'unavailable'/);
  });
});

describe('pm-phase1 check-size hook: restrictions', () => {
  test('never calls apply', () => {
    expect(hookSrc).not.toMatch(/feature-split\.js[^\n]*\bapply\b/);
  });

  test('never prompts the user', () => {
    expect(hookSrc).not.toMatch(/\b(readline|prompt|confirm)\s*\(/);
  });
});
```

**Notes on the sketch.**
- Each assertion checks one behavior, per AGENTS.md. Test names describe the scenario in plain English.
- The `'apply'` literal check is deliberately omitted. A bare `'apply'` string could appear elsewhere in `pm-phase1.js` and cause a false failure. The `feature-split.js ... apply` pattern is the precise check.
- If the regex `try\s*\{...JSON\.parse...\}\s*catch` fails on the real source because the parser is factored into a helper, widen the search to the helper's name and keep the `try`/`catch` requirement. Do not drop it.
- The file fails loudly until the real validation-loop anchor is substituted. That is intended.

**Estimate rationale.** One file, about 60 lines, with reads of one source file and one test run. About 10 minutes.

**Verification commands:**

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
node --check tests/workflows/split-checkpoint-static.test.js
```

```
npm test
```