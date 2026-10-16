export const meta = {
  controlPlaneVersion: 1,
  name: 'pm-phase1',
  description: 'Deterministic documentation workflow; returns Gate 1 evidence.',
  phases: [{ title: 'Discovery' }, { title: 'Requirements' }, { title: 'Tech-Spec' }, { title: 'Validation' }],
}

const c = control
const { featurePath, featureDir, prefix } = c.feature(args[0])
const force = args.includes('--force')
return c.run(meta.name, featureDir, prefix, async () => {
  const file = suffix => `${featureDir}/${prefix}-${suffix}.md`
  const fresh = (output, inputs = [featurePath]) => c.exists(output) && c.read(output).trim().length > 0 && inputs.every(input => c.exists(input) && c.mtime(output) >= c.mtime(input))
  // A long single-turn response (a feature complex enough to need many Use
  // Cases/sections) can exceed the model's configured output-token ceiling
  // mid-reply — confirmed against a real run where the CLI reported a clean
  // exit (exitCode 0, is_error false, stop_reason "end_turn") with nothing in
  // the response envelope signaling that anything was cut off. Only the
  // document's own expected structure can catch this. Both Requirements (9
  // top-level sections) and Tech-Spec (12) have a fixed, numbered skeleton
  // (see their own agent definitions' "Output Structure"), so a missing
  // "## N. " heading is a reliable, deterministic sign of truncation.
  // Checked both right after generation (fail fast with an attributable
  // error, not a silently-accepted half-document) and as part of the
  // freshness test (so a previously truncated file left on disk from an
  // earlier failed run is never mistaken for "fresh enough" on a later resume).
  const missingSections = (content, count) => Array.from({ length: count }, (_, i) => i + 1).filter(n => !new RegExp(`^## ${n}\\.\\s`, 'm').test(content))
  const assertCompleteSections = (label, content, count) => {
    const missing = missingSections(content, count)
    if (missing.length) throw new Error(`${label} output is incomplete: missing section(s) ${missing.join(', ')} of ${count} — likely truncated mid-generation (a model output-length ceiling was probably exceeded)`)
  }
  const reqId = 'gaia.agent.planner.requirements'
  const reqUcId = 'gaia.agent.planner.requirements-use-case'
  const specId = 'gaia.agent.planner.tech-spec'
  const valId = 'gaia.agent.planner.validate-feature-docs'
  const output = (suffix, inputs = [featurePath]) => ({ path: file(suffix), inputs })
  const techSpec = () => c.worker(specId, featurePath, { outputs: [output('Tech-Spec', [featurePath, file('Requirements')])] })

  // Deliberately NOT file('req') — same reasoning as FTR-020's wbsDir: this is a directory
  // nested inside the feature's own already-prefixed folder, so a second prefix would be
  // redundant.
  const reqDir = `${featureDir}/req`
  const reqIndexPath = `${reqDir}/index.md`

  // Duplicated (not imported) from req-assembler.js's own export of the same name —
  // pm-phase1.js's workflow-runner sandbox has no `require`, so getting this via another
  // c.command round-trip would be unnecessary overhead for a few-line table parse already
  // needed in-process to drive the per-UC loop below (FTR-021 Tech-Spec §5).
  function parseUseCaseIndexTable(indexContent) {
    const lines = indexContent.split('\n')
    let start = -1, end = lines.length
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^## (\d+)\.\s/)
      if (!m) continue
      const n = Number(m[1])
      if (n === 2) start = i
      else if (start !== -1 && n > 2) { end = i; break }
    }
    if (start === -1) throw new Error("req/index.md is missing section 2 (Use Cases)")
    const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
    if (tableLines.length < 2) return []
    return tableLines.slice(2).map(line => {
      const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
      const [id, title, actor, priority, fileCol] = cells
      const fileMatch = fileCol && fileCol.match(/\(([^)]+)\)/)
      if (!fileMatch) throw new Error(`malformed File column for UC "${id}" in req/index.md`)
      return { id, title, actor, priority, file: fileMatch[1] }
    })
  }

  function buildUcPrompt(row, ucTable, featurePathArg) {
    const compactIndex = ucTable.map(r => `${r.id}: ${r.title} (${r.actor})`).join('\n')
    return `${featurePathArg}\n\nGenerate the full detail for this use case:\n` +
      `UC ID: ${row.id}\nTitle: ${row.title}\nActor: ${row.actor}\nPriority: ${row.priority}\n\n` +
      `Full use-case index (for cross-UC awareness, do not restate):\n${compactIndex}`
  }

  // forceAll: bypasses resume-by-existence entirely, re-dispatching the skeleton and every
  // use case unconditionally, overwriting whatever is already on disk. Two call sites, two
  // different needs: the initial-generation branch wants resume-by-existence (UC-04 — only
  // pick up where a crashed/interrupted run left off); the needsRequirementsFix branch
  // (validator found a gap) wants a full blind regeneration, exactly like the pre-FTR-021
  // single-call behavior — by the time a fix is requested, every use case file already
  // exists from the prior full run, so resume-by-existence alone would skip every one of
  // them and silently reproduce the same (flagged-as-incomplete) document.
  async function generateRequirements(forceAll) {
    // A req/index.md that exists but is older than feature.md is NOT a resumable partial
    // run — it was generated against a feature.md that has since changed, so resuming from
    // it would keep stale skeleton content (UC list, Business Rules, AC table) forever.
    // Only an index.md that is both present AND still fresh relative to feature.md is
    // evidence of a genuine mid-run crash (UC-04) rather than staleness.
    const skeletonStale = c.exists(reqIndexPath) && !fresh(reqIndexPath)
    const regenSkeleton = forceAll || skeletonStale || !c.exists(reqIndexPath)

    // 1. Skeleton (no declared worker() output — host writes it itself, mirroring FTR-020's
    // skeleton step)
    if (regenSkeleton) {
      const skeleton = await c.worker(reqId, featurePath)
      c.writeOutput(reqIndexPath, skeleton)
    }

    // 2. Structural self-consistency pre-check (req-skeleton-check.js, same
    // req-graph-checks.js functions — run via subprocess since this runtime has no `require`)
    await c.activity('req-skeleton-check', async () => {
      const res = c.command(['run-asset', 'scripts/req-skeleton-check.js', '--project', c.root,
        '--', reqIndexPath], [0, 1])
      const parsed = JSON.parse(res.stdout)
      if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
          (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid skeleton-check result')
      if (!parsed.valid) throw new Error('Requirements skeleton failed structural checks: ' + res.stdout)
      return parsed
    })

    // 3. Per-use-case generation, resume-by-existence, sequential
    const ucTable = parseUseCaseIndexTable(c.read(reqIndexPath))
    for (const row of ucTable) {
      const ucPath = `${reqDir}/${row.file}`
      // If the skeleton itself was just (re)generated, every use case must regenerate too —
      // an existing use-case file would have been written against the OLD skeleton's row
      // (title/actor/priority may have changed) and cannot be trusted as-is.
      if (!regenSkeleton && c.exists(ucPath)) continue // resume: skip, no dispatch
      const detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath),
        { label: `requirements-use-case:${row.id}` })
      c.writeOutput(ucPath, detail)
    }

    // 4. Assembly (req-assembler.js) — writes the assembled document to the same path every
    // downstream consumer (Tech-Spec generation, validation, docsDigest) already reads.
    const assembled = c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root,
      '--', reqDir]).stdout
    c.writeOutput(file('Requirements'), assembled)
  }

  let changed = false
  if (force || !fresh(file('Requirements')) || missingSections(c.read(file('Requirements')), 9).length) {
    await generateRequirements(force)
    if (!c.exists(file('Requirements'))) throw new Error('Requirements output missing')
    assertCompleteSections('Requirements', c.read(file('Requirements')), 9)
    changed = true
  }
  if (force || changed || !fresh(file('Tech-Spec'), [featurePath, file('Requirements')]) || missingSections(c.read(file('Tech-Spec')), 12).length) {
    await techSpec()
    if (!c.exists(file('Tech-Spec'))) throw new Error('Tech-Spec output missing')
    assertCompleteSections('Tech-Spec', c.read(file('Tech-Spec')), 12)
    changed = true
  }
  let validationSummary = 'skipped (fresh)'
  if (force || changed || !fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) {
    // FTR-023: structural pre-check — every Tech-Spec File Inventory "Addresses" reference
    // must resolve to a real Requirements AC ID, before any gaia-validate-feature-docs
    // (semantic) token is spent on a structurally broken document.
    await c.activity('tech-spec-ac-check', async () => {
      const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
        '--', file('Tech-Spec'), file('Requirements')], [0, 1])
      const parsed = JSON.parse(res.stdout)
      if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
          (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
      if (!parsed.valid) throw new Error('Tech-Spec has dangling AC references: ' + res.stdout)
      return parsed
    })
    for (let cycle = 1; cycle <= 3; cycle++) {
      // needsRequirementsFix/needsTechSpecFix: explicit structured routing fields,
      // not inferred by substring-matching the free-text `findings` array (which a
      // finding mentioning both document names, or neither, would mis-route or
      // silently skip). The validator agent itself decides which document(s) its
      // own findings implicate.
      const result = await c.worker(valId, featurePath + '\nValidate only; the host owns the revision loop. Return valid, a findings array (one string per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least one finding implicates that document), and the full validation report content. Do not dispatch other agents.', { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, file('Requirements'), file('Tech-Spec')])], schema: { type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } }, needsRequirementsFix: { type: 'boolean' }, needsTechSpecFix: { type: 'boolean' }, report: { type: 'string' } }, required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report'] } })
      // A model returning valid:true alongside non-empty findings (or valid:false
      // with none) contradicts its own schema's intent — never silently treated as
      // "not clean yet" and spent on another cycle without surfacing the
      // inconsistency; fail closed instead of masking a confused response.
      if (result.valid === (result.findings.length > 0)) {
        throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s)`)
      }
      if (result.valid) {
        if (!fresh(file('Validation-Report'), [featurePath, file('Requirements'), file('Tech-Spec')])) throw new Error('Validation agent did not produce its report')
        validationSummary = `0 gaps (clean on cycle ${cycle})`
        break
      }
      if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
      if (!result.needsRequirementsFix && !result.needsTechSpecFix) throw new Error(`Validation agent reported gaps on cycle ${cycle} but flagged neither document for revision`)
      if (result.needsRequirementsFix) await generateRequirements(true)
      if (result.needsTechSpecFix) await techSpec()
    }
  }
  // Binds Gate 1's eventual approval to the EXACT Requirements/Tech-Spec bytes
  // produced here, not just "a file named *-Requirements.md exists" — SKILL.md's
  // Step 2 embeds this verbatim into Approvals.md, and pm-phase2.js's Gate 1 check
  // fails closed if the current file content no longer matches it (content
  // regenerated after approval, e.g. via a later --force run, must re-approve).
  const docsDigest = c.hash(c.read(file('Requirements')) + '\u0000' + c.read(file('Tech-Spec')))
  c.append(`${featureDir}/${prefix}-process-log.txt`, `[${new Date().toISOString()}] pm-phase1: ${validationSummary}; Gate 1 approval requested\n`)
  return {
    prefix, feature_dir: featureDir, feature_path: featurePath,
    requirements: { path: file('Requirements'), summary: 'Requirements ready' },
    tech_spec: { path: file('Tech-Spec'), summary: 'Tech-Spec ready' },
    validation: { path: file('Validation-Report'), summary: validationSummary },
    docs_digest: docsDigest,
    token_ledger: c.tokenLedger, errors: [],
  }
})
