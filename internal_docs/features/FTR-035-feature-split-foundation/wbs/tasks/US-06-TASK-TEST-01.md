<a id="task-US-06-TASK-TEST-01"></a>
### US-06-TASK-TEST-01

- **Task ID:** US-06-TASK-TEST-01
- **Title:** Add registry reader tolerance test for generator agents
- **Outcome:** tests/frontmatter/registry-reader-tolerance.test.js exists with one passing test per generator file and rule. The rules are standalone entry, epic status, epic.md recognition, Depends on: none, skipping other statuses and ignoring Detail. Both gaia-generate-requirements.md and gaia-generate-tech-spec.md are checked. npm test passes.
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-06-TASK-BE-01, US-06-TASK-BE-02
- **Acceptance criteria:** AC-43, AC-44, AC-45, AC-46
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add registry reader tolerance test for generator agents

**Implementation notes:**

Create one new file, `tests/frontmatter/registry-reader-tolerance.test.js`. It is a Jest test file that reads the two generator agent files as text and checks that each contains the six reader-rule phrases. It does not run the agents and does not parse any registry. No other file is changed.

Dependency context: US-06-TASK-BE-01 and US-06-TASK-BE-02 add the reader rules to the two agents. This test is written to pass once those tasks are done. Before they land, the `epic-md` case is expected to fail for both files, because the Tech-Spec gap list says neither generator names `epic.md` today.

Open gaps for the host (carried from the Tech-Spec excerpt):
- The excerpt does not include the text of AC-43 to AC-46. The rule-to-AC mapping is therefore unconfirmed and should be checked at Gate 1.
- The generator files were not read for this plan. The regexes below target the rule wording the Tech-Spec components describe.

Structure and pattern:
- Use `'use strict';` at the top.
- Use `describe.each` over the two generator files, then a nested `describe.each` over the six rules. This gives one `test()` per (file, rule) pair, as the outcome requires. A plain `for` loop with `assert` would not produce separate test cases.
- Use `expect(...).toMatch(...)`, which is the Jest style used by the project's frontmatter tests.
- Normalise whitespace once per file so that line wrapping in the agent prose does not break a match.

```javascript
'use strict';

const fs   = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');
const GENERATORS = ['gaia-generate-requirements.md', 'gaia-generate-tech-spec.md'];

// [id, description, pattern the normalised agent text must match]
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

describe.each(GENERATORS)('%s reader rules', (file) => {
  let text;

  beforeAll(() => {
    text = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8').replace(/\s+/g, ' ');
  });

  describe.each(RULES)('[%s] %s', (id, description, pattern) => {
    test(`states the rule: ${description}`, () => {
      expect(text).toMatch(pattern);
    });
  });
});
```

Known weakness to review at Gate 1: several patterns use the `s` flag with `.*`, so they match if the two terms appear anywhere in the file, not in the same sentence. `depends-none` matches any standalone `none`. The regexes follow the design as given, and the rule ids in each test name make a failure traceable. If a reviewer wants stricter matching, tighten the patterns in `RULES` only. Keep the rule ids and the `describe.each` structure unchanged.

Duplicate-implementation check: no sibling task builds this test file or its behaviour. The sibling TEST tasks cover `feature-split.test.js` and `feature-split-install.test.js`, so there is no overlap.

Verification: run the new file on its own first, then run the full suite, which the outcome requires to pass.

**Verification commands:**

```bash
test -f tests/frontmatter/registry-reader-tolerance.test.js
```

```bash
npx jest tests/frontmatter/registry-reader-tolerance.test.js
```

```bash
npm test
```