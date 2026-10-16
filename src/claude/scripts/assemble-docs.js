#!/usr/bin/env node
'use strict'

// FTR-025: on-demand assembly of the split Requirements/Tech-Spec/Work-Breakdown sources into
// single-file views. Runs as a plain Node CLI outside the sandboxed workflow runtime, so it can
// `require()` req-assembler.js/tech-spec-assembler.js directly (no subprocess round-trip needed)
// — it shells out only to wb-render.js, which is CLI-only (writes its own two output files and
// exits, no exported function to call in-process). This script never runs automatically as part
// of generation; it is the explicit, user-triggered alternative to that.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { loadRequirements, AssemblyError: ReqAssemblyError } = require('./req-assembler')
const { loadTechSpec, AssemblyError: SpecAssemblyError } = require('./tech-spec-assembler')

// loadRequirements()/loadTechSpec() already throw a structured AssemblyError naming the exact
// missing path when the directory doesn't exist (fs.statSync(inputPath, {throwIfNoEntry:false})
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
  // wb-render.js is CLI-only (writes {prefix}-Work-Breakdown.md/.csv itself and exits) — shell
  // out, same subprocess convention pm-phase2.js used for its own (now-removed) automatic call.
  // No destination-dir argument needed: wb-render.js defaults it to the parent of its own
  // <wbs-dir> argument, which is already featureDir.
  execFileSync(process.execPath, [path.join(__dirname, 'wb-render.js'), wbsDir, prefix])
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
