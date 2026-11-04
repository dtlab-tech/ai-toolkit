# tests/frontmatter/registry-reader-tolerance.test.js — New

## Change

This new test file checks the read-side tolerance that the Requirements and Tech-Spec generator agents must have for the new registry lines (D-18, D-19, D-20). It exports nothing. It reads two files as text, `src/claude/agents/gaia-generate-requirements.md` and `src/claude/agents/gaia-generate-tech-spec.md`, and asserts that each contains the reader rules the feature requires. The rules are: an entry with no `Parent:` or `Depends on:` line is standalone; an entry with `Status: epic` is recognised as a parent record; `Depends on: none` means no dependencies; an entry with any status other than `defined`, `completed` or `epic` is skipped; and the `Detail` line is ignored. The file does not run the agents, because their reading is LLM behaviour that a unit test cannot check deterministically. Its scope is the instruction text only, which is the one part that can be verified without a model. No other test file is changed, and no generator agent is changed by this component.

Open gaps for the host:
- The excerpt given to me does not contain the text of AC-43, AC-44, AC-45 or AC-46. Those IDs are restated here as given and are not mapped to specific assertions. The Requirements gap list also says reader tolerance has no Use Case, AC or NFR, so the mapping of these four IDs needs confirming at Gate 1.
- The generator agent files were not read for this design. The assertions are written against the rules the Tech-Spec components describe. Some assertions are expected to fail until the agents are changed: the Tech-Spec gaps say neither generator currently mentions `epic.md`.
- The test runner is not stated in the excerpt. The file should use the same runner and assertion style as `tests/scripts/feature-split.test.js`.

## Algorithm

Each check reads a generator file, normalises whitespace, and asserts that a required rule phrase is present. The rules are grouped by agent so that a failure names the agent and the rule.

```js
// tests/frontmatter/registry-reader-tolerance.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const AGENTS = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');
const GENERATORS = ['gaia-generate-requirements.md', 'gaia-generate-tech-spec.md'];

// Each rule: [id, human description, regex the agent text must match]
const RULES = [
  ['standalone', 'entry without Parent:/Depends on: is read as standalone',
    /without\s+(a\s+)?`?Parent:`?|no\s+`?Parent:`?.*standalone|standalone.*`?Parent:`?/is],
  ['epic-status', 'Status: epic is recognised as a parent record',
    /`?epic`?.*(parent|record)|(parent|record).*`?epic`?/is],
  ['epic-md', 'the parent epic.md is recognised',
    /epic\.md/i],
  ['depends-none', 'Depends on: none means no sibling dependencies',
    /`?none`?/i],
  ['unknown-status', 'entries with any other status are skipped',
    /(unknown|other)\s+status.*(skip|ignore)|(skip|ignore).*(unknown|other)\s+status/is],
  ['detail-ignored', 'the Detail line is ignored',
    /`?Detail`?.*ignor|ignor.*`?Detail`?/is],
];

for (const file of GENERATORS) {
  const text = fs.readFileSync(path.join(AGENTS, file), 'utf8');
  for (const [id, description, pattern] of RULES) {
    // test(`${file}: ${description}`) — one case per (file, rule)
    assert.ok(pattern.test(text), `${file} missing reader rule [${id}]: ${description}`);
  }
}
```

Non-obvious choices:
- The regexes match the wording the Tech-Spec components describe, not exact sentences, so that rewording the agent prose does not break the test. If the agent wording drifts far enough that a regex misses a rule, the failure message names the rule, which is what the reviewer needs.
- `epic-md` is a separate rule from `epic-status`, because the two Tech-Spec gaps are separate: a generator can record the epic status without naming `epic.md`.
- The file performs no registry parsing. A fixture-based behavioural test would need a deterministic reader, which the agents are not.

## Tests

This file is itself the test. It has one file, `tests/frontmatter/registry-reader-tolerance.test.js`, which is the suite the Tech-Spec's Section 12 refers to as "the frontmatter test suite" and which must be named in the File Inventory.

Cases, one per generator file and rule (2 files × 6 rules = 12 assertions):
- Each generator states that an entry without `Parent:` or `Depends on:` is standalone (`standalone`).
- Each generator recognises `Status: epic` as a parent record (`epic-status`).
- Each generator names `epic.md` as the parent record (`epic-md`). **Expected to fail until the generator agents are changed**, as the Tech-Spec gap list records.
- Each generator reads `Depends on: none` as no dependencies (`depends-none`).
- Each generator skips entries whose status is not `defined`, `completed` or `epic` (`unknown-status`).
- Each generator ignores the `Detail` line (`detail-ignored`).

Not covered here, and to be stated in the Tech-Spec's Testing Strategy as manual or deferred: whether a generator actually produces the correct output from a real registry. That needs a live run of the agent against a fixture registry.