'use strict';

// Automatic carry-over: a task an earlier run of the same feature already checkpointed, with a commit
// that is still reachable from the task ref, is seeded as done instead of being re-verified.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const store = require('../../lib/task-executor/store');
const { _collectCarryOverFromPriorRuns: collect } = require('../../lib/task-executor/index');

jest.setTimeout(60000);

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, shell: false, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || r.error));
  return r.stdout.trim();
}

let repo, execRoot;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-repo-'));
  execRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-exec-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@example.com']);
  git(repo, ['config', 'user.name', 't']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'one']);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(execRoot, { recursive: true, force: true });
});

function writeRun(runId, featureId, tasks) {
  let st = new store.State({
    runId, featureId, repo, commonDir: path.join(repo, '.git'), featureRef: 'main',
    baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64), config: { maxConcurrency: 1 }, runStatus: 'paused',
  });
  Object.keys(tasks).forEach((id) => {
    st = st.addTask(id, { dependencies: [] });
    const t = tasks[id];
    if (t.sha) {
      st = st.addAttempt(id, { stage: 'committed' });
      st = st.updateAttempt(id, 1, { originalSha: t.sha });
    }
    st = st.setTaskStatus(id, t.status);
  });
  store.writeState(execRoot, runId, st);
}

const ids = ['T1', 'T2', 'T3', 'T4'];

test('carries over checkpointed tasks whose commit is reachable, and nothing else', () => {
  const sha = git(repo, ['rev-parse', 'HEAD']);
  writeRun('11111111-1111-4111-8111-111111111111', 'FTR-1', {
    T1: { status: 'checkpointed', sha },
    T2: { status: 'blocked', sha },
    T3: { status: 'pending' },
    T4: { status: 'checkpointed', sha: 'c'.repeat(40) },   // not in the repo
  });
  const found = collect(execRoot, 'FTR-1', repo, 'main', ids, 'current');
  expect([...found.keys()]).toEqual(['T1']);
  expect(found.get('T1').originalSha).toBe(sha);
  expect(found.get('T1').oldRunId).toBe('11111111-1111-4111-8111-111111111111');
});

test('ignores runs of another feature and the current run', () => {
  const sha = git(repo, ['rev-parse', 'HEAD']);
  writeRun('22222222-2222-4222-8222-222222222222', 'FTR-2', { T1: { status: 'checkpointed', sha } });
  writeRun('33333333-3333-4333-8333-333333333333', 'FTR-1', { T1: { status: 'checkpointed', sha } });
  expect(collect(execRoot, 'FTR-1', repo, 'main', ids, '33333333-3333-4333-8333-333333333333').size).toBe(0);
  expect(collect(execRoot, 'FTR-1', repo, 'main', ids, 'current').size).toBe(1);
});

test('a commit that is no longer an ancestor of the task ref is not carried over', () => {
  git(repo, ['checkout', '-q', '-b', 'side']);
  fs.writeFileSync(path.join(repo, 'b.txt'), '2');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'side']);
  const sideSha = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['checkout', '-q', 'main']);
  writeRun('44444444-4444-4444-8444-444444444444', 'FTR-1', { T1: { status: 'checkpointed', sha: sideSha } });
  expect(collect(execRoot, 'FTR-1', repo, 'main', ids, 'current').size).toBe(0);
});

test('with no earlier runs nothing is carried over', () => {
  expect(collect(execRoot, 'FTR-1', repo, 'main', ids, 'current').size).toBe(0);
});
