<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Add static tests for the Step 1a apply and success path
- **Outcome:** tests/workflows/split-checkpoint-static.test.js has passing assertions that the skill's accept branch calls feature-split.js apply with --features-root and --parent only after an explicit accept. It also checks that the skill reports the parent prefix and the created child IDs and folders and stops without Gate 1.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01, US-03-TASK-BE-02, US-02-TASK-TEST-03
- **Acceptance criteria:** AC-11, AC-13
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin Step 1a apply and success path in static tests

**Implementation notes:**

Modify one file: `tests/workflows/split-checkpoint-static.test.js`. It already exists from US-01-TASK-TEST-04 (and was extended by US-02-TASK-TEST-03). If it is missing, stop and report that instead of creating it. Add one new `describe` block. Do not change the existing hook tests or the anchor constants.

Runner: AGENTS.md specifies Jest (`describe`/`test`/`expect`, run via `npm test`), so use Jest globals and `expect`. The Tech-Spec draft shows `node:test`, which conflicts with AGENTS.md. Follow the project convention, and have the host confirm it against `tests/scripts/feature-split-check-size.test.js` at Gate 1.

This task reads only SKILL.md. It uses no `pm-phase1.js` anchors, so the anchor placeholders do not block it. The Step 1a wording comes from US-03-TASK-BE-01 and BE-02. If the skill uses different wording, fix the regexes to match the skill text. Do not change the skill in this task.

Locate the Step 1a section (from its heading up to the Step 2 / Gate 1 heading). The "decision" point is the options line that offers accept, edit and reject. Assert that the `feature-split.js apply` call comes after that line, which pins "only after an explicit accept". Assert that the apply call carries `--features-root` and `--parent` on the same line or within the following text.

```javascript
// Appended to tests/workflows/split-checkpoint-static.test.js
'use strict';

const fs   = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '..', '..', 'src', 'claude', 'skills', 'implement-feature', 'SKILL.md');
const skillSrc = fs.readFileSync(SKILL_PATH, 'utf8');

// Step 1a section: from its heading up to the Step 2 (Gate 1) heading.
function step1aSection(src) {
  const start = src.search(/Step 1a/);
  const end = start >= 0 ? src.indexOf('Step 2', start + 1) : -1;
  return start >= 0 && end > start ? src.slice(start, end) : '';
}
const step1a = step1aSection(skillSrc);
const applyAt = step1a.search(/feature-split\.js\s+apply/);
const decisionAt = step1a.search(/accept[^\n]*edit[^\n]*reject/i);

describe('Step 1a apply and success path (SKILL.md)', () => {
  test('Step 1a section is present and precedes Gate 1', () => {
    expect(step1a).not.toBe('');
  });

  test('apply is invoked only after the accept/edit/reject decision point', () => {
    expect(decisionAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeGreaterThan(decisionAt);
  });

  test('apply call passes --features-root and --parent', () => {
    expect(applyAt).toBeGreaterThanOrEqual(0);
    const call = step1a.slice(applyAt, applyAt + 300);
    expect(call).toMatch(/--features-root/);
    expect(call).toMatch(/--parent/);
  });

  test('success report names the parent prefix', () => {
    const after = step1a.slice(applyAt);
    expect(after).toMatch(/parent[^\n]*prefix|prefix[^\n]*parent/i);
  });

  test('success report names the created child IDs and folders', () => {
    const after = step1a.slice(applyAt);
    expect(after).toMatch(/child[^\n]*\bIDs?\b/i);
    expect(after).toMatch(/folder/i);
  });

  test('success stops for the parent without reaching Gate 1', () => {
    const after = step1a.slice(applyAt);
    expect(after).toMatch(/stop[^\n]*parent/i);
    expect(after).toMatch(/(no|without)[^\n]*Gate 1/i);
  });
});
```

**Describe title (required).** Name the describe block of this task exactly `Step 1a apply and success path (SKILL.md)` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('Step 1a apply and success path (SKILL.md)'" tests/workflows/split-checkpoint-static.test.js
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
npm test
```