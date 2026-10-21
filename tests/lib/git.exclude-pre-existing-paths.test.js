'use strict';

// Unit coverage for git.excludePreExistingPaths — the pure filter behind the fix for a real
// bug (reported against Fincantieri.ISDM.JobScheduler, FTR-012): execute() dispatches directly
// against the real project directory (maxConcurrency=1), and detectChangedPaths(cwd) reports
// EVERY uncommitted path in that directory, not just what the current task's own attempt
// touched. Any content already uncommitted before a task started (most commonly this feature's
// own Requirements/Tech-Spec/Work-Breakdown docs, left uncommitted by design after Gate 1/Gate 2)
// bled into every task's review prompt ("Prompt is too long", reproduced 8/8 times on a real run)
// and was silently committed into that task's own commit via stageTaskFiles.

const git = require('../../lib/task-executor/git');

describe('git.excludePreExistingPaths()', () => {
  test('a path present in both snapshots with the SAME changeType is excluded (untouched pre-existing dirt)', () => {
    const baseline = [{ path: 'FTR-900-Requirements.md', changeType: 'add' }];
    const current = [{ path: 'FTR-900-Requirements.md', changeType: 'add' }];
    expect(git.excludePreExistingPaths(baseline, current)).toEqual([]);
  });

  test('a path present only in "current" (new since baseline) is included', () => {
    const baseline = [];
    const current = [{ path: 'src/foo.js', changeType: 'modify' }];
    expect(git.excludePreExistingPaths(baseline, current)).toEqual(current);
  });

  test('a path present in both but with a DIFFERENT changeType is included (this task genuinely changed it further)', () => {
    const baseline = [{ path: 'src/foo.js', changeType: 'modify' }];
    const current = [{ path: 'src/foo.js', changeType: 'delete' }];
    expect(git.excludePreExistingPaths(baseline, current)).toEqual(current);
  });

  test('mixed: pre-existing planning docs are dropped, the task\'s own new file survives', () => {
    const baseline = [
      { path: 'FTR-900-Requirements.md', changeType: 'add' },
      { path: 'FTR-900-Tech-Spec.md', changeType: 'add' },
    ];
    const current = [
      { path: 'FTR-900-Requirements.md', changeType: 'add' },
      { path: 'FTR-900-Tech-Spec.md', changeType: 'add' },
      { path: 'US-01-TASK-BE-01.output.txt', changeType: 'add' },
    ];
    expect(git.excludePreExistingPaths(baseline, current)).toEqual([
      { path: 'US-01-TASK-BE-01.output.txt', changeType: 'add' },
    ]);
  });

  test('empty baseline and empty current both round-trip to an empty array', () => {
    expect(git.excludePreExistingPaths([], [])).toEqual([]);
  });

  test('never mutates either input array', () => {
    const baseline = [{ path: 'a', changeType: 'add' }];
    const current = [{ path: 'a', changeType: 'add' }, { path: 'b', changeType: 'modify' }];
    const baselineCopy = JSON.parse(JSON.stringify(baseline));
    const currentCopy = JSON.parse(JSON.stringify(current));
    git.excludePreExistingPaths(baseline, current);
    expect(baseline).toEqual(baselineCopy);
    expect(current).toEqual(currentCopy);
  });
});
