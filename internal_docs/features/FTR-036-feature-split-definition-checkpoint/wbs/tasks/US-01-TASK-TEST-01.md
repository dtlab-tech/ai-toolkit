<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Add static tests pinning the agent Phase 3a text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js exists and asserts the agent text. It checks that Phase 3a sits between Phase 3 and Phase 4, that check-definition is called with --features-root and --feature-id and the record on stdin in memory, and that resolve-features-root is used with no hard-coded path. It also checks that all three statuses and unevaluated are handled, and that RECORD_INVALID and root failure stop with nothing written. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-04
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-08
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin define-feature agent Phase 3a text with static tests

**Implementation notes:**

Create one new file, `tests/cli/define-feature-checkpoint-text.test.js`. It reads `src/claude/agents/gaia-define-feature.md` as UTF-8 and runs substring and regex checks on it. It does not run the agent and does not touch `feature-split.js`. Use the Jest conventions from AGENTS.md: `'use strict';`, `describe`/`test`/`expect`, and `require('fs')`/`path` only. No `afterEach` cleanup is needed because nothing is written.

Phase ordering uses heading-anchored regexes, not `indexOf('Phase 3')`. That avoids `Phase 3a` matching `Phase 3`, and avoids earlier body text that mentions a phase number. The `\b` after the number stops `Phase 3` from matching `Phase 3a`.

```javascript
'use strict';

const fs   = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', '..', 'src', 'claude', 'agents', 'gaia-define-feature.md');
const agent = fs.readFileSync(AGENT, 'utf8');

// Index of the first markdown heading that names the given phase, or -1.
const headingIndex = (phase) => {
  const m = new RegExp(`^#{1,6}\\s.*Phase ${phase}\\b`, 'm').exec(agent);
  return m ? m.index : -1;
};

describe('agent Phase 3a placement (AC-06)', () => {
  test('Phase 3a heading exists', () => {
    expect(headingIndex('3a')).toBeGreaterThan(-1);
  });

  test('Phase 3a heading sits after Phase 3 and before Phase 4', () => {
    expect(headingIndex('3a')).toBeGreaterThan(headingIndex('3'));
    expect(headingIndex('3a')).toBeLessThan(headingIndex('4'));
  });
});

describe('agent check-definition invocation (AC-06)', () => {
  test('invokes check-definition through run-asset scripts/feature-split.js', () => {
    expect(agent).toMatch(/run-asset scripts\/feature-split\.js[^\n]*check-definition/);
  });

  test('passes --features-root and --feature-id', () => {
    expect(agent).toMatch(/--features-root/);
    expect(agent).toMatch(/--feature-id/);
  });

  test('resolves the features root with ai-toolkit resolve-features-root', () => {
    expect(agent).toMatch(/ai-toolkit resolve-features-root/);
  });

  test('does not hard-code a features path', () => {
    expect(agent).not.toMatch(/features\/FTR-\d+/);
  });

  test('sends the grilling record on stdin and keeps it in memory', () => {
    expect(agent).toMatch(/stdin/i);
    expect(agent).toMatch(/in memory/i);
  });
});

describe('agent status handling (AC-06)', () => {
  test('handles status skipped and names the epic.md, Approvals and wbs markers', () => {
    expect(agent).toMatch(/skipped/);
    expect(agent).toMatch(/epic\.md/);
    expect(agent).toMatch(/Approvals/);
    expect(agent).toMatch(/\bwbs\b/);
  });

  test('handles status not-flagged by continuing as standalone', () => {
    expect(agent).toMatch(/not-flagged/);
  });

  test('handles status flagged by building a CHECKPOINT proposal', () => {
    expect(agent).toMatch(/\bflagged\b/);
    expect(agent).toMatch(/CHECKPOINT/);
  });

  test('names unevaluated signals to the user', () => {
    expect(agent).toMatch(/unevaluated/);
  });
});

describe('agent failure paths write nothing (AC-06)', () => {
  test('RECORD_INVALID stops and reports without writing', () => {
    expect(agent).toMatch(/RECORD_INVALID[\s\S]{0,300}(stop|report)/i);
    expect(agent).toMatch(/nothing (is )?(written|created)|writes? nothing|without writing/i);
  });

  test('root resolution failure stops and reports without writing', () => {
    expect(agent).toMatch(/resolve-features-root[\s\S]{0,300}(fail|error)[\s\S]{0,200}(stop|report)/i);
  });
});
```

Notes for the host and for whoever runs this task:

1. **Command literal.** The Tech-Spec's COMMANDS entry is `check-definition`, but the design pseudocode writes `--check-definition`. The first check above uses `check-definition` with no leading dashes, so it matches either form. Confirm the literal the agent actually uses before tightening it.
2. **Anchors are not verified.** The wording of the status, RECORD_INVALID and root-failure sentences is not in the excerpt. The regexes key on the anchors from the BE-02 to BE-04 outcomes. If a test fails, the missing anchor it names is the gap in the agent text, not a bug in the test.
3. **AC scope.** The Tech-Spec's Addresses column maps this file to AC-06 through AC-13. The skeleton gives this task AC-01 to AC-06 and AC-08. This task follows the skeleton outcome. The late-child (AC-10), no-overwrite (AC-11), unevaluated-in-skill (AC-12) and nothing-before-confirmation (AC-13) cases are not part of this outcome and are left out here. The skill-text cases belong to US-01-TASK-TEST-02, which appends to the same file, so TEST-02 must run after this task.
4. **Expected state.** The suite should pass once BE-04 has landed the agent text. The 300-character windows are a heuristic and may need widening if the agent puts the stop sentence further from the anchor.

**Verification commands:**

```
test -f tests/cli/define-feature-checkpoint-text.test.js
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```