<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for req-assembler.js, including a UI-Requirements-bearing fixture
- **Outcome:** tests/req-assembler.test.js exists covering: directory-format assembly against a hand-built req/ fixture (asserting all 9 sections present in order, Section 2 built from UC files in table order), the legacy monolithic-file path, missing index.md, missing a referenced UC file, an empty use-case table (each asserting a structured error naming the exact path), and a second fixture whose index.md has non-empty Section 6 (UI Requirements) — the existing FTR-020 req/ worked example has none, so this exercises that section's round-trip
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05, AC-08
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for req-assembler.js

**Implementation notes:**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { loadRequirements, parseUseCaseIndexTable, AssemblyError } =
  require('../src/claude/scripts/req-assembler');

const FIXTURE = path.join(__dirname, 'fixtures', 'ftr-021-req');          // directory-format fixture
const FIXTURE_WITH_UI = path.join(__dirname, 'fixtures', 'ftr-021-req-with-ui');
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'ftr-021-requirements-legacy.md');

describe('loadRequirements() — split directory format', () => {
  test('reconstructs all 9 sections in order', () => {
    const doc = loadRequirements(FIXTURE);
    const sectionNumbers = [...doc.matchAll(/^## (\d+)\.\s/gm)].map(m => Number(m[1]));
    expect(sectionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('Section 2 is built from UC files in index-table order', () => {
    const doc = loadRequirements(FIXTURE);
    const ucTable = parseUseCaseIndexTable(fs.readFileSync(path.join(FIXTURE, 'index.md'), 'utf8'));
    const positions = ucTable.map(row => doc.indexOf(`### ${row.id}:`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every(p => p !== -1)).toBe(true);
  });

  test('a fixture with non-empty UI Requirements (Section 6) round-trips its content', () => {
    const doc = loadRequirements(FIXTURE_WITH_UI);
    expect(doc).toMatch(/## 6\. UI Requirements[\s\S]+### 6\.1 Pages/);
  });
});

describe('loadRequirements() — legacy monolithic file', () => {
  test('returns the file content unchanged (AC-07)', () => {
    expect(loadRequirements(LEGACY_FIXTURE)).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'));
  });
});

describe('loadRequirements() — structured errors (AC-05)', () => {
  test('missing index.md names the exact path', () => {
    expect(() => loadRequirements(path.join(FIXTURE, '..', 'ftr-021-req-no-index')))
      .toThrow(AssemblyError);
  });
  test('missing a referenced UC file names the exact path', () => {
    expect(() => loadRequirements(path.join(FIXTURE, '..', 'ftr-021-req-missing-uc')))
      .toThrow(/UC-02/);
  });
  test('an empty use-case table is rejected', () => {
    expect(() => loadRequirements(path.join(FIXTURE, '..', 'ftr-021-req-empty-table')))
      .toThrow(/no rows/);
  });
});
```

Build `FIXTURE_WITH_UI` as a copy of `FIXTURE` with a deliberately non-empty `## 6. UI
Requirements` section (a couple of fake pages/screens — content is irrelevant, only its presence
and round-trip matter); this is the fixture the Tech-Spec's Test Plan flags as missing from the
reused FTR-020 worked example.

**Verification commands:**

```
npx jest --testPathPattern=tests/req-assembler.test.js
```
