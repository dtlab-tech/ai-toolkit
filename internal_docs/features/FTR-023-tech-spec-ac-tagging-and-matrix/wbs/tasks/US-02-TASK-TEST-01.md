<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for tech-spec-graph-checks.js
- **Outcome:** tests/tech-spec-graph-checks.test.js exists covering parseFileInventoryEntries (both tables present, one table missing, a dash cell, a multi-AC cell), checkAddressesResolve (clean list, one dangling reference), and findSubsectionRange (subsection followed by another heading, subsection as the last content in the document)
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-07
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for tech-spec-graph-checks.js

**Implementation notes:**

```js
'use strict';
const { parseFileInventoryEntries, checkAddressesResolve, findSubsectionRange } =
  require('../src/claude/scripts/tech-spec-graph-checks');

function techSpec(newFilesRows, modifiedFilesRows, trailingSection = '## 10. Testing Strategy\n') {
  const row = ([p, d, a]) => `| ${p} | ${d} | ${a} |`;
  return '## 9. File Inventory\n\n' +
    (newFilesRows ? `### New files\n| Path | Purpose | Addresses |\n|---|---|---|\n${newFilesRows.map(row).join('\n')}\n\n` : '') +
    (modifiedFilesRows ? `### Modified files\n| Path | Change description | Addresses |\n|---|---|---|\n${modifiedFilesRows.map(row).join('\n')}\n\n` : '') +
    trailingSection;
}

describe('parseFileInventoryEntries()', () => {
  test('parses both tables when both are present', () => {
    const content = techSpec([['a.js', 'new', 'AC-01']], [['b.js', 'changed', '—']]);
    const entries = parseFileInventoryEntries(content);
    expect(entries).toEqual([
      { filePath: 'a.js', acIds: ['AC-01'] },
      { filePath: 'b.js', acIds: [] },
    ]);
  });

  test('a dash cell yields an empty acIds array', () => {
    const content = techSpec([['a.js', 'new', '—']], null);
    expect(parseFileInventoryEntries(content)[0].acIds).toEqual([]);
  });

  test('a multi-AC cell is split and trimmed', () => {
    const content = techSpec([['a.js', 'new', 'AC-01, AC-02']], null);
    expect(parseFileInventoryEntries(content)[0].acIds).toEqual(['AC-01', 'AC-02']);
  });

  test('one table missing (e.g. a pure-addition feature with no modified files) is valid', () => {
    const content = techSpec([['a.js', 'new', 'AC-01']], null);
    expect(parseFileInventoryEntries(content)).toEqual([{ filePath: 'a.js', acIds: ['AC-01'] }]);
  });
});

describe('checkAddressesResolve()', () => {
  test('passes when every AC ID exists', () => {
    const entries = [{ filePath: 'a.js', acIds: ['AC-01'] }];
    expect(checkAddressesResolve(entries, ['AC-01', 'AC-02'])).toHaveLength(0);
  });

  test('flags a dangling AC reference, naming the file and the AC', () => {
    const entries = [{ filePath: 'a.js', acIds: ['AC-99'] }];
    const errors = checkAddressesResolve(entries, ['AC-01']);
    expect(errors).toHaveLength(1);
    expect(errors[0].filePath).toBe('a.js');
    expect(errors[0].acId).toBe('AC-99');
  });
});

describe('findSubsectionRange()', () => {
  test('a subsection followed by another heading stops before it', () => {
    const lines = ['## 9. File Inventory', '', '### New files', '| a |', '', '### Modified files', '| b |'];
    const sub = findSubsectionRange(lines, 0, lines.length, 'New files');
    expect(lines.slice(sub.start, sub.end)).toEqual(['### New files', '| a |', '']);
  });

  test('a subsection with nothing after it runs to the given end', () => {
    const lines = ['## 9. File Inventory', '', '### Modified files', '| b |'];
    const sub = findSubsectionRange(lines, 0, lines.length, 'Modified files');
    expect(sub.end).toBe(lines.length);
  });

  test('returns null when the heading is absent', () => {
    const lines = ['## 9. File Inventory', '### New files', '| a |'];
    expect(findSubsectionRange(lines, 0, lines.length, 'Modified files')).toBeNull();
  });
});
```

**Verification commands:**

```
npx jest --testPathPattern=tests/tech-spec-graph-checks.test.js
```
