<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Unit tests for tech-spec-assembler.js
- **Outcome:** tests/tech-spec-assembler.test.js exists covering: a hand-built spec/ fixture with at least one BE, one FE, and one unclassified-domain component (asserting all 12 sections present, Section 9 reduced to 3 columns, Sections 3/4/5 populated per Domain routing, Section 10 containing every component's Tests subsection in order), the legacy monolithic-file path, missing index.md, missing a referenced component file, and an empty Components table
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-04, AC-05, AC-06, AC-08
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for tech-spec-assembler.js

**Implementation notes:**

Build a real fixture directory under `tests/fixtures/ftr-024-spec/` (mirroring the
`tests/fixtures/ftr-021-req/` convention) rather than only inline strings, so the directory-vs-file
dispatch is exercised against real paths:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { loadTechSpec, AssemblyError } = require('../src/claude/scripts/tech-spec-assembler');

const FIXTURE = path.join(__dirname, 'fixtures', 'ftr-024-spec');
const LEGACY_FIXTURE = path.join(__dirname, 'fixtures', 'ftr-024-tech-spec-legacy.md');

describe('loadTechSpec() — split directory format', () => {
  test('reconstructs all 12 sections in order', () => {
    const doc = loadTechSpec(FIXTURE);
    const sectionNumbers = [...doc.matchAll(/^## (\d+)\.\s/gm)].map(m => Number(m[1]));
    expect(sectionNumbers).toEqual([1,2,3,4,5,6,7,8,9,10,11,12]);
  });

  test('Section 9 is reduced back to the 3-column Path|Purpose-or-Change|Addresses shape', () => {
    const doc = loadTechSpec(FIXTURE);
    const section9 = doc.split('## 9.')[1].split('## 10.')[0];
    expect(section9).toContain('| Path | Purpose-or-Change | Addresses |');
    expect(section9).not.toContain('Domain');
    expect(section9).not.toContain('Spec |');
  });

  test('a BE-domain component\'s detail lands under Section 3, not 4 or 5', () => {
    const doc = loadTechSpec(FIXTURE);
    const section3 = doc.split('## 3.')[1].split('## 4.')[0];
    expect(section3).toContain('src/example-be.js');
    const section4 = doc.split('## 4.')[1].split('## 5.')[0];
    expect(section4).not.toContain('src/example-be.js');
  });

  test('an FE-domain component lands under Section 4', () => {
    const doc = loadTechSpec(FIXTURE);
    const section4 = doc.split('## 4.')[1].split('## 5.')[0];
    expect(section4).toContain('src/example-fe.tsx');
  });

  test('an unclassified-domain component (e.g. DevOps) lands under Section 5', () => {
    const doc = loadTechSpec(FIXTURE);
    const section5 = doc.split('## 5.')[1].split('## 6.')[0];
    expect(section5).toContain('src/example-devops.yml');
  });

  test('Section 10 contains every component\'s own Tests subsection, in Components-table order', () => {
    const doc = loadTechSpec(FIXTURE);
    const section10 = doc.split('## 10.')[1].split('## 11.')[0];
    const positions = ['src/example-be.js', 'src/example-fe.tsx', 'src/example-devops.yml'].map(p => section10.indexOf(p));
    expect(positions.every(p => p !== -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('loadTechSpec() — legacy monolithic file (AC-06)', () => {
  test('returns the file content unchanged', () => {
    expect(loadTechSpec(LEGACY_FIXTURE)).toBe(fs.readFileSync(LEGACY_FIXTURE, 'utf8'));
  });
});

describe('loadTechSpec() — structured errors (AC-05)', () => {
  test('missing index.md names the exact path', () => {
    expect(() => loadTechSpec(path.join(__dirname, 'fixtures', 'ftr-024-spec-no-index')))
      .toThrow(AssemblyError);
  });
  test('missing a referenced component file names the exact path', () => {
    expect(() => loadTechSpec(path.join(__dirname, 'fixtures', 'ftr-024-spec-missing-component')))
      .toThrow(/example-be\.js/);
  });
  test('an empty Components table is rejected', () => {
    expect(() => loadTechSpec(path.join(__dirname, 'fixtures', 'ftr-024-spec-empty-table')))
      .toThrow(/no rows/);
  });
});
```

Build `FIXTURE`'s `index.md` with a Components table of exactly 3 rows (`src/example-be.js` /
`BE`, `src/example-fe.tsx` / `FE`, `src/example-devops.yml` / `DevOps`) and matching
`components/*.md` files each with a real `## Change` / some algorithm-or-schema heading / `##
Tests` structure (reuse `templates/component-template.md`'s shape, filled with placeholder
content — the actual text doesn't matter, only that the three required headings exist in the
right order). `ftr-024-spec-no-index` is an empty directory (remember the `.gitkeep` lesson from
FTR-021 — empty directories aren't tracked by Git, add one). `ftr-024-tech-spec-legacy.md` is any
12-section-shaped flat file (content irrelevant, only used to prove the file-vs-directory
dispatch).

**Verification commands:**

```
npx jest --testPathPattern=tests/tech-spec-assembler.test.js
```
