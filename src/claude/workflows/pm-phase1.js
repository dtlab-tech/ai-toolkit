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
  const specComponentId = 'gaia.agent.planner.tech-spec-component'
  const valId = 'gaia.agent.planner.validate-feature-docs'
  const output = (suffix, inputs = [featurePath]) => ({ path: file(suffix), inputs })

  // Templates live under the toolkit's own installed scripts/templates/ — outside this project
  // for a globally-installed toolkit, which a non-interactive `--print` worker invocation has no
  // way to get permission for (no TTY to answer a prompt; confirmed by a real run failing with
  // "Worker permission denied: ...; tools: Read" against exactly this kind of path). The host
  // reads the template itself (a plain Node process, never subject to the Claude Code
  // tool-permission system) via the dedicated print-asset CLI command, and inlines its text
  // directly into the prompt — the agent is never asked to Read it. Same pattern FTR-025 already
  // established for inlining Requirements/Tech-Spec text into gaia-validate-feature-docs' prompt.
  function readTemplate(templateFile) {
    return c.command(['print-asset', `scripts/templates/${templateFile}`, '--project', c.root]).stdout
  }
  function withTemplate(prompt, label, templateFile) {
    return `${prompt}\n\nTemplate (${label}):\n${readTemplate(templateFile)}`
  }

  // Deliberately NOT file('req') — same reasoning as FTR-020's wbsDir: this is a directory
  // nested inside the feature's own already-prefixed folder, so a second prefix would be
  // redundant.
  const reqDir = `${featureDir}/req`
  const reqIndexPath = `${reqDir}/index.md`

  // Shared by every req/index.md table parser below — same section-finding/table-row algorithm
  // req-assembler.js's own findSectionRange/parseTableRows use, duplicated (not imported) since
  // pm-phase1.js's workflow-runner sandbox has no `require`.
  function findReqSection(lines, n) {
    let start = -1, end = lines.length
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^## (\d+)\.\s/)
      if (!m) continue
      const num = Number(m[1])
      if (num === n) start = i
      else if (start !== -1 && num > n) { end = i; break }
    }
    return { start, end }
  }
  function parseReqTableRows(lines, start, end) {
    const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
    if (tableLines.length < 2) return []
    return tableLines.slice(2).map(line =>
      line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1))
  }

  function parseUseCaseIndexTable(indexContent) {
    const lines = indexContent.split('\n')
    const { start, end } = findReqSection(lines, 2)
    if (start === -1) throw new Error("req/index.md is missing section 2 (Use Cases)")
    return parseReqTableRows(lines, start, end).map(cells => {
      const [id, title, actor, priority, fileCol] = cells
      const fileMatch = fileCol && fileCol.match(/\(([^)]+)\)/)
      if (!fileMatch) throw new Error(`malformed File column for UC "${id}" in req/index.md`)
      return { id, title, actor, priority, file: fileMatch[1] }
    })
  }

  // Business Rules' "Applies to" / Acceptance Criteria's "Related UC" columns are the same
  // cross-cutting-reference shape: a comma-separated UC-ID list, or the literal "All UCs". Both
  // are 100% mechanically derivable from req/index.md's own tables — no LLM judgment needed,
  // which is exactly why the per-UC generation agent is never given this data at all (see
  // gaia-generate-requirements-use-case.md: it must not re-read req/index.md itself, to avoid
  // re-deciding which UCs exist). The host computes and appends these cross-reference lines
  // itself, after the agent's own response, mirroring how disambiguateFileSlugs/computeDependsOnPhases
  // post-process agent/skeleton output elsewhere in this lineage.
  function parseBusinessRulesTable(indexContent) {
    const lines = indexContent.split('\n')
    const { start, end } = findReqSection(lines, 3)
    if (start === -1) throw new Error('req/index.md is missing section 3 (Business Rules)')
    return parseReqTableRows(lines, start, end).map(([id, rule, appliesTo]) => ({ id, appliesTo }))
  }
  function parseAcTableRelatedUc(indexContent) {
    const lines = indexContent.split('\n')
    const { start, end } = findReqSection(lines, 7)
    if (start === -1) throw new Error('req/index.md is missing section 7 (Acceptance Criteria)')
    return parseReqTableRows(lines, start, end).map(([id, criterion, relatedUc]) => ({ id, relatedUc }))
  }
  function idsApplyingToUc(rows, ucId, column) {
    return rows.filter(r => {
      const val = (r[column] || '').trim()
      return val.toLowerCase() === 'all ucs' || val.split(',').map(s => s.trim()).includes(ucId)
    }).map(r => r.id)
  }
  function ucCrossReferences(indexContent, ucId) {
    const relatedBRs = idsApplyingToUc(parseBusinessRulesTable(indexContent), ucId, 'appliesTo')
    const relatedACs = idsApplyingToUc(parseAcTableRelatedUc(indexContent), ucId, 'relatedUc')
    return '\n\n**Related Business Rules:** ' + (relatedBRs.length ? relatedBRs.join(', ') : '—') +
      ' (see [index.md](../index.md#3-business-rules))\n\n**Related Acceptance Criteria:** ' +
      (relatedACs.length ? relatedACs.join(', ') : '—') + ' (see [index.md](../index.md#7-acceptance-criteria))\n'
  }

  function buildUcPrompt(row, ucTable, featurePathArg, ucTemplate) {
    const compactIndex = ucTable.map(r => `${r.id}: ${r.title} (${r.actor})`).join('\n')
    const base = `${featurePathArg}\n\nGenerate the full detail for this use case:\n` +
      `UC ID: ${row.id}\nTitle: ${row.title}\nActor: ${row.actor}\nPriority: ${row.priority}\n\n` +
      `Full use-case index (for cross-UC awareness, do not restate):\n${compactIndex}`
    return `${base}\n\nTemplate (req/use-cases/{UC-ID}.md):\n${ucTemplate}`
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
    // Staleness is BOTH an mtime check and a structural-completeness check — the same
    // combination the outer gate below uses to decide whether to call this function at all. A
    // skeleton can be mtime-fresh (just written this run) yet truncated (a model output-length
    // ceiling cut it off mid-reply); without the missingSections half here too, the outer gate
    // would correctly decide "this needs regeneration" while this inner decision disagreed and
    // silently reused the truncated skeleton anyway — found exactly this way, via a resume test
    // that corrupts the skeleton (not an assembled file, which no longer exists to corrupt).
    const skeletonStale = c.exists(reqIndexPath) &&
      (!fresh(reqIndexPath) || missingSections(c.read(reqIndexPath), 9).length > 0)
    const regenSkeleton = forceAll || skeletonStale || !c.exists(reqIndexPath)

    // 1. Skeleton (no declared worker() output — host writes it itself, mirroring FTR-020's
    // skeleton step)
    if (regenSkeleton) {
      const skeleton = await c.worker(reqId, withTemplate(featurePath, 'req/index.md', 'gaia-requirements-index-template.md'))
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
    // Read once, outside the loop — the template is identical for every use case in this run.
    const ucTemplate = ucTable.length ? readTemplate('gaia-use-case-template.md') : null
    for (const row of ucTable) {
      const ucPath = `${reqDir}/${row.file}`
      // If the skeleton itself was just (re)generated, every use case must regenerate too —
      // an existing use-case file would have been written against the OLD skeleton's row
      // (title/actor/priority may have changed) and cannot be trusted as-is.
      if (!regenSkeleton && c.exists(ucPath)) continue // resume: skip, no dispatch
      const detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath, ucTemplate),
        { label: `requirements-use-case:${row.id}` })
      c.writeOutput(ucPath, detail.trimEnd() + ucCrossReferences(c.read(reqIndexPath), row.id))
    }
    // No assembly/write step here — generation only ever produces req/index.md + its per-UC
    // files. Assembly happens in-memory, on demand, at the top level below (never persisted by
    // this function); a user who wants a single combined file runs assemble-docs.js explicitly.
  }

  // Deliberately NOT file('spec') — same reasoning as reqDir/wbsDir: this directory is nested
  // inside the feature's own already-prefixed folder, so a second prefix would be redundant.
  const specDir = `${featureDir}/spec`
  const specIndexPath = `${specDir}/index.md`

  // Duplicated (not imported) from tech-spec-assembler.js's own export of the same name — this
  // runtime has no `require`, so getting this via another c.command round-trip would be
  // unnecessary overhead for a parse already needed in-process to drive the per-component loop.
  function parseComponentsTable(indexContent) {
    const lines = indexContent.split('\n')
    let start = -1, end = lines.length
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^## (\d+)\.\s/)
      if (!m) continue
      const n = Number(m[1])
      if (n === 9) start = i
      else if (start !== -1 && n > 9) { end = i; break }
    }
    if (start === -1) throw new Error('spec/index.md is missing section 9 (File Inventory)')
    const entries = []
    for (const [heading, changeType] of [['New files', 'New'], ['Modified files', 'Modified']]) {
      let subStart = -1
      for (let i = start; i < end; i++) {
        if (lines[i].trim() === `### ${heading}`) { subStart = i; break }
      }
      if (subStart === -1) continue
      let subEnd = end
      for (let i = subStart + 1; i < end; i++) {
        if (/^#{2,3}\s/.test(lines[i])) { subEnd = i; break }
      }
      const tableLines = lines.slice(subStart, subEnd).filter(l => l.trim().startsWith('|'))
      if (tableLines.length < 2) continue
      for (const line of tableLines.slice(2)) {
        const cells = line.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
        // Column order: Addresses MUST stay 3rd (index 2) — the exact position
        // tech-spec-graph-checks.js's unmodified, positional parser already reads from a
        // 3-column legacy table (FTR-023). Domain/Spec are new trailing columns.
        const [filePath, purposeOrChange, addresses, domain, specLink] = cells
        const m = specLink && specLink.match(/\(components\/([^)]+)\)/)
        if (!m) throw new Error(`malformed Spec column for "${filePath}" in spec/index.md`)
        entries.push({ filePath, purposeOrChange, changeType, domain, addresses, fileSlug: m[1] })
      }
    }
    return entries
  }

  function buildComponentPrompt(row, components, featurePathArg, componentTemplate) {
    const compactIndex = components.map(c => `${c.filePath} (${c.domain})`).join('\n')
    const base = `${featurePathArg}\n\nGenerate the full technical design for this component:\n` +
      `Path: ${row.filePath}\nChange: ${row.changeType}\nDomain: ${row.domain}\nAddresses: ${row.addresses}\n\n` +
      `Full component index (for cross-component awareness, do not restate):\n${compactIndex}`
    return `${base}\n\nTemplate (spec/components/{fileSlug}.md):\n${componentTemplate}`
  }

  // Deterministic, host-computed — never asks the model to pick unique names (same principle
  // as materializeIndex's detailFile/status derivations in the Work Breakdown's own skeleton,
  // FTR-020). Rewrites any colliding fileSlug's Spec-column link in place, right-to-left
  // prepending path segments until unique.
  //
  // Operates per-LINE, not via a global string .replace() over the whole document — a real bug,
  // found by testing two colliding entries directly: when both rows share byte-identical Spec
  // text (the whole point of a collision), a global .replace() always rewrites the FIRST
  // occurrence, never the specific (second, third, ...) row actually being disambiguated.
  function disambiguateFileSlugs(skeletonText) {
    const lines = skeletonText.split('\n')
    const seenSlugs = new Set()
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim().startsWith('|')) continue
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, a) => idx > 0 && idx < a.length - 1)
      if (cells.length < 5) continue
      const filePath = cells[0]
      const m = cells[4].match(/\(components\/([^)]+)\)/)
      if (!m) continue // header/separator row, or a row with no valid Spec link yet
      let slug = m[1]
      if (seenSlugs.has(slug)) {
        const segments = filePath.split('/')
        let depth = 1
        let candidate = slug
        while (seenSlugs.has(candidate)) {
          depth += 1
          candidate = segments.slice(-depth).join('-') + '.md'
        }
        const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        lines[i] = line.replace(new RegExp(`components/${escaped}`, 'g'), `components/${candidate}`)
        slug = candidate
      }
      seenSlugs.add(slug)
    }
    return lines.join('\n')
  }

  // forceAll: bypasses resume-by-existence entirely, re-dispatching the skeleton and every
  // component unconditionally — same two-call-site reasoning as generateRequirements(forceAll).
  async function generateTechSpec(forceAll) {
    // See generateRequirements's identical comment — staleness is both an mtime check and a
    // structural-completeness check, consistent with the outer gate's own criteria.
    const skeletonStale = c.exists(specIndexPath) &&
      (!fresh(specIndexPath) || missingSections(c.read(specIndexPath), 12).length > 0)
    const regenSkeleton = forceAll || skeletonStale || !c.exists(specIndexPath)

    // 1. Skeleton (no declared worker() output — host writes it itself)
    if (regenSkeleton) {
      const skeleton = await c.worker(specId, withTemplate(featurePath, 'spec/index.md', 'gaia-tech-spec-index-template.md'))
      c.writeOutput(specIndexPath, disambiguateFileSlugs(skeleton))
    }

    // 2. Structural pre-check (tech-spec-graph-checks.js, unmodified — FTR-023 — now pointed at
    // the skeleton instead of the assembled document, strictly before any per-component token
    // is spent)
    await c.activity('tech-spec-ac-check', async () => {
      const res = c.command(['run-asset', 'scripts/tech-spec-graph-checks.js', '--project', c.root,
        '--', specIndexPath, reqIndexPath], [0, 1])
      const parsed = JSON.parse(res.stdout)
      if (typeof parsed.valid !== 'boolean' || !Array.isArray(parsed.errors) ||
          (res.exitCode === 0) !== parsed.valid) throw new Error('Invalid tech-spec-ac-check result')
      if (!parsed.valid) throw new Error('Tech-Spec has dangling AC references: ' + res.stdout)
      return parsed
    })

    // 3. Per-component generation, resume-by-existence, sequential
    const components = parseComponentsTable(c.read(specIndexPath))
    // Read once, outside the loop — the template is identical for every component in this run.
    const componentTemplate = components.length ? readTemplate('gaia-component-template.md') : null
    for (const comp of components) {
      const compPath = `${specDir}/components/${comp.fileSlug}`
      if (!regenSkeleton && c.exists(compPath)) continue // resume: skip, no dispatch
      const detail = await c.worker(specComponentId, buildComponentPrompt(comp, components, featurePath, componentTemplate),
        { label: `tech-spec-component:${comp.fileSlug}` })
      c.writeOutput(compPath, detail)
    }
    // No assembly/write step here — generation only ever produces spec/index.md + its
    // per-component files. Assembly happens in-memory, on demand, at the top level below (never
    // persisted by this function); a user who wants a single combined file runs assemble-docs.js
    // explicitly.
  }

  // In-memory assembly — same req-assembler.js/tech-spec-assembler.js subprocess calls
  // generation used to write to disk itself (FTR-025); now the host keeps their stdout only in
  // memory, for the validator's inlined prompt and docsDigest. Cheap and deterministic (no LLM
  // cost), so safe to (re)compute unconditionally, including on a fully-fresh resume where
  // neither generate function below is even called.
  function assembleRequirements() {
    return c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
  }
  function assembleTechSpec() {
    return c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
  }

  // The outer gate deciding whether to even call generateRequirements/generateTechSpec must
  // notice a missing PER-ITEM file too, not just skeleton freshness/completeness — otherwise a
  // crash that left one use-case/component file missing (while the skeleton itself is perfectly
  // fine) would never be revisited on a non-force resume, since nothing about the skeleton's own
  // freshness changed. A real gap found via this exact resume scenario: this used to be covered
  // for free by gating on the assembled document's own freshness (which could never look
  // "complete" while a referenced item was missing) — removing that gate (FTR-025) removed this
  // side effect along with it, so it needs restating explicitly here.
  const anyUcFileMissing = indexContent => parseUseCaseIndexTable(indexContent).some(row => !c.exists(`${reqDir}/${row.file}`))
  const anyComponentFileMissing = indexContent => parseComponentsTable(indexContent).some(comp => !c.exists(`${specDir}/components/${comp.fileSlug}`))

  let changed = false
  if (force || !fresh(reqIndexPath) || missingSections(c.read(reqIndexPath), 9).length ||
      (c.exists(reqIndexPath) && anyUcFileMissing(c.read(reqIndexPath)))) {
    await generateRequirements(force)
    if (!c.exists(reqIndexPath)) throw new Error('Requirements output missing')
    assertCompleteSections('Requirements', c.read(reqIndexPath), 9)
    changed = true
  }
  if (force || changed || !fresh(specIndexPath, [featurePath, reqIndexPath]) || missingSections(c.read(specIndexPath), 12).length ||
      (c.exists(specIndexPath) && anyComponentFileMissing(c.read(specIndexPath)))) {
    await generateTechSpec(force)
    if (!c.exists(specIndexPath)) throw new Error('Tech-Spec output missing')
    assertCompleteSections('Tech-Spec', c.read(specIndexPath), 12)
    changed = true
  }
  let assembledRequirements = assembleRequirements()
  let assembledTechSpec = assembleTechSpec()
  let validationSummary = 'skipped (fresh)'
  if (force || changed || !fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) {
    for (let cycle = 1; cycle <= 3; cycle++) {
      // needsRequirementsFix/needsTechSpecFix: explicit structured routing fields,
      // not inferred by substring-matching the free-text `findings` array (which a
      // finding mentioning both document names, or neither, would mis-route or
      // silently skip). The validator agent itself decides which document(s) its
      // own findings implicate.
      const result = await c.worker(valId,
        `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\n` +
        'Validate only; the host owns the revision loop. Return valid, a findings array (one string per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least one finding implicates that document), and the full validation report content. Do not dispatch other agents.',
        { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, reqIndexPath, specIndexPath])], schema: { type: 'object', properties: { valid: { type: 'boolean' }, findings: { type: 'array', items: { type: 'string' } }, needsRequirementsFix: { type: 'boolean' }, needsTechSpecFix: { type: 'boolean' }, report: { type: 'string' } }, required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report'] } })
      // A model returning valid:true alongside non-empty findings (or valid:false
      // with none) contradicts its own schema's intent — never silently treated as
      // "not clean yet" and spent on another cycle without surfacing the
      // inconsistency; fail closed instead of masking a confused response.
      if (result.valid === (result.findings.length > 0)) {
        throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s)`)
      }
      if (result.valid) {
        if (!fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) throw new Error('Validation agent did not produce its report')
        validationSummary = `0 gaps (clean on cycle ${cycle})`
        break
      }
      if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
      if (!result.needsRequirementsFix && !result.needsTechSpecFix) throw new Error(`Validation agent reported gaps on cycle ${cycle} but flagged neither document for revision`)
      if (result.needsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }
      if (result.needsTechSpecFix) { await generateTechSpec(true); assembledTechSpec = assembleTechSpec() }
    }
  }
  // Binds Gate 1's eventual approval to the EXACT Requirements/Tech-Spec bytes
  // produced here, not just "a file named *-Requirements.md exists" — SKILL.md's
  // Step 2 embeds this verbatim into Approvals.md, and pm-phase2.js's Gate 1 check
  // fails closed if the current file content no longer matches it (content
  // regenerated after approval, e.g. via a later --force run, must re-approve).
  const docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
  c.append(`${featureDir}/${prefix}-process-log.txt`, `[${new Date().toISOString()}] pm-phase1: ${validationSummary}; Gate 1 approval requested\n`)
  return {
    prefix, feature_dir: featureDir, feature_path: featurePath,
    requirements: { path: reqIndexPath, summary: 'Requirements ready (split; req/index.md + req/use-cases/*.md)' },
    tech_spec: { path: specIndexPath, summary: 'Tech-Spec ready (split; spec/index.md + spec/components/*.md)' },
    validation: { path: file('Validation-Report'), summary: validationSummary },
    docs_digest: docsDigest,
    token_ledger: c.tokenLedger, errors: [],
  }
})
