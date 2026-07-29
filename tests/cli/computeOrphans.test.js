'use strict';

const { computeOrphans } = require('../../bin/cli');

describe('computeOrphans()', () => {
  test('returns files in oldFiles absent from newFiles', () => {
    const result = computeOrphans(['a', 'b', 'c'], ['b', 'c']);
    expect(result).toEqual(['a']);
  });

  test('returns empty array when both sets are identical', () => {
    const result = computeOrphans(['a', 'b'], ['a', 'b']);
    expect(result).toEqual([]);
  });

  test('returns empty array when oldFiles is empty', () => {
    const result = computeOrphans([], ['a', 'b']);
    expect(result).toEqual([]);
  });

  test('returns all oldFiles when newFiles is empty', () => {
    const result = computeOrphans(['a', 'b'], []);
    expect(result).toEqual(['a', 'b']);
  });

  test('normalizes backslashes in oldFiles before comparison', () => {
    const result = computeOrphans(
      ['.claude\\agents\\old.md', '.claude/agents/keep.md'],
      ['.claude/agents/keep.md']
    );
    expect(result).toEqual(['.claude/agents/old.md']);
  });

  test('normalizes backslashes in newFiles before comparison', () => {
    const result = computeOrphans(
      ['.claude/agents/old.md', '.claude/agents/keep.md'],
      ['.claude\\agents\\keep.md']
    );
    expect(result).toEqual(['.claude/agents/old.md']);
  });

  test('comparison is case-sensitive', () => {
    const result = computeOrphans(['Foo.md'], ['foo.md']);
    expect(result).toEqual(['Foo.md']);
  });
});
