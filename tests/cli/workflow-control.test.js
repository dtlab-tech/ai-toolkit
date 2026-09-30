'use strict';
const fs = require('fs');
const path = require('path');
const { createControl, validateIdentity, parseArgs } = require('../../lib/workflow-control');
const ledger = require('../../lib/execution-ledger');
const { fixture } = require('../helpers/workflow-fixture');
let f;
beforeEach(() => { f = fixture(); });
afterEach(() => { jest.restoreAllMocks(); f.clean(); });

test('quoted Windows paths retain backslashes and spaces; malformed quotes fail', () => {
  expect(parseArgs('"C:\\my repo\\FTR-099\\feature.md" --force')).toEqual(['C:\\my repo\\FTR-099\\feature.md', '--force']);
  expect(() => parseArgs('"unterminated')).toThrow();
});
test('canonical ID, verified status, native name, content and worker kind all fail closed', async () => {
  const c = createControl(f.options), id = 'gaia.agent.planner.requirements';
  const record = await c.resolve(id);
  expect(validateIdentity(id, record)).toEqual(record);
  for (const patch of [{ agentId: 'wrong' }, { status: 'hash-unverifiable' }, { nativeName: 'pm-phase1' }, { nativeName: 'pm-phase3' }, { sha256: 'bad' }]) {
    expect(() => validateIdentity(id, { ...record, ...patch })).toThrow();
  }
  await expect(c.resolve('gaia.orchestrator.feature.phase1')).rejects.toThrow();
  fs.appendFileSync(record.path, 'changed');
  expect(() => validateIdentity(id, record)).toThrow('hash changed');
});
test('a failed owner cannot be marked done by a late legacy close, fail, skip, reopen or finalize', async () => {
  const c = createControl(f.options);
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  const entry = f.entries()[0];
  for (const fn of [
    () => ledger.close(f.dir, 'FTR-099', entry.agent, null, 1),
    () => ledger.fail(f.dir, 'FTR-099', entry.agent, 'late', 1),
    () => ledger.skip(f.dir, 'FTR-099', entry.agent, 'phase1', null, 1),
    () => ledger.open(f.dir, 'FTR-099', entry.agent, 'phase1', null, 1),
    () => ledger.finalizeActivity(f.dir, 'FTR-099', entry.agent, 1, { status: 'done' }),
    () => ledger.finalizeOwned(f.dir, 'FTR-099', entry.agent, 'another-owner', 'done'),
  ]) expect(fn).toThrow();
  expect(f.entries()[0].status).toBe('failed');
});
test('corrupt ledger is preserved and prevents all worker dispatch', async () => {
  const p = path.join(f.dir, 'FTR-099-token-ledger.json'); fs.writeFileSync(p, '{bad');
  const body = jest.fn(); const c = createControl(f.options);
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', body)).rejects.toThrow();
  expect(body).not.toHaveBeenCalled(); expect(fs.readFileSync(p, 'utf8')).toBe('{bad');
});
test.each([{ errors: ['failed'] }, { gate2_payload: { gate2_blocked: true } }, { error: 'failed' }])('unsuccessful result is never committed done: %j', async result => {
  const c = createControl(f.options);
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', async () => result)).rejects.toThrow();
  expect(f.entries()[0].status).toBe('failed');
});
test('parallel rejection drains siblings before the owner fails', async () => {
  const c = createControl(f.options); let siblingFinished = false;
  await expect(c.run('am-phase1', f.dir, 'FTR-099', () => c.parallel([
    async () => { throw new Error('first failed'); },
    async () => { await new Promise(r => setTimeout(r, 20)); siblingFinished = true; expect(f.entries()[0].status).toBe('running'); },
  ]))).rejects.toThrow('Parallel');
  expect(siblingFinished).toBe(true); expect(f.entries()[0].status).toBe('failed');
});
test('repeated invocations have distinct ownership and keep the old terminal state', async () => {
  await createControl(f.options).run('pm-phase1', f.dir, 'FTR-099', async () => ({ ok: true }));
  await expect(createControl(f.options).run('pm-phase1', f.dir, 'FTR-099', async () => { throw new Error('second'); })).rejects.toThrow();
  expect(f.entries().map(e => e.status)).toEqual(['done', 'failed']);
  expect(new Set(f.entries().map(e => e.workflow_owner)).size).toBe(2);
});
test('missing executable/nonzero CLI exit are deterministic failures', () => {
  const c = createControl(f.options);
  expect(() => c.command(['agents', 'resolve', '--project', f.root, '--home', f.home, '--id', 'missing', '--require-verified'])).toThrow('command failed');
});
test('failed final persistence is surfaced and cannot produce a successful return', async () => {
  const original = ledger.finalizeOwned;
  jest.spyOn(ledger, 'finalizeOwned').mockImplementation((...args) => { if (args[4] === 'done') throw new Error('disk failure'); return original(...args); });
  await expect(createControl(f.options).run('pm-phase1', f.dir, 'FTR-099', async () => ({ ok: true }))).rejects.toThrow('disk failure');
  expect(f.entries()[0].status).toBe('failed');
});

test('a matching definition hash cannot hide a frontmatter/native-name mismatch', async () => {
  const c = createControl(f.options), id = 'gaia.agent.planner.requirements';
  const record = await c.resolve(id);
  const content = '---\nname: gaia-developer-backend\nmodel: haiku\n---\n';
  fs.writeFileSync(record.path, content);
  const sha256 = 'sha256:' + require('crypto').createHash('sha256').update(content).digest('hex');
  expect(() => validateIdentity(id, { ...record, sha256 })).toThrow('frontmatter/nativeName mismatch');
});
test('owned success persists measured tokens and terminal state cannot be reopened', async () => {
  const c = createControl({ ...f.options, dispatch: async () => ({ exitCode: 0, result: { is_error: false, result: 'ok', usage: { input_tokens: 10, output_tokens: 5 } } }) });
  await c.run('pm-phase1', f.dir, 'FTR-099', async () => ({ result: await c.worker('gaia.agent.planner.requirements', 'test') }));
  const entry = f.entries().find(e => e.agentId);
  expect(entry.phase_delta_tokens).toBe(15);
  expect(entry.nativeAgentName).toBe('gaia-generate-requirements');
  expect(() => ledger.finalizeOwned(f.dir, 'FTR-099', entry.agent, entry.workflow_owner, 'failed')).toThrow('terminal transition');
});
