<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Add static tests pinning agent late-child text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js asserts the agent late-child text: an epic folder named by the ID or by the ID and a hyphen, containing epic.md, candidate listing, status must be epic, existing child reported and stop, no grilling round, Summary and Keywords from the purpose and the epic Summary, apply placed last, no register call, and no standalone fallback. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-03
- **Acceptance criteria:** AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin agent late-child text in static tests

**Implementation notes:**

This task adds one `describe` block to `tests/cli/define-feature-checkpoint-text.test.js`. It does not create the file. The file is created by US-01-TASK-TEST-01 and extended by US-01-TASK-TEST-02 and US-02-TASK-TEST-01/02. Before writing, confirm the file exists and that it already declares `agent` (the UTF-8 text of `src/claude/agents/gaia-define-feature.md`) and `skill`. If the file or those constants are missing, stop and report. Do not create a second copy of the file.

The skeleton's dependency list names only US-03-TASK-BE-03. The file itself depends on US-01-TASK-TEST-01 and the earlier test tasks, so the orchestrator should run this task after them. This is a skeleton-ordering point to surface, not something this task can fix.

The Tech-Spec excerpt gives the anchor list for the late-child block, but not the final sentence wording. The assertions therefore key on stable anchors: `epic.md`, `FTR-ID`, `candidate`, `status` with `epic`, `already exists`, `no grilling`, `apply`, `last`, `depend`, `no register`, and `no standalone fallback`. Use the same anchor strings in the agent text written by US-03-TASK-BE-01 to BE-03. If one of those tasks words a point differently, align the anchor in this test with the agent's actual phrasing. Do not change the agent text to match a weak anchor. The AC wording for AC-14 to AC-19 is not in the excerpt, so check each case against the AC text when it is supplied.

Append this block after the existing agent blocks. Keep the `'use strict';` header and the runner and assertion style already used in the file.

```js
describe('agent: late-child text (UC-03, Tech-Spec 2.3)', () => {
  test('matches the epic by the ID, or the ID and a hyphen, on a folder containing epic.md', () => {
    expect(agent).toMatch(/epic\.md/);
    expect(agent).toMatch(/starts with epicId/);
  });

  test('lists candidate epics when no folder matches the ID', () => {
    expect(agent).toMatch(/candidate/i);
  });

  test('refuses unless the registry status is epic', () => {
    expect(agent).toMatch(/status[\s\S]*epic/);
  });

  test('reports an existing child feature.md and stops', () => {
    expect(agent).toMatch(/already exists[\s\S]*(stop|report)/i);
  });

  test('runs no grilling round', () => {
    expect(agent).toMatch(/no grilling/i);
  });

  test('derives Summary and Keywords from the purpose and the epic Summary', () => {
    expect(agent).toMatch(/purpose[\s\S]*epic[\s\S]*Summary|epic Summary[\s\S]*purpose/i);
  });

  test('places the child last with apply, depending on the previous last child', () => {
    expect(agent).toMatch(/apply[\s\S]*last[\s\S]*depend/i);
  });

  test('never calls register for a late child', () => {
    expect(agent).toMatch(/no register/i);
  });

  test('has no standalone fallback', () => {
    expect(agent).toMatch(/no standalone fallback|never[\s\S]{0,40}standalone/i);
  });
});
```

The two `(stop|report)` and `apply … last … depend` anchors are deliberately loose. They pin that the behaviour is stated, not the exact sentence. Do not tighten them to full sentences, or wording edits will break the suite for no reason.

**Describe title (required).** Name the describe block of this task exactly `agent late-child text` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('agent late-child text'" tests/cli/define-feature-checkpoint-text.test.js
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```