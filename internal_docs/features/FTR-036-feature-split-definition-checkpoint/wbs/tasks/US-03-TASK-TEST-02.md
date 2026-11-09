<a id="task-US-03-TASK-TEST-02"></a>
### US-03-TASK-TEST-02

- **Task ID:** US-03-TASK-TEST-02
- **Title:** Add static tests pinning skill late-child text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js asserts the skill late-child text: the Mode late-child line, --epic routing, the child title and purpose question, the single-child proposal relay, no standalone fallback on reject, no register call, and refusal when the epic is missing or its status is not epic. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-05, US-03-TASK-TEST-01
- **Acceptance criteria:** AC-13, AC-14, AC-16, AC-17, AC-18
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin skill late-child text in static tests

**Implementation notes:**

This task extends the existing file `tests/cli/define-feature-checkpoint-text.test.js`. That file is created by US-01-TASK-TEST-01 and extended by US-01-TASK-TEST-02, US-02-TASK-TEST-01/02 and US-03-TASK-TEST-01. Do not create a second file and do not rename existing `describe` blocks. Append one new `describe` block for the skill late-child text. Reuse the `skill` constant already read from `src/claude/skills/define-feature/SKILL.md` at the top of the file.

Limits of this plan: the excerpt gives no exact sentence wording for the skill's late-child section. The anchors below are taken from the task outcome and from the US-03-TASK-BE-04 and US-03-TASK-BE-05 descriptions. Before committing, read the merged `SKILL.md` late-child section and confirm each anchor matches its wording. If a wording differs, change the regex to the real stable literal. Do not loosen an assertion until it passes. The Tech-Spec excerpt has no text for AC-14, AC-16, AC-17 or AC-18, so the AC-to-test mapping is unverified until the AC text is supplied.

Add this block after the last existing `describe` in the file, using the file's existing `'use strict'`, `fs`/`path` setup and Jest globals:

```js
describe('skill: late-child mode text (UC-03, BE-04, BE-05)', () => {
  test('spawn prompt carries a Mode late-child line', () =>
    expect(skill).toMatch(/Mode:?\s*late-child/));

  test('routes a request naming an epic FTR-ID through --epic', () =>
    expect(skill).toMatch(/--epic/));

  test('asks the child title and one-line purpose in the main loop', () => {
    expect(skill).toMatch(/child[^\n]{0,60}(title|name)/i);
    expect(skill).toMatch(/purpose/i);
  });

  test('relays a single-child proposal with the previous last child as dependency', () => {
    expect(skill).toMatch(/single[- ]child|one child/i);
    expect(skill).toMatch(/previous last child/i);
  });

  test('reject creates nothing and has no standalone fallback', () => {
    expect(skill).toMatch(/reject[\s\S]{0,300}creates nothing/i);
    expect(skill).toMatch(/no standalone fallback/i);
  });

  test('register is not called for a late child', () =>
    expect(skill).toMatch(/register[\s\S]{0,80}late[- ]child|late[- ]child[\s\S]{0,80}register/i));

  test('refuses when the epic is missing', () =>
    expect(skill).toMatch(/missing epic|epic (is )?(missing|not found)|no matching epic/i));

  test('refuses when the epic status is not epic', () =>
    expect(skill).toMatch(/status[^\n]{0,80}\bepic\b/i));
});
```

Each `test()` checks one behavior. A failing assertion names the anchor that is missing, so it doubles as a checklist for the skill edits.

Run the file alone first to isolate failures. Then run the full suite, which must pass.

**Describe title (required).** Name the describe block of this task exactly `skill late-child text` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('skill late-child text'" tests/cli/define-feature-checkpoint-text.test.js
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```