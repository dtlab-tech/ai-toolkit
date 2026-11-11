<a id="task-US-03-TASK-TEST-02"></a>
### US-03-TASK-TEST-02

- **Task ID:** US-03-TASK-TEST-02
- **Title:** Add static tests for Step 1a reject, failure, retry and unanswered text
- **Outcome:** tests/workflows/split-checkpoint-static.test.js has passing assertions that the skill states the following. Reject and edit-then-reject store nothing and continue to Gate 1. An apply failure reports the error with no remaining child or registry entry and does not reach Gate 1. A retry or an unanswered proposal starts a fresh run with fresh IDs.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-03, US-03-TASK-BE-04, US-03-TASK-BE-05, US-03-TASK-TEST-01
- **Acceptance criteria:** AC-12, AC-20, AC-21
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin Step 1a reject, failure and retry text in static tests

**Implementation notes:**

This task only adds skill-text assertions. It creates no production code and does not touch `pm-phase1.js`, so the open anchor gaps (`VALIDATION_LOOP_ANCHOR`, `GATE1_DIGEST_ANCHOR`) do not block it.

Preconditions to check before editing:
- `tests/workflows/split-checkpoint-static.test.js` already exists (created by US-01-TASK-TEST-04) and already defines `skillSrc` from `src/claude/skills/implement-feature/SKILL.md`. If it does not, stop and report it. Do not create a second copy of the file.
- The `Step 1a` text (BE-03, BE-04, BE-05) is present in SKILL.md. The wording is not in this excerpt, so the regexes below are written against the Tech-Spec wording. If SKILL.md uses different terms, adjust the regex to the skill's real wording. Do not weaken the assertion.

Runner: the sibling `tests/scripts/feature-split.test.js` uses Jest globals (`describe`, `test`, `expect`) with `require('fs')`/`require('path')`, and AGENTS.md specifies Jest. The Algorithm in the Tech-Spec uses `node:test`. This task follows the repo's Jest convention. The sibling `feature-split-check-size.test.js` does not exist yet in the tree, so it cannot be matched directly. Use the same runner as the rest of the static tests in the same file.

Scoping: extract the Step 1a section once, from the `Step 1a` match to the next `Step 2` heading. Assertions run against that slice so they cannot pass by matching text elsewhere in the skill.

Add a new `describe` block at the end of the file, after the existing Step 1a assertions. Do not edit the existing ones (US-02-TASK-TEST-03 owns those).

```js
describe('Step 1a reject, failure, retry and unanswered text', () => {
  const start = skillSrc.search(/Step 1a/);
  const step2 = skillSrc.search(/^#+\s*Step 2\b/m);
  const step1a = start >= 0 && step2 > start ? skillSrc.slice(start, step2) : '';

  test('Step 1a section is located in SKILL.md', () => {
    expect(step1a.length).toBeGreaterThan(0);
  });

  test('reject stores nothing and continues to Gate 1 unchanged', () => {
    expect(step1a).toMatch(/reject[^\n]*Gate 1/i);
    expect(step1a).toMatch(/reject[^\n]*unchanged/i);
    expect(step1a).toMatch(/(stores?|store) nothing|no rejection record/i);
  });

  test('edit-then-reject discards the edits and still stores nothing', () => {
    expect(step1a).toMatch(/reject[^\n]*edit[^\n]*discard|discard[^\n]*edit/i);
    expect(step1a).toMatch(/no registry change/i);
  });

  test('apply failure reports the error and states that the split was not applied', () => {
    expect(step1a).toMatch(/apply[^\n]*fail[^\n]*(error|report)|(error|report)[^\n]*apply[^\n]*fail/i);
    expect(step1a).toMatch(/not applied/i);
  });

  test('apply failure leaves no child folder or registry entry and never reports a partial set', () => {
    expect(step1a).toMatch(/no (remaining )?child[^\n]*registry|no child (folder|or registry)/i);
    expect(step1a).toMatch(/(never|not)[^\n]*partial/i);
  });

  test('apply failure stops before Gate 1', () => {
    expect(step1a).toMatch(/fail[^\n]*stop/i);
  });

  test('a retry after a failed apply is a fresh run with fresh child IDs', () => {
    expect(step1a).toMatch(/retry[^\n]*fresh run|fresh run[^\n]*retry/i);
    expect(step1a).toMatch(/fresh[^\n]*IDs?/i);
  });

  test('the failed attempt is not resumed and no state is stored between runs', () => {
    expect(step1a).toMatch(/not resumed/i);
    expect(step1a).toMatch(/no state[^\n]*between runs|stores? no state/i);
  });

  test('an unanswered proposal stores nothing and a later run starts fresh', () => {
    expect(step1a).toMatch(/unanswered|ended before an answer/i);
    expect(step1a).toMatch(/unanswered[^\n]*(stores?|store) nothing|(stores?|store) nothing[^\n]*unanswered/i);
    expect(step1a).toMatch(/fresh run[^\n]*check-size|re-?runs? check-size/i);
  });
});
```

Notes on the assertions:
- Each `test()` checks one behavior. The regexes are intentionally narrow to a single line (`[^\n]*`) so they match a sentence, not two unrelated sentences.
- No threshold number is hard-coded.
- The file is static: it reads text and makes no LLM call and runs no workflow.

Overlap: US-02-TASK-TEST-03 (domain TEST) also pins some Step 1a reject and retry wording. That overlap is expected for a TEST task. This task adds only the reject/failure/retry/unanswered cases, in a separate `describe` block, so it does not duplicate those assertions.

Excerpt gap: the excerpt does not contain the final SKILL.md wording from BE-03/04/05. The regexes in the code above come from the Tech-Spec text. If the first run fails on a regex, first check whether the skill text matches the Tech-Spec. If it does, fix the regex. If it does not, report the wording gap rather than loosening the assertion.

**Describe title (required).** Name the describe block of this task exactly `Step 1a reject, failure, retry and unanswered text` so that the first verification command can find it. The test file may already exist (an earlier task created it), so a check on the file alone is satisfied before this task is done.

**Verification commands:**

```
grep -qF "describe('Step 1a reject, failure, retry and unanswered text'" tests/workflows/split-checkpoint-static.test.js
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
npm test
```