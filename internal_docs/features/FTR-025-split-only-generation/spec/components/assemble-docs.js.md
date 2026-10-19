# src/claude/scripts/assemble-docs.js — New

## Change

New standalone CLI script, installed alongside the other `src/claude/scripts/*.js` utilities (no
per-file registration needed — unlike agents, the `scripts` asset category is installed wholesale
by directory). Produces any combination of the three single-file views on demand, reusing existing,
unmodified assembler logic. Runs as a plain Node process outside the sandboxed workflow runtime, so
it can `require()` `req-assembler.js`/`tech-spec-assembler.js` directly (no subprocess round-trip
needed); it shells out only to `wb-render.js`, which is CLI-only (writes its own two output files
and exits, no exported function to call in-process).

## Service Interface

```js
#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { loadRequirements, AssemblyError: ReqAssemblyError } = require('./req-assembler')
const { loadTechSpec, AssemblyError: SpecAssemblyError } = require('./tech-spec-assembler')

// loadRequirements()/loadTechSpec() already throw a structured AssemblyError naming the exact
// missing path when the directory doesn't exist (`fs.statSync(inputPath, {throwIfNoEntry:false})`
// returning null) — no separate existence pre-check needed here, it would only duplicate what
// the assembler already does correctly.
function assembleReq(featureDir, prefix) {
  const outPath = path.join(featureDir, `${prefix}-Requirements.md`)
  fs.writeFileSync(outPath, loadRequirements(path.join(featureDir, 'req')))
  return outPath
}

function assembleSpec(featureDir, prefix) {
  const outPath = path.join(featureDir, `${prefix}-Tech-Spec.md`)
  fs.writeFileSync(outPath, loadTechSpec(path.join(featureDir, 'spec')))
  return outPath
}

function assembleWbs(featureDir, prefix) {
  const wbsDir = path.join(featureDir, 'wbs')
  if (!fs.existsSync(wbsDir)) throw new ReqAssemblyError(`wbs/ not found at ${wbsDir}`)
  // wb-render.js is CLI-only (writes {prefix}-Work-Breakdown.md/.csv itself and exits) — shell out,
  // same subprocess convention pm-phase2.js already used for its own (now-removed) automatic call.
  execFileSync('node', [path.join(__dirname, 'wb-render.js'), wbsDir, prefix], { cwd: featureDir })
  return [path.join(featureDir, `${prefix}-Work-Breakdown.md`), path.join(featureDir, `${prefix}-Work-Breakdown.csv`)]
}

const HANDLERS = { req: assembleReq, spec: assembleSpec, wbs: assembleWbs }

if (require.main === module) {
  const [featureDir, prefix, which = 'all'] = process.argv.slice(2)
  if (!featureDir || !prefix) {
    process.stderr.write('Usage: node assemble-docs.js <feature-dir> <prefix> [req|spec|wbs|all]\n')
    process.exit(1)
  }
  const targets = which === 'all' ? Object.keys(HANDLERS) : [which]
  if (!targets.every(t => HANDLERS[t])) {
    process.stderr.write(`Unknown target "${which}" — expected req, spec, wbs, or all\n`)
    process.exit(1)
  }
  try {
    const written = targets.map(t => HANDLERS[t](path.resolve(featureDir), prefix)).flat()
    process.stdout.write(JSON.stringify({ written }) + '\n')
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit((err instanceof ReqAssemblyError || err instanceof SpecAssemblyError) ? 2 : 1)
  }
}

module.exports = { assembleReq, assembleSpec, assembleWbs }
```

## Tests

See `tests/assemble-docs.test.js.md` (own component) for the full test design — this component's
own responsibility is just the implementation; `req`/`spec` targets against a real split fixture
produce byte-identical output to calling `loadRequirements`/`loadTechSpec` directly; `wbs` against a
real `wbs/` fixture produces the same `.md`/`.csv` `wb-render.js` would produce standalone; `all`
runs all three; a missing split-source directory for any requested target exits 2 with a message
naming the exact expected path; an unknown `which` value exits 1 with a usage-style message.
