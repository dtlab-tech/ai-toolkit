const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const SPIKE = __dirname, WORKER = path.join(SPIKE,'worker.js');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function aliveKill0(pid){ try{ process.kill(pid,0); return true;}catch(e){return e.code==='EPERM';} }
function aliveTasklist(pid){
  const r = spawnSync('tasklist',['/FI',`PID eq ${pid}`,'/NH'],{encoding:'utf8'});
  return /\b\d+\b/.test(r.stdout) && r.stdout.includes(String(pid));
}
async function waitGc(f){ for(let i=0;i<50;i++){ if(fs.existsSync(f)) return parseInt(fs.readFileSync(f,'utf8'),10); await sleep(100);} throw new Error('no gc'); }
(async()=>{
  for(let run=1;run<=3;run++){
    const gcFile=path.join(SPIKE,`n${run}.txt`);
    if(fs.existsSync(gcFile)) fs.unlinkSync(gcFile);
    const w=spawn(process.execPath,[WORKER,gcFile],{stdio:'ignore',detached:false});
    const gc=await waitGc(gcFile);
    await sleep(300);
    w.kill('SIGTERM');
    await sleep(1500);
    const a0=aliveKill0(gc), at=aliveTasklist(gc);
    console.log(`run ${run}: worker ${w.pid} gc ${gc} -> after naive SIGTERM: gc alive(kill0)=${a0} alive(tasklist)=${at} ${(a0||at)?'ORPHAN':'terminated'}`);
    if(a0||at) spawnSync('taskkill',['/PID',String(gc),'/T','/F'],{stdio:'ignore'});
  }
})();
