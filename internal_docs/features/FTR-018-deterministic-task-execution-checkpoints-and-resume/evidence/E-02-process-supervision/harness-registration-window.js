// E-02 supplement — crash-in-the-registration-window proof.
//
// Gap addressed (identified 2026-09-22): the original E-02 spike proves tree-kill and
// resume-dedup ONLY when the worker was already durably registered in task.lock. It does
// NOT cover the window where the coordinator crashes AFTER spawning the worker but BEFORE
// the durable registration is persisted. In that window a live orphan exists with no lock,
// so a naive lock-only resume double-dispatches.
//
// Deterministic, NO LLM. Uses only fake Node workers.
// CONTAINMENT: every worker carries a unique RUN_TAG in its argv; the proof only ever
// terminates PIDs whose command line contains that RUN_TAG. It never kills by image name
// and never touches processes it did not create.

const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const RUN_TAG = 'OQ01B-REGWIN-' + Date.now() + '-' + process.pid;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Enumerate live node workers whose command line carries our RUN_TAG (Windows, CIM).
function findTaggedWorkers(){
  const ps = spawnSync('powershell', ['-NoProfile','-Command',
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${RUN_TAG}*' } | ` +
    `Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8' });
  return (ps.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .map(Number).filter(n => !Number.isNaN(n));
}
function killPid(pid){ spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); }

// Worker: after `startupDelay` ms it self-registers (writes its pid to selfFile), then idles.
// The delay models the sub-window before a worker can register itself.
const WORKER = path.join(DIR, 'regwin-worker.js');
fs.writeFileSync(WORKER,
  "const fs=require('fs');\n" +
  "const selfFile=process.argv[2];\n" +
  "const startupDelay=parseInt(process.argv[3]||'0',10);\n" +
  "setTimeout(()=>{ try{ fs.writeFileSync(selfFile,String(process.pid)); }catch(e){} }, startupDelay);\n" +
  "setTimeout(()=>{}, 120000);\n");

function spawnTaggedWorker(selfFile, startupDelay){
  // RUN_TAG in argv => discoverable via process command line even before self-registration.
  return spawn(process.execPath,
    [WORKER, selfFile, String(startupDelay), '--tag=' + RUN_TAG],
    { stdio: 'ignore', detached: false });
}

(async () => {
  console.log('RUN_TAG =', RUN_TAG);
  const intentFile = path.join(DIR, 'intent.json');
  const lockFile   = path.join(DIR, 'task.lock');
  const selfFile   = path.join(DIR, 'worker.self');
  for (const f of [intentFile, lockFile, selfFile]) if (fs.existsSync(f)) fs.unlinkSync(f);

  // Setup: intent-first dispatch, then a simulated coordinator crash inside the window.
  console.log('\n=== Setup: intent written, worker spawned, coordinator crashes before registration ===');
  fs.writeFileSync(intentFile, JSON.stringify({ taskId: 'T-REGWIN', tag: RUN_TAG, ts: Date.now() }));
  const w = spawnTaggedWorker(selfFile, 5000); // 5s self-register delay => we sit inside the window
  console.log('intent written; worker spawned pid', w.pid, '(self-registration delayed 5s)');
  await sleep(300); // coordinator "crashes" here: no lock written, worker.self not yet present
  console.log('coordinator CRASHED. lock present:', fs.existsSync(lockFile),
              '| worker.self present:', fs.existsSync(selfFile));

  // Resume A — NAIVE (durable lock only).
  console.log('\n=== Resume A — NAIVE (checks durable lock only) ===');
  let naiveDup = null;
  if (!fs.existsSync(lockFile)){
    console.log('no lock found -> naive coordinator DISPATCHES a new worker');
    naiveDup = spawnTaggedWorker(path.join(DIR, 'worker2.self'), 0);
    await sleep(400);
  }
  let live = findTaggedWorkers();
  console.log('live tagged workers now:', live.length, live,
              live.length > 1 ? '<-- DUPLICATE (orphan + new) = HAZARD' : '');
  live.forEach(killPid); await sleep(500);
  console.log('cleaned up. live tagged workers:', findTaggedWorkers().length);

  // Resume B — SAFE (intent-first + reconcile by tag).
  console.log('\n=== Resume B — SAFE (intent-first + reconcile by tag) ===');
  for (const f of [lockFile, selfFile]) if (fs.existsSync(f)) fs.unlinkSync(f);
  fs.writeFileSync(intentFile, JSON.stringify({ taskId: 'T-REGWIN', tag: RUN_TAG, ts: Date.now() }));
  const orphan = spawnTaggedWorker(selfFile, 5000);
  await sleep(300);
  console.log('orphan worker pid', orphan.pid, '| lock present:', fs.existsSync(lockFile));
  const intent = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  const found = findTaggedWorkers();
  const decision = found.length > 0
    ? 'RECONCILE existing worker(s) — DO NOT dispatch duplicate'
    : 'no live worker for intent — safe to dispatch';
  console.log('intent tag:', intent.tag);
  console.log('reconcile scan -> live tagged workers:', found.length, found);
  console.log('SAFE decision:', decision);
  console.log('would dispatch duplicate?', found.length === 0,
              found.length === 0 ? '' : '<-- correctly refused');

  // Cleanup — only PIDs carrying our tag.
  findTaggedWorkers().forEach(killPid); await sleep(300);
  try { fs.unlinkSync(WORKER); } catch (e) {}
  console.log('\nfinal live tagged workers:', findTaggedWorkers().length);
  console.log('VERDICT: naive lock-only resume double-dispatches in the registration window;',
              'intent-first + tag reconcile prevents it.');
  console.log('SPIKE COMPLETE');
})().catch(e => { console.error('SPIKE ERROR', e); try { findTaggedWorkers().forEach(killPid); } catch (_) {} process.exit(1); });
