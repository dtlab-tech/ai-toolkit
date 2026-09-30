const { spawn } = require('child_process');
const fs = require('fs');
const gc = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { stdio: 'ignore' });
fs.writeFileSync(process.argv[2], String(gc.pid));
setTimeout(() => {}, 120000);
