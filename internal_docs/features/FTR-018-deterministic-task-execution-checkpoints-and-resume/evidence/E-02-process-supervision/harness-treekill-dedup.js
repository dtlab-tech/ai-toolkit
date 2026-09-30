const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const SPIKE = __dirname;
const WORKER = path.join(SPIKE, 'worker.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function isAlive(pid){ try { process.kill(pid, 0); return true; } catch(e){ return e.code === 'EPERM'; } }
function startWorker(gcFile){
  if (fs.existsSync(gcFile)) fs.unlinkSync(gcFile);
  const w = spawn(process.execPath, [WORKER, gcFile], { stdio: 'ignore', detached: false });
  return w;
}
async function waitGc(gcFile){
  for (let i=0;i<50;i++){ if (fs.existsSync(gcFile)) return parseInt(fs.readFileSync(gcFile,'utf8'),10); await sleep(100); }
  throw new Error('grandchild pid not reported');
}

(async () => {
  // ---- TEST 1a: naive child.kill() — does it orphan the grandchild? ----
  const gcFile1 = path.join(SPIKE, 'gc1.txt');
  const w1 = startWorker(gcFile1);
  const gc1 = await waitGc(gcFile1);
  await sleep(200);
  console.log('=== TEST 1a: naive child.kill(SIGTERM) ===');
  console.log('worker pid:', w1.pid, '| grandchild pid:', gc1);
  console.log('before kill  -> worker alive:', isAlive(w1.pid), '| grandchild alive:', isAlive(gc1));
  w1.kill('SIGTERM');
  await sleep(600);
  const gc1Orphan = isAlive(gc1);
  console.log('after kill   -> worker alive:', isAlive(w1.pid), '| grandchild alive:', gc1Orphan, gc1Orphan ? '<-- ORPHANED' : '');
  if (gc1Orphan) spawnSync('taskkill', ['/PID', String(gc1), '/T', '/F'], { stdio:'ignore' }); // cleanup

  // ---- TEST 1b: tree kill via taskkill /T — terminates the whole tree? ----
  const gcFile2 = path.join(SPIKE, 'gc2.txt');
  const w2 = startWorker(gcFile2);
  const gc2 = await waitGc(gcFile2);
  await sleep(200);
  console.log('\n=== TEST 1b: tree kill taskkill /PID <worker> /T /F ===');
  console.log('worker pid:', w2.pid, '| grandchild pid:', gc2);
  console.log('before kill  -> worker alive:', isAlive(w2.pid), '| grandchild alive:', isAlive(gc2));
  const tk = spawnSync('taskkill', ['/PID', String(w2.pid), '/T', '/F'], { encoding:'utf8' });
  await sleep(600);
  console.log('taskkill exit:', tk.status);
  const gc2Alive = isAlive(gc2);
  console.log('after treekill-> worker alive:', isAlive(w2.pid), '| grandchild alive:', gc2Alive, gc2Alive ? '<-- STILL ORPHANED' : '<-- tree terminated');

  // ---- TEST 2: dedup after coordinator crash via PID-liveness (+ start-time anti-recycle) ----
  console.log('\n=== TEST 2: resume dedup via lock worker_id liveness ===');
  // live worker holding a lock
  const gcFile3 = path.join(SPIKE, 'gc3.txt');
  const w3 = startWorker(gcFile3);
  const gc3 = await waitGc(gcFile3);
  // capture start time of the worker PID (anti PID-recycle component)
  function startTime(pid){
    const ps = spawnSync('powershell', ['-NoProfile','-Command',
      `try { (Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc() } catch { 'DEAD' }`], {encoding:'utf8'});
    return (ps.stdout||'').trim();
  }
  const st3 = startTime(w3.pid);
  const lock = { worker_id: `${os.hostname()}:${w3.pid}:${st3}`, pid: w3.pid, startTime: st3 };
  const lockFile = path.join(SPIKE, 'task.lock');
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  console.log('lock written:', lock.worker_id);

  // resume logic: refuse replacement if recorded worker is still alive AND start-time matches
  function resumeDecision(){
    const L = JSON.parse(fs.readFileSync(lockFile,'utf8'));
    const alive = isAlive(L.pid);
    const stNow = alive ? startTime(L.pid) : 'DEAD';
    const sameProc = alive && stNow === L.startTime;
    return { alive, sameProc, decision: sameProc ? 'DO-NOT-REPLACE (worker live)' : 'SAFE-TO-REPLACE (worker gone/recycled)' };
  }
  const d1 = resumeDecision();
  console.log('resume #1 (coordinator crashed, worker still alive):', JSON.stringify(d1));

  // now the worker really dies -> resume must allow replacement (but NOT before it is confirmed dead)
  spawnSync('taskkill', ['/PID', String(w3.pid), '/T', '/F'], { stdio:'ignore' });
  await sleep(600);
  const d2 = resumeDecision();
  console.log('resume #2 (worker confirmed terminated):        ', JSON.stringify(d2));

  // cleanup any stragglers
  [gc3].forEach(p=>{ try{ spawnSync('taskkill',['/PID',String(p),'/T','/F'],{stdio:'ignore'});}catch(e){} });
  console.log('\nSPIKE COMPLETE');
})().catch(e=>{ console.error('SPIKE ERROR', e); process.exit(1); });
