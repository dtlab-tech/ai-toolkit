<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Add static tests pinning the skill checkpoint relay text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js also asserts the skill text. It checks the Mode line, the proposal view contents (children, dependency order, shared parts, flows with reasons, editable Summary and Keywords), the unevaluated note, the in-memory-only record, and the stop on root failure or RECORD_INVALID. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-05, US-01-TASK-TEST-01
- **Acceptance criteria:** AC-04, AC-05, AC-06, AC-07, AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin define-feature skill checkpoint relay text with static tests

**Implementation notes:**

This task extends the existing file `tests/cli/define-feature-checkpoint-text.test.js` (created by US-01-TASK-TEST-01). It adds a skill-text block and leaves TEST-01's agent blocks untouched. The file already reads `SKILL` into a `skill` string at module top; reuse it.

Gaps to flag before writing:
- The wording of AC-04 and AC-05 is not in the excerpt. The skill-side checks below map to the Tech-Spec `Addresses` column for the test file (AC-06, AC-07, AC-12, AC-13), and to the skill component (AC-06, AC-07, AC-09 to AC-14, AC-16, AC-17). Confirm the AC-04 and AC-05 mapping against the AC text.
- Exact sentence wording in SKILL.md is not fixed by the design. Assertions key on stable anchors: `Mode:`, `dependency order`, `shared`, `flow`, `reason`, `Summary`, `Keywords`, `edit`, `unevaluated`, `in memory`, `resolve-features-root`, `RECORD_INVALID`, `stop`/`report`. If the skill edit drops one of these anchors, the test fails by design.
- The runner is Jest, as `AGENTS.md` specifies (`describe`/`test`/`expect`).

Use a windowed check rather than an unbounded `[\s\S]*` so that an anchor only passes when the stop/report wording sits near the anchor, not anywhere later in the file. Add this helper below the existing `at` helper:

```js
// True when a line containing `anchor` has a line matching `re` within `window` lines after it.
const nearby = (text, anchor, re, window = 5) => {
  const lines = text.split('\n');
  return lines.some((line, i) =>
    line.includes(anchor) &&
    lines.slice(i, i + window + 1).some(l => re.test(l)));
};
```

Append this block after the agent `describe` blocks:

```js
describe('skill: checkpoint relay text (UC-02, BR-01, BR-02, BR-03)', () => {
  test('passes a Mode line in the spawn prompt', () => {
    expect(skill).toMatch(/\bMode:/);
  });

  test('shows the proposal with children, dependency order and shared parts', () => {
    expect(skill).toMatch(/dependency order/i);
    expect(skill).toMatch(/shared/i);
  });

  test('lists each flow with a one-line reason', () => {
    expect(nearby(skill, 'flow', /reason/i)).toBe(true);
  });

  test('shows Summary and Keywords as editable items per child', () => {
    expect(nearby(skill, 'Summary', /edit/i)).toBe(true);
    expect(nearby(skill, 'Keywords', /edit/i)).toBe(true);
  });

  test('names each unevaluated signal to the user', () => {
    expect(skill).toMatch(/unevaluated/);
  });

  test('keeps the grilling record in memory and never on disk', () => {
    expect(skill).toMatch(/in memory/i);
  });

  test('stops and reports when root resolution fails', () => {
    expect(nearby(skill, 'resolve-features-root', /stop|report/i)).toBe(true);
  });

  test('stops and reports on RECORD_INVALID', () => {
    expect(nearby(skill, 'RECORD_INVALID', /stop|report/i)).toBe(true);
  });
});
```

Checks against the design:
- The `nearby` checks run on the same line or the next five lines. This is a bounded presence check, not a full semantic check. It is enough to catch a silent removal of the anchor.
- Do not change TEST-01's assertions or its `describe` names.
- The file must still pass `npm test`, which runs with `--bail`, so any failing assertion stops the suite at the first failure.

**Describe title (required).** Name the describe block of this task exactly `skill checkpoint relay text` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('skill checkpoint relay text'" tests/cli/define-feature-checkpoint-text.test.js
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```