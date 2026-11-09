<a id="task-US-02-TASK-TEST-02"></a>
### US-02-TASK-TEST-02

- **Task ID:** US-02-TASK-TEST-02
- **Title:** Add static tests pinning skill decision relay text
- **Outcome:** tests/cli/define-feature-checkpoint-text.test.js asserts the skill text for the decision block keys, accept, edit and reject collected in the main loop, the foundation warning on edit, the accept order (parent write, register defined, apply --parent), reject continuing as standalone, and the partial failure recovery offer. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-06, US-02-TASK-BE-07, US-01-TASK-TEST-02
- **Acceptance criteria:** AC-09, AC-10, AC-11, AC-12
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** pin skill decision relay text in static tests

**Implementation notes:**

This task extends the existing file `tests/cli/define-feature-checkpoint-text.test.js`, which US-01-TASK-TEST-02 creates and which already defines the `AGENT` and `SKILL` paths, the `agent` and `skill` text constants, and the `at` helper. Append one new top-level `describe` block that asserts only the skill text (`skill`). Do not redefine those constants and do not touch the agent assertions. Do not add a new test file.

Design gaps to surface at the gate:
- The Tech-Spec body fixes the skill anchors for accept, edit, reject, `apply`, `standalone`, `foundation`, and `unevaluated`. It does not fix the anchors for the decision block keys (`feature_id`, `decision`, `record`, `proposal`, `edits`), the parent-write step in the accept order, or the partial-failure wording. The assertions below use the keys and steps named in the skeleton outcome and in US-02-TASK-BE-06 and US-02-TASK-BE-07. They key on literal tokens, not full sentences.
- The parent-write step has no stable anchor in the given excerpt. Check it against the skill text that US-02-TASK-BE-06 writes. If no stable anchor exists, omit the parent-write ordering check and report that omission rather than inventing an anchor.
- The partial-failure assertions use `toContain` for the literal `.split-staging-` because `*` is a regex metacharacter.

Concrete block to append (jest globals, same style as the rest of the file):

```javascript
describe('skill: decision relay in the main loop (UC-02, BR-01, D-05, D-06)', () => {
  test('the decision block carries feature_id, decision, record, proposal and edits', () => {
    expect(skill).toMatch(/feature_id[\s\S]*decision[\s\S]*record[\s\S]*proposal[\s\S]*edits/);
  });

  test('the user decision is the only trigger for a write', () => {
    expect(skill).toMatch(/only trigger|only.*write/i);
  });

  test('accept, edit and reject are each collected as decisions', () => {
    expect(skill).toMatch(/accept[\s\S]*edit[\s\S]*reject/i);
  });

  test('edit re-presents the revised proposal with the foundation warning', () => {
    expect(skill).toMatch(/edit[\s\S]*foundation/i);
  });

  test('accept runs status defined before apply --parent', () => {
    const defined = at(skill, 'status defined');
    const apply = at(skill, 'apply --parent');
    expect(defined).toBeGreaterThanOrEqual(0);
    expect(apply).toBeGreaterThanOrEqual(0);
    expect(defined).toBeLessThan(apply);
  });

  test('reject continues as standalone', () => {
    expect(skill).toMatch(/reject[\s\S]*standalone/i);
  });
});

describe('skill: partial apply failure recovery offer (BR-05, UC-02)', () => {
  test('offers retry, edit or reject after a failed apply', () => {
    expect(skill).toMatch(/retry[\s\S]*edit[\s\S]*reject/i);
  });

  test('names the .split-staging- leftover', () => {
    expect(skill).toContain('.split-staging-');
  });

  test('states that later applies are blocked while a leftover exists', () => {
    expect(skill).toMatch(/blocked/i);
  });
});
```

Verification: this is a test-only change. Run the new file on its own first, then the full suite. The file must pass after the BE-06 and BE-07 skill text exists. If an assertion fails, the message names the missing anchor, which is the checklist for the skill edit.

**Describe title (required).** Name the describe block of this task exactly `skill decision relay text` so that the first verification command can find it.

**Verification commands:**

```
grep -qF "describe('skill decision relay text'" tests/cli/define-feature-checkpoint-text.test.js
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```