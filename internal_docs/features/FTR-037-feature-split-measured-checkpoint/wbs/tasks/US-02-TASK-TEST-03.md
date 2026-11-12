<a id="task-US-02-TASK-TEST-03"></a>
### US-02-TASK-TEST-03

- **Task ID:** US-02-TASK-TEST-03
- **Title:** Extend static tests to pin the Step 1a skill text
- **Outcome:** tests/workflows/split-checkpoint-static.test.js has passing skill assertions that Step 1a sits before Gate 1 and names all four statuses. They also check that unavailable is a plain stop naming count and reason, that a missing or non-JSON result is treated as unavailable, that Keywords are derived by the main-loop agent, and that the edit loop refuses fewer than minChildren and re-presents the proposal. They further check that accept runs apply, that reject stores nothing, that the apply call is in the skill and not the workflow, and that no threshold number is hard-coded.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-07, US-01-TASK-TEST-04
- **Acceptance criteria:** AC-06, AC-16, AC-19, AC-22
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin implement-feature Step 1a text with static tests

**Implementation notes:**

Scope. This task adds skill-text assertions to the existing `tests/workflows/split-checkpoint-static.test.js`. That file is created by US-01-TASK-TEST-04, which is a dependency, so do not create it. Keep the hook assertions from TEST-04 unchanged. Add a new `describe` block that reads `src/claude/skills/implement-feature/SKILL.md` (the `skillSrc` constant already exists in the file). Do not modify any production file. Do not depend on BE-04 to BE-07 being absent: the skill text must already contain their wording when this runs.

Runner. The Tech-Spec excerpt's sketch uses `node:test`, but AGENTS.md says the project uses Jest, with `describe`/`test`/`expect` globals and `'use strict'` at the top. Use Jest, and match the sibling `tests/scripts/feature-split-check-size.test.js` if it differs. Confirm this before writing.

Section extraction. Scope each assertion to the Step 1a section so that matches elsewhere in the skill cannot satisfy them. The section runs from the Step 1a heading to the next heading of the same or higher level. This assumes SKILL.md uses markdown headings for steps. If it does not, stop and report that instead of guessing.

```javascript
'use strict';
// appended to tests/workflows/split-checkpoint-static.test.js (fs, path, hookSrc, skillSrc already defined by TEST-04)

function sectionOf(headingRe) {
  const m = headingRe.exec(skillSrc);
  if (!m) throw new Error('heading not found: ' + headingRe);
  const level = m[0].match(/^#+/)[0].length;
  const rest = skillSrc.slice(m.index + m[0].length);
  const next = new RegExp('^#{1,' + level + '} ', 'm').exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

describe('implement-feature SKILL.md Step 1a text', () => {
  const step1a = () => sectionOf(/^#{1,6} .*Step 1a\b.*$/m);

  test('Step 1a heading sits before the Gate 1 heading', () => {
    const s1a = /^#{1,6} .*Step 1a\b/m.exec(skillSrc);
    const g1 = /^#{1,6} .*Gate 1\b/m.exec(skillSrc);
    expect(s1a).not.toBeNull();
    expect(g1).not.toBeNull();
    expect(s1a.index).toBeLessThan(g1.index);
  });

  test('Step 1a names all four statuses: passed, skipped, unavailable, split-proposed', () => {
    const s = step1a();
    for (const status of ['passed', 'skipped', 'unavailable', 'split-proposed']) {
      expect(s).toContain(status);
    }
  });

  test('passed and skipped continue to Gate 1 with no prompt', () => {
    const s = step1a();
    expect(s).toMatch(/(passed|skipped)[^\n]*Gate 1/);
    expect(s).toMatch(/no prompt/i);
  });

  test('unavailable is a plain stop naming each count and its reason, not a gate', () => {
    const s = step1a();
    expect(s).toMatch(/unavailable[\s\S]{0,400}?\bcount\b[\s\S]{0,200}?\breason\b/i);
    expect(s).toMatch(/not (a |an )?(gate|approval)/i);
  });

  test('a missing, non-object or non-JSON result is treated as unavailable', () => {
    const s = step1a();
    expect(s).toMatch(/(missing|non-object|non-JSON|not JSON|malformed|unknown)[^\n]*unavailable|unavailable[^\n]*(missing|non-object|non-JSON|not JSON|malformed|unknown)/i);
  });

  test('Keywords are derived by the main-loop agent, not by the script', () => {
    const s = step1a();
    expect(s).toMatch(/derive[^\n]*Keywords|Keywords[^\n]*derive/i);
    expect(s).toMatch(/main[- ]loop/i);
  });

  test('edit loop refuses an edit below minChildren and re-presents the proposal', () => {
    const s = step1a();
    expect(s).toMatch(/minChildren/);
    expect(s).toMatch(/refus/i);
    expect(s).toMatch(/re-?present/i);
    expect(s).toMatch(/fresh explicit accept|fresh[^\n]*accept/i);
  });

  test('accept runs feature-split.js apply with --features-root and --parent', () => {
    const s = step1a();
    expect(s).toMatch(/accept[^\n]*apply/i);
    expect(s).toMatch(/feature-split\.js apply/);
    expect(s).toMatch(/--features-root/);
    expect(s).toMatch(/--parent/);
  });

  test('reject continues to Gate 1 and stores nothing', () => {
    const s = step1a();
    expect(s).toMatch(/reject[^\n]*Gate 1/i);
    expect(s).toMatch(/stores? nothing|writes? nothing/i);
  });

  test('the apply call lives in the skill, not in the workflow', () => {
    expect(skillSrc).toMatch(/feature-split\.js apply/);
    expect(hookSrc).not.toMatch(/feature-split\.js[^\n]*\bapply\b/);
  });

  test('no threshold or minChildren number is hard-coded in the skill', () => {
    expect(skillSrc).not.toMatch(/threshold[^\n]*\b(is|=|:|of)\s*\d+/i);
    expect(skillSrc).not.toMatch(/\b(useCases|acceptanceCriteria|components)\s*(>=|<=|>|<|=)\s*\d+/);
    expect(skillSrc).not.toMatch(/minChildren\s*(=|is|:)\s*\d+/i);
  });
});
```

Open points to surface at Gate 1 (these do not block this task):
- The Tech-Spec excerpt sketch uses `node:test`, but AGENTS.md says Jest. The code above assumes Jest.
- The AC text for AC-06, AC-16, AC-19 and AC-22 is not in the excerpt, so the mapping is provisional.
- The assertions depend on the exact wording that BE-04 to BE-07 write into SKILL.md. If the skill uses different wording (for example "Keywords are set by the agent" instead of "derive"), widen the regex to match the real text. Do not weaken the assertion to a bare keyword match.
- The TEST-04 sketch has `indexOf(null)` for its anchors. That is TEST-04's defect, not this task's, and this task does not rely on it.

**Describe title (required).** Name the describe block of this task exactly `implement-feature SKILL.md Step 1a text` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('implement-feature SKILL.md Step 1a text'" tests/workflows/split-checkpoint-static.test.js
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
npm test
```