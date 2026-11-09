<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Add static tests pinning agent decision handling text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js asserts the agent text for the no-overwrite guard, standalone register after the write, reject routing to standalone, the parent register status defined appearing before apply --parent, the edit validation with no write, and the partial failure text (retry, edit, reject, .split-staging-*). npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, US-02-TASK-BE-02, US-02-TASK-BE-03, US-02-TASK-BE-04, US-02-TASK-BE-05, US-01-TASK-TEST-01
- **Acceptance criteria:** AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin agent accept edit reject text in static tests

**Implementation notes:**

This task appends one decision-handling `describe` block to the existing `tests/cli/define-feature-checkpoint-text.test.js`. That file is created by US-01-TASK-TEST-01 and already declares the `AGENT` and `SKILL` path constants, the `agent` and `skill` text variables, and the `at()` helper. Reuse those declarations. Do not redeclare them and do not touch the skill assertions (those belong to US-02-TASK-TEST-02). If the file does not exist when this task starts, stop and report: US-01-TASK-TEST-01 has not landed.

The runner is Jest, as stated in AGENTS.md. Use `describe`/`test`/`expect`, which matches `tests/scripts/feature-split.test.js`. Each `test()` asserts one behavior.

Anchors are chosen from the outcome text. The Tech-Spec excerpt gives no exact sentence wording, so these assertions key on stable literals: `never overwrite`, `register`, `status defined`, `apply --parent`, `validate-proposal`, `retry`, `.split-staging-`, `blocked`. If BE-01 to BE-05 use different literals, the assertion fails and names the missing anchor. Align the anchor with the agent text that was actually written. Do not weaken the test to match.

Ordering checks are scoped to the Phase 4 slice, not the whole file. The word `register` also appears earlier in the agent, so a whole-file `indexOf` would pass for the wrong reason.

Append this block after the existing describes:

```js
describe('agent: decision handling (US-02)', () => {
  const p4 = () => agent.slice(at(agent, 'Phase 4'));

  test('no-overwrite guard is checked before the standalone write', () => {
    const phase4 = p4();
    const guard = at(phase4, 'never overwrite');
    expect(guard).toBeGreaterThan(-1);
    expect(at(phase4, 'register')).toBeGreaterThan(guard);
  });

  test('standalone register runs after feature.md is written', () => {
    const phase4 = p4();
    const write = phase4.search(/(writes?|written)[^\n]{0,80}feature\.md/i);
    expect(write).toBeGreaterThan(-1);
    expect(at(phase4, 'register')).toBeGreaterThan(write);
  });

  test('reject is routed to the standalone branch', () => {
    expect(agent).toMatch(/reject[\s\S]{0,300}standalone|standalone[\s\S]{0,300}reject/i);
  });

  test('split parent is registered with status defined before apply --parent', () => {
    const status = at(agent, 'status defined');
    expect(status).toBeGreaterThan(-1);
    expect(at(agent, 'apply --parent')).toBeGreaterThan(status);
  });

  test('edit runs validate-proposal', () => {
    expect(agent).toMatch(/validate-proposal/);
  });

  test('edit states that nothing is written before a new accept', () => {
    expect(agent).toMatch(/writes nothing|nothing is written|no write/i);
    expect(agent).toMatch(/new (explicit )?accept/i);
  });

  test('partial failure offers retry', () => expect(agent).toMatch(/retry/i));
  test('partial failure offers edit', () => expect(agent).toMatch(/\bedit\b/i));
  test('partial failure offers reject', () => expect(agent).toMatch(/reject/i));
  test('partial failure names the .split-staging-* leftover', () =>
    expect(agent).toMatch(/\.split-staging-/));
  test('later applies are blocked while a leftover exists', () =>
    expect(agent).toMatch(/leftover[\s\S]{0,200}blocked|blocked[\s\S]{0,200}leftover/i));
});
```

Two cautions for whoever runs this:
- The `Phase 4` slice assumes the heading text `Phase 4` exists. US-01-TASK-TEST-01 already asserts it, so a failure there surfaces first.
- The `edit` anchor is a bare word and is weak on its own. It is kept because the outcome names the partial-failure options. If it passes on prose that is not the recovery offer, tighten it to the sentence BE-05 actually writes.

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