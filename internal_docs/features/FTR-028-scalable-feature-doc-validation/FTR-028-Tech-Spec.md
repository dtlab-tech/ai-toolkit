# Technical Specification — Scalable Feature-Doc Validation

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-028 |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Draft |

## 1. Overview

Caps `gaia-validate-feature-docs`'s own prompt size to the Tech-Spec skeleton (`spec/index.md`),
eliminating the unbounded growth driver that caused a real production run (58 components, 552,863
prompt tokens) to hard-fail with no recoverable structured output. Coverage is preserved, not
weakened, via two new mechanisms: a deterministic, host-only AC↔component traceability check
(zero LLM cost, immune to scale), and a narrowly-scoped drill-down pass that reads only the
specific component files a flagged claim actually needs, batched to stay bounded even if many
components are flagged at once. `docsDigest` (Gate 1's approval binding) is untouched — it always
hashes the full, unreduced assembled documents.

## 2. Architecture

### 2.1 System Context

No new system boundary. This feature changes one validation step inside an existing workflow
script (`pm-phase1.js`), rewords one existing agent's contract
(`gaia-validate-feature-docs.md`), adds one new narrowly-scoped agent
(`gaia-validate-tech-spec-component-detail.md`) with its own `lib/agent-registry.js` entry, and
extends one existing integration test file. No new script, no new CLI command, no new installer
catalog entry (agents install by directory glob, not individual listing).

### 2.2 Component Diagram

```
Before (today):
  pm-phase1.js: assembledTechSpec = tech-spec-assembler.js's loadTechSpec()  (full per-component bodies spliced in)
  pm-phase1.js: validator prompt  = featurePath + assembledRequirements + assembledTechSpec
                |
                +-- prompt size grows with per-component DESIGN PROSE length, unbounded (552k tokens, real incident)

After (this feature):
  pm-phase1.js: validator prompt Tech-Spec text = raw spec/index.md (skeleton only, one row/component)
  pm-phase1.js: assembledTechSpec STILL computed, unchanged, but ONLY for docsDigest (Gate 1 binding)
  pm-phase1.js: + deterministic AC<->component traceability check (zero LLM, every cycle)
  pm-phase1.js: + needsComponentDetail entries -> deduped by fileSlug -> batched (<=K) -> drill-down worker call(s)
                |
                +-- validator prompt size bounded by component COUNT; deep-technical coverage recovered narrowly
```

### 2.3 Sequence Diagrams

**Main validation cycle (UC-01, UC-02, UC-03), per `pm-phase1.js` validation step:**
```
pm-phase1.js: build prompt = featurePath + assembledRequirements + read(specIndexPath)  [skeleton only]
pm-phase1.js: dispatch gaia-validate-feature-docs -> { valid, findings, needsRequirementsFix,
              needsTechSpecFix, report, needsComponentDetail }
pm-phase1.js: computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent) -> structuralFindings[]
pm-phase1.js: for each needsComponentDetail entry:
                fileSlug exists in spec/index.md's component table?
                  no  -> drop; append "Tech-Spec: ..." finding about the bad reference
                  yes -> group into claimsByFileSlug
pm-phase1.js: batch claimsByFileSlug's keys into groups of <= K
pm-phase1.js: for each batch -> dispatch gaia-validate-tech-spec-component-detail -> { findings[] }
pm-phase1.js: mergedFindings = findings ++ structuralFindings ++ drillDownFindings (all batches)
pm-phase1.js: mergedValid = valid && structuralFindings.length === 0 && drillDownFindings.length === 0
pm-phase1.js: mergedNeedsTechSpecFix = needsTechSpecFix || any new finding is "Tech-Spec: "-prefixed
pm-phase1.js: mergedNeedsRequirementsFix = needsRequirementsFix || any new finding is "Requirements: "-prefixed
pm-phase1.js: contradiction guard now evaluates mergedValid/mergedFindings (was: valid/findings)
pm-phase1.js: write augmented report (original report + any appended findings sections) to Validation-Report.md
pm-phase1.js: docsDigest = hash(assembledRequirements + '\u0000' + assembledTechSpec)  [UNCHANGED — full docs]
```

**Drill-down batch dispatch (UC-03), per batch:**
```
pm-phase1.js: prompt = for each {fileSlug, claims[]} in batch:
                "Claim: {claim}\nComponent file: {absolute path to spec/components/{fileSlug}}"
gaia-validate-tech-spec-component-detail: Read each named file only
gaia-validate-tech-spec-component-detail: for each claim -> confirmed by file content?
                                            no -> emit "Tech-Spec: ..." finding
                                            yes -> no finding
gaia-validate-tech-spec-component-detail: return { findings: string[] }
```

## 3. Backend

### src/claude/agents/gaia-validate-tech-spec-component-detail.md

## Algorithm

Frontmatter (mirrors `gaia-generate-tech-spec-component.md`'s model/tool choice — a narrow,
single-purpose per-batch agent):

```markdown
---
name: gaia-validate-tech-spec-component-detail
description: "Verifies a small batch of claims against the specific component design files named by the host. Input: a list of {claim, component file path} pairs"
model: haiku
tools: Read, Glob, Grep
---
```

Body structure (condensed from the full file; see Output Structure below for the exact schema):

```markdown
# Validate Tech-Spec Component Detail

A narrow QA agent: for each claim in this batch, Read ONLY the one named component file and decide
whether its own content satisfies that claim. Do not Read, Glob, or Grep for `feature.md`,
`req/index.md`, `spec/index.md`, or any component file NOT explicitly named in this prompt — every
file you need is already named below; searching for anything else is out of scope for this agent
and wastes the narrow batch this call was sized for.

## Phase 1 — Load This Batch

The host supplies, in the dispatch prompt, one entry per line:
`Claim: {claim text}` followed by `Component file: {absolute path}`.
Multiple claims may name the SAME component file — Read each distinct file only once, then check
every claim assigned to it against that one reading.

## Phase 2 — Verify Each Claim

For each claim, Read its named file (if not already read for an earlier claim in this batch) and
decide: does this file's own actual content (its Change/Algorithm/Schema/Tests sections, or
whichever of those the file actually has) satisfy the claim? Be specific and literal — a claim
about an exact endpoint method/path, a schema field, or an error code is satisfied only if that
exact detail is actually present in the file, not merely plausible given the file's general topic.

## Phase 3 — Structured Completion (MANDATORY — your final response)

Return a single JSON object with exactly one field:

```json
{"findings": ["Tech-Spec: components/AuthMiddleware.cs.md does not document a 401 response for an expired token, as feature.md requires"]}
```

- `findings` is an array of strings, one per claim that is NOT satisfied by its named file's
  content. A satisfied claim produces NO entry — do not report successes.
- Every finding string is prefixed `"Tech-Spec: "`, matching the same convention
  `gaia-validate-feature-docs`'s own `findings` array and the host's deterministic
  AC↔component check already use, so the host can merge every source into one array with no
  format-specific handling for this agent's own output.
- An empty array (`{"findings": []}`) means every claim in this batch was confirmed.
- The caller supplies `--json-schema`; use the runtime's structured-output mechanism to return this
  object in `structured_output`.

## Guidelines

- **Read only the named files** — never search for or infer any other document.
- **One call, one batch** — do not ask the host for more context; if a named file's content is
  genuinely ambiguous about a claim, report it as NOT satisfied (fail closed) rather than guessing.
- **Be literal, not generous** — "plausibly related" is not the same as "actually documented".
```

### src/claude/workflows/pm-phase1.js

## Algorithm

New helper functions, placed near the existing duplicated table parsers (`parseAcTableRelatedUc`
at line 117, `parseComponentsTable` at line 216) — same "no `require()` in this sandboxed runtime"
precedent every other duplicated primitive in this file already follows:

```js
// UC-02: purely deterministic, zero-LLM-cost AC<->component traceability check. Reuses the two
// table parsers already duplicated in this file — no new parsing contract invented. Both
// directions produce a "Tech-Spec: " finding (Open Question 1): the gap is always closed by a
// Tech-Spec revision (either add missing coverage, or fix a bad AC-ID reference).
function computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent) {
  const acIds = new Set(parseAcTableRelatedUc(reqIndexContent).map(r => r.id))
  const components = parseComponentsTable(specIndexContent)
  const addressedAcIds = new Set()
  const findings = []
  for (const comp of components) {
    const refs = (comp.addresses || '').split(',').map(s => s.trim()).filter(s => s && s !== '—')
    for (const ref of refs) {
      addressedAcIds.add(ref)
      if (!acIds.has(ref)) findings.push(`Tech-Spec: component ${comp.filePath} references nonexistent ${ref}`)
    }
  }
  for (const id of acIds) {
    if (!addressedAcIds.has(id)) findings.push(`Tech-Spec: ${id} is not addressed by any Tech-Spec component`)
  }
  return findings
}

// UC-03: validates each needsComponentDetail entry's fileSlug against the real component table
// (BR-05 — a hallucinated/mistyped reference is dropped and reported, never dispatched),
// deduplicates by fileSlug (BR-06, two claims against the same file collapse into one batch
// slot), and splits the remaining unique components into groups of at most DRILL_DOWN_BATCH_SIZE.
const DRILL_DOWN_BATCH_SIZE = 8 // Open Question 4: fixed constant, not externally configurable
function prepareDrillDownBatches(needsComponentDetail, specIndexContent) {
  const validSlugs = new Set(parseComponentsTable(specIndexContent).map(c => c.fileSlug))
  const extraFindings = []
  const claimsByFileSlug = new Map()
  for (const entry of needsComponentDetail || []) {
    if (!validSlugs.has(entry.fileSlug)) {
      extraFindings.push(`Tech-Spec: component-detail check referenced a non-existent file "${entry.fileSlug}" for claim "${entry.claim}"`)
      continue
    }
    if (!claimsByFileSlug.has(entry.fileSlug)) claimsByFileSlug.set(entry.fileSlug, [])
    claimsByFileSlug.get(entry.fileSlug).push(entry.claim)
  }
  const fileSlugs = [...claimsByFileSlug.keys()]
  const batches = []
  for (let i = 0; i < fileSlugs.length; i += DRILL_DOWN_BATCH_SIZE) {
    batches.push(fileSlugs.slice(i, i + DRILL_DOWN_BATCH_SIZE)
      .map(slug => ({ fileSlug: slug, claims: claimsByFileSlug.get(slug) })))
  }
  return { batches, extraFindings }
}

// specDir is already absolute (derived from c.feature()'s realpath-resolved featureDir — see
// deriveFeatureDir/c.feature in lib/workflow-control.js), so this needs no extra path.resolve:
// the same reasoning that already lets featurePath be handed to agents directly (BR-07).
function buildDrillDownPrompt(batch) {
  return batch.map(({ fileSlug, claims }) =>
    claims.map(claim => `Claim: ${claim}\nComponent file: ${specDir}/components/${fileSlug}`).join('\n\n')
  ).join('\n\n')
}

const drillDownId = 'gaia.agent.planner.validate-tech-spec-component-detail'
```

Validation cycle body (replaces `pm-phase1.js:441-468`):

```js
if (force || changed || !fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) {
  for (let cycle = 1; cycle <= 3; cycle++) {
    // needsRequirementsFix/needsTechSpecFix: explicit structured routing fields, not inferred by
    // substring-matching `findings` (unchanged reasoning from today). Tech-Spec text is now the
    // raw skeleton (c.read(specIndexPath)), never assembledTechSpec's fully-spliced output — the
    // one change that bounds this prompt's size to component COUNT, not per-component prose
    // length (UC-01, AC-01). Requirements stays assembledRequirements (full UC detail), unchanged.
    const result = await c.worker(valId,
      `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${c.read(specIndexPath)}\n\n` +
      'Validate only; the host owns the revision loop. Return valid, a findings array (one string ' +
      'per remaining gap), needsRequirementsFix/needsTechSpecFix (true only if at least one finding ' +
      'implicates that document), needsComponentDetail (claims needing a component\'s own design ' +
      'body to verify — see your own instructions for when to use this instead of a finding), and ' +
      'the full validation report content. Do not dispatch other agents.',
      { label: `validation:${cycle}`, outputs: [output('Validation-Report', [featurePath, reqIndexPath, specIndexPath])],
        schema: { type: 'object', properties: {
          valid: { type: 'boolean' },
          findings: { type: 'array', items: { type: 'string' } },
          needsRequirementsFix: { type: 'boolean' },
          needsTechSpecFix: { type: 'boolean' },
          report: { type: 'string' },
          needsComponentDetail: { type: 'array', items: { type: 'object',
            properties: { claim: { type: 'string' }, fileSlug: { type: 'string' } },
            required: ['claim', 'fileSlug'] } },
        }, required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report'] } })
        // needsComponentDetail is declared in `properties` but deliberately NOT in the schema's
        // top-level `required` array: every pre-existing mocked test response for this agent
        // (across the whole suite, predating this feature) omits the field entirely, and making
        // it hard-required would break every one of them for no real gain — prepareDrillDownBatches
        // already treats an absent/undefined value as "no entries" via `needsComponentDetail || []`.
        // The prompt still instructs the agent to always include it (empty array if none).

    // UC-02 + UC-03: every finding source for this cycle, computed/dispatched AFTER the main
    // call returns (re-reading the index files fresh, since a prior cycle may have regenerated
    // them). Zero added LLM cost when both come back empty (the common case).
    const reqIndexContent = c.read(reqIndexPath)
    const specIndexContent = c.read(specIndexPath)
    const structuralFindings = computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent)
    const { batches, extraFindings } = prepareDrillDownBatches(result.needsComponentDetail, specIndexContent)

    const drillDownFindings = []
    for (let b = 0; b < batches.length; b++) {
      const batchResult = await c.worker(drillDownId, buildDrillDownPrompt(batches[b]),
        { label: `validation:${cycle}:component-detail:${b + 1}`,
          schema: { type: 'object', properties: { findings: { type: 'array', items: { type: 'string' } } }, required: ['findings'] } })
      drillDownFindings.push(...batchResult.findings)
    }

    // Implementation refinement found while coding (not anticipated at Tech-Spec time): a raw
    // self-consistency guard runs on the MODEL'S OWN response BEFORE any merge — a pending
    // needsComponentDetail entry is itself a form of "not yet resolved", same as a non-empty
    // findings array, so valid:true requires BOTH empty and valid:false requires at least one
    // non-empty. This is deliberately separate from mergedValid below: a valid:false caused ONLY
    // by needsComponentDetail entries that the drill-down subsequently confirms must still resolve
    // to a clean cycle, not get stuck re-asserting the model's now-stale self-report.
    const rawHasOpenItems = result.findings.length > 0 || (result.needsComponentDetail || []).length > 0
    if (result.valid === rawHasOpenItems) {
      throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s) and ${(result.needsComponentDetail || []).length} needsComponentDetail entry(ies)`)
    }

    // BR-04: merge everything. A model returning valid:true while the host's own independent
    // checks found a real gap is not a self-contradiction (it was never shown that gap) — it is
    // simply now-invalid, same as any other unresolved finding.
    const newFindings = [...structuralFindings, ...extraFindings, ...drillDownFindings]
    const mergedFindings = [...result.findings, ...newFindings]
    // Deliberately NOT `result.valid && ...`: result.valid may be false solely because of
    // needsComponentDetail entries the drill-down above has now fully confirmed (zero
    // drillDownFindings) — the only authoritative signal for the final verdict is whether any
    // finding remains, from any source, after every check this cycle has run.
    const mergedValid = mergedFindings.length === 0
    const mergedNeedsTechSpecFix = result.needsTechSpecFix || newFindings.some(f => f.startsWith('Tech-Spec:'))
    const mergedNeedsRequirementsFix = result.needsRequirementsFix || newFindings.some(f => f.startsWith('Requirements:'))

    // c.worker() already wrote result.report verbatim via its own outputs[0] contract; only
    // overwrite it when this cycle actually added findings the LLM's own report text doesn't
    // mention — the common clean case (newFindings.length === 0) never re-writes the file.
    if (newFindings.length) {
      c.write(file('Validation-Report'), result.report +
        '\n\n## Additional findings (deterministic + component-detail drill-down)\n' +
        newFindings.map(f => `- ${f}`).join('\n') + '\n')
    }
    if (mergedValid) {
      if (!fresh(file('Validation-Report'), [featurePath, reqIndexPath, specIndexPath])) throw new Error('Validation agent did not produce its report')
      validationSummary = `0 gaps (clean on cycle ${cycle})`
      break
    }
    if (cycle === 3) throw new Error('Validation gaps remain after 3 cycles')
    if (!mergedNeedsRequirementsFix && !mergedNeedsTechSpecFix) throw new Error(`Validation agent reported gaps on cycle ${cycle} but flagged neither document for revision`)
    if (mergedNeedsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }
    if (mergedNeedsTechSpecFix) { await generateTechSpec(true); assembledTechSpec = assembleTechSpec() }
  }
}
```

`docsDigest` (`pm-phase1.js:475`, after the loop) is untouched:

```js
const docsDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
```

Both operands are still the full, unreduced output of `assembleRequirements()`/`assembleTechSpec()`
— computed exactly as today, just no longer the same strings handed to the validator's own prompt.

### src/claude/agents/gaia-validate-feature-docs.md

## Algorithm

**Edit 1 — Phase 1, step 3** (replaces the current step 3 at `gaia-validate-feature-docs.md:18-23`):

```markdown
3. The Requirements and Tech-Spec document text is included directly below, inlined into this
   prompt under `Requirements:` and `Tech-Spec:` labels. The Requirements text is the FULL document
   (every Use Case's own flow detail included). The Tech-Spec text is its SKELETON ONLY — Section
   9's own component index table (Purpose, Addresses, Domain, Spec-link columns, one row per
   component) plus every feature-wide section (Overview, Architecture, Security, Database,
   Configuration, Implementation Order, Risks). It deliberately does NOT include any component's
   own Change/Algorithm/Schema/Tests design prose — that per-component detail is validated
   separately, on request, via `needsComponentDetail` (Phase 3). Do NOT attempt to locate or Read
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` or any `spec/components/*` file on disk;
   use the inlined skeleton as the complete Tech-Spec-level input for this pass.
```

**Edit 2 — Phase 3's Tech-Spec coverage-check table** (replaces the table at
`gaia-validate-feature-docs.md:65-72`):

```markdown
### Tech-Spec coverage (against the inlined Tech-Spec SKELETON — Section 9's component table and
feature-wide sections only; no per-component design body is available in this pass)

| Check | Pass condition |
|-------|---------------|
| Every new/modified file in feature.md → listed in File Inventory | Row present with matching Purpose/Domain |
| Every external integration → documented in External Integrations (Section 5's own feature-wide prose, if any) | Mentioned explicitly |
| A claim needs exact technical detail not visible in Purpose/Addresses/Domain (e.g. an endpoint's precise method/path/response shape, a schema field, an error code) | Do NOT guess and do NOT mark it a gap outright. Emit a `needsComponentDetail` entry instead (see below) — never silently drop the check |

AC↔component traceability (every Use Case/AC referenced by the right component, and vice versa) is
NOT this agent's responsibility — it is checked deterministically, by exact ID, by the host after
this call returns. Do not attempt it here; a prose-based traceability finding in this pass would
only duplicate or conflict with that exact-ID check.

**When to use `needsComponentDetail` vs a normal finding:** if feature.md describes something a
component row's Purpose plausibly relates to, but you cannot confirm the EXACT technical detail
without reading that component's own design body, emit a `needsComponentDetail` entry naming that
row's own Spec-link `fileSlug` and the specific claim — do not guess, and do not silently treat it
as either covered or missing. If NO component row is even plausibly related to the claim at all,
that is a normal missing-coverage finding, not a drill-down case.
```

**Edit 3 — Schema/Phase 7** (extends the object at `gaia-validate-feature-docs.md:154-168`):

```json
{
  "valid": true,
  "findings": [],
  "needsRequirementsFix": false,
  "needsTechSpecFix": false,
  "report": "# Validation Report — FTR-001\n\n## Summary\n...",
  "needsComponentDetail": []
}
```

Phase 7's own bullet list gains:

```markdown
- `needsComponentDetail` is an array of `{ claim, fileSlug }` objects — one per claim you could not
  confirm from the Tech-Spec skeleton alone, naming the specific component (by its Spec-link
  `fileSlug`) whose Purpose/Domain plausibly covers it. Empty when every claim was resolvable from
  the skeleton (the common case for small/medium features). An entry here is NOT the same as a
  `findings` entry — do not also add a `findings` string for the same claim; the host resolves
  `needsComponentDetail` entries separately and may add its own finding if the drill-down fails.
```

No other phase (2, 4, 5, 6) changes — claim decomposition, the gap report, findings-to-host
handoff, and report composition are all unaffected by this feature.

### lib/agent-registry.js

## Algorithm

Insert immediately after the existing `gaia.agent.planner.validate-work-breakdown` entry
(currently at `lib/agent-registry.js:249-261`):

```js
{
  agentId:               'gaia.agent.planner.validate-tech-spec-component-detail',
  nativeNames:           { claude: 'gaia-validate-tech-spec-component-detail' },
  relativeInstallPath:   '.claude/agents/gaia-validate-tech-spec-component-detail.md',
  role:                  'planner',
  type:                  'validation',
  authorisedPhases:      ['planning'],
  allowedPipelines:      ['implement-feature'],
  minimumToolkitVersion: '0.13.0',
  deprecated:            false,
  deprecationTarget:     null,
  platforms:             ['claude'],
},
```

`minimumToolkitVersion: '0.13.0'` matches every other entry in this file (the registry's own
introduction version, confirmed by inspection — not a per-feature bump; no entry in this file uses
any other value). No other part of `lib/agent-registry.js` changes: `resolveAgent`/
`validateAgentSet`/`listRegisteredAgents` all operate generically over the array and need no
new logic for this entry.

## 4. Frontend

_No components in this category._

## 5. External Integrations

### tests/pm-phase1-ac-traceability.test.js

## Algorithm

A local `computeAcComponentTraceabilityGaps(acIdsList, components)` mirrors the real function's
exact algorithm (AC-ID `Set`, per-component `addresses` split/trim/filter, both-direction finding
construction), plus a source-text guard asserting `pm-phase1.js` still contains the function's
real signature and both finding-construction lines, and the merge's
`const mergedValid = mergedFindings.length === 0` line — so the mirror and the real merge-logic
refinement (see `components/pm-phase1.js.md`'s own "Implementation refinement" note) cannot
silently drift from the real script unnoticed.

Six cases: an orphan AC with no addressing component; a component addressing a nonexistent AC;
both conditions firing together; a dash (`—`) Addresses value never treated as a real reference;
a fully-matched one-to-one case producing zero findings; two components addressing the same AC
producing no (duplicate) orphan finding.

### tests/integration/workflow-runtime.test.js

## Algorithm

```js
describe('FTR-028 — validator prompt uses the Tech-Spec skeleton only', () => {
  test('the main validator dispatch prompt contains no per-component Change/Algorithm/Tests prose', async () => {
    // Seed a feature with spec/index.md (2+ component rows) and component detail files whose
    // bodies contain an easily-greppable sentinel string in their "## Change"/"## Algorithm"
    // sections (e.g. "SENTINEL_COMPONENT_BODY_TEXT").
    const dispatchFn = jest.fn(dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const validatorCall = dispatchFn.mock.calls.map(([o]) => o)
      .find(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-validate-feature-docs')
    expect(validatorCall.prompt).not.toContain('SENTINEL_COMPONENT_BODY_TEXT')
    expect(validatorCall.prompt).toContain('## 9. File Inventory') // skeleton's own section still present
  })

  test('Requirements text passed to the validator is unchanged (full UC detail still inlined)', async () => {
    // Same fixture; asserts validatorCall.prompt still contains a UC's own flow-detail sentinel —
    // confirms only the Tech-Spec side of the prompt was reduced (UC-01's own scope boundary).
  })
})

describe('FTR-028 — deterministic AC<->component traceability (UC-02)', () => {
  test('an AC referenced by zero components produces a finding and forces needsTechSpecFix', async () => {
    // req/index.md's AC table includes AC-02 with no component row addressing it; the mocked
    // gaia-validate-feature-docs response returns { valid: true, findings: [], needsComponentDetail: [] }
    // (a clean LLM pass that never saw this gap, since it's purely ID-based, not prose).
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch })
    const report = fs.readFileSync(path.join(f.dir, `${f.prefix}-Validation-Report.md`), 'utf8')
    expect(report).toContain('AC-02 is not addressed by any Tech-Spec component')
    // A second validation cycle must have been dispatched (needsTechSpecFix forced true despite
    // the LLM's own valid:true) — asserts >1 gaia-validate-feature-docs dispatch.
  })

  test('a component referencing a nonexistent AC-ID produces a finding naming the component', async () => {
    // spec/index.md's File Inventory has a row with Addresses "AC-99" (not in req/index.md's AC
    // table); asserts the report contains "references nonexistent AC-99" and the component's path.
  })

  test('no traceability gaps + a genuinely clean LLM pass -> valid, unchanged from today', async () => {
    // Every AC addressed by exactly one component and vice versa; mocked response valid:true,
    // findings: [], needsComponentDetail: []; asserts result.validation.summary contains 'clean'
    // and the Validation-Report has no "Additional findings" section appended.
  })
})

describe('FTR-028 — component-detail drill-down (UC-03)', () => {
  test('a needsComponentDetail entry naming a real fileSlug dispatches a drill-down call reading only that file', async () => {
    // Mocked gaia-validate-feature-docs response includes
    // needsComponentDetail: [{ claim: 'endpoint returns 401 on expired token', fileSlug: 'AuthMiddleware.cs.md' }]
    // Mocked gaia-validate-tech-spec-component-detail response: { findings: [] } (confirmed).
    const dispatchFn = jest.fn(dispatch)
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })
    const drillDownCall = dispatchFn.mock.calls.map(([o]) => o)
      .find(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-validate-tech-spec-component-detail')
    expect(drillDownCall.prompt).toContain('AuthMiddleware.cs.md')
    expect(drillDownCall.prompt).toContain('endpoint returns 401 on expired token')
  })

  test('a needsComponentDetail entry naming a nonexistent fileSlug is dropped and reported, never dispatched', async () => {
    // needsComponentDetail: [{ claim: '...', fileSlug: 'DoesNotExist.cs.md' }]; asserts no
    // gaia-validate-tech-spec-component-detail dispatch occurs, and the Validation-Report contains
    // 'component-detail check referenced a non-existent file "DoesNotExist.cs.md"'.
  })

  test('the drill-down agent reporting an unsatisfied claim forces needsTechSpecFix even if the main pass said valid:true', async () => {
    // Mocked drill-down response: { findings: ['Tech-Spec: ...not satisfied...'] }; asserts a
    // second validation cycle runs and the Validation-Report contains the drill-down finding.
  })

  test('two needsComponentDetail entries naming the same fileSlug are deduplicated into one batch slot', async () => {
    // needsComponentDetail has two entries, same fileSlug, different claims; asserts only ONE
    // gaia-validate-tech-spec-component-detail dispatch occurs for that fileSlug, and its prompt
    // contains both claims.
  })

  test('more unique flagged components than the batch size produce multiple bounded drill-down calls', async () => {
    // needsComponentDetail names DRILL_DOWN_BATCH_SIZE + 3 distinct, all-existing fileSlugs;
    // asserts exactly 2 gaia-validate-tech-spec-component-detail dispatches occur (ceil((K+3)/K)),
    // and no single dispatch's prompt mentions more than K distinct "Component file:" lines.
  })

  test('no needsComponentDetail entries -> zero drill-down dispatches (common-case cost)', async () => {
    // Mocked response: needsComponentDetail: []; asserts dispatchFn never calls
    // gaia-validate-tech-spec-component-detail at all for this cycle.
  })
})

describe('FTR-028 — docsDigest unaffected', () => {
  test('docsDigest still hashes the full assembled Requirements + Tech-Spec regardless of drill-down activity', async () => {
    // Runs a scenario that DOES trigger drill-down + the deterministic check; asserts
    // result.docs_digest equals hash(assembleRequirements output + '\u0000' + assembleTechSpec
    // output) computed independently in the test via the same req-assembler.js/tech-spec-
    // assembler.js run-asset invocation the workflow itself uses — proving the digest was never
    // computed from the reduced skeleton-only validator input.
  })
})
```

## Implementation note (found while coding)

The "component references a nonexistent AC-ID" direction of the traceability check turned out to
be unreachable end to end: `tech-spec-ac-check` (FTR-023) already hard-rejects that exact condition
at Tech-Spec GENERATION time, before the validation step this feature modifies is ever reached. A
new unit test file, `tests/pm-phase1-ac-traceability.test.js`, covers that direction directly
against a hand-synced mirror of `computeAcComponentTraceabilityGaps()` instead (same "mirror +
source-text guard" pattern as `tests/pm-phase1-req-resume.test.js`). The integration suite's own
"orphan AC" test (the OTHER direction — an AC addressed by zero components) remains a genuine,
reachable end-to-end scenario, since no pre-existing check enforces full AC coverage.

## 6. Security Considerations

The new drill-down agent (`gaia-validate-tech-spec-component-detail`) is given only Read/Glob/Grep
tools (matching `gaia-validate-feature-docs`'s own tool profile) and Reads only absolute paths the
host computes itself from already-validated `fileSlug` values under the feature's own
`spec/components/` directory — never a path derived from unvalidated agent output, and never a
toolkit-external template path (so the headless-worker permission issue fixed separately, commit
35d08e9, does not apply: no `print-asset`/host-inlining is needed for this agent). No new external
I/O, no new input-validation boundary beyond the existing `fileSlug`-existence check (BR-05).

## 7. Database Changes

None.

## 8. Configuration

None — the batch size `K` is a code-level constant (default 8, see
`components/pm-phase1.js.md`), not an environment variable or settings-file option (Open Question
4: no real evidence yet justifies making it externally tunable).

## 9. File Inventory

### New files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/agents/gaia-validate-tech-spec-component-detail.md | Narrow drill-down agent: Reads only the named component file(s) in its own batch and confirms/denies a small set of claims against their real content | AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12 |
| tests/pm-phase1-ac-traceability.test.js | Added during implementation (not originally planned): a direct, deterministic unit test of `computeAcComponentTraceabilityGaps()` via a hand-synced mirror + source-text guard — covers the "component references a nonexistent AC-ID" direction, discovered unreachable end to end (see `components/workflow-runtime.test.js.md`'s own Implementation Note) | AC-02 |

### Modified files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| src/claude/workflows/pm-phase1.js | Swap the Tech-Spec text fed to the validator's prompt from `assembledTechSpec` to the raw skeleton; add `needsComponentDetail` to the worker schema; add the deterministic AC↔component traceability check; add `fileSlug`-validation, dedup, batching, and drill-down dispatch; merge all finding sources before the contradiction guard | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 |
| src/claude/agents/gaia-validate-feature-docs.md | Phase 1 reworded to describe the skeleton-only Tech-Spec input; Phase 3's Tech-Spec check table reworded to match (Purpose/Addresses/Domain columns only); Implementation-Order traceability bullet removed (superseded); schema/Phase 7 gain `needsComponentDetail` with instructions on when to use it | AC-01, AC-05, AC-06 |
| lib/agent-registry.js | New registry entry for `gaia.agent.planner.validate-tech-spec-component-detail` (mirrors the existing `validate-feature-docs`/`validate-work-breakdown` entries' shape exactly) | AC-07 |
| tests/integration/workflow-runtime.test.js | New tests: skeleton-only prompt content (no component body text); deterministic traceability check (orphan AC, hallucinated AC reference, both directions); drill-down dispatch (valid fileSlug, hallucinated fileSlug, dedup, batching at K+1 components); merge-before-guard forcing `needsTechSpecFix` when the LLM pass alone reported clean | AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13 |

## 10. Testing Strategy

### src/claude/agents/gaia-validate-tech-spec-component-detail.md

See `components/workflow-runtime.test.js.md` for the end-to-end dispatch tests (AC-09, AC-10) that
exercise this agent's real resolution and response-merging path. This agent file's own frontmatter
and schema shape are also covered by the existing project-wide agent-frontmatter structural test
suite (`tests/frontmatter/`), which validates every `.claude/agents/*.md` file's frontmatter
without needing a dedicated new test.

### tests/pm-phase1-ac-traceability.test.js

This component *is* the test file — no further test file covers it.

### src/claude/workflows/pm-phase1.js

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01 through AC-13). This file's own existing unit-level guard tests (none currently assert the
exact validator-prompt-construction line) gain no new assertion beyond what the integration suite
already covers end-to-end — the prior features in this lineage (FTR-025, FTR-027) established that
`pm-phase1.js`'s validation/resume logic is tested via `tests/integration/workflow-runtime.test.js`
exercising the real sandboxed script, not a parallel unit mirror, since the file has no `require()`
boundary to mock around at the unit level for this kind of control-flow change.

### src/claude/agents/gaia-validate-feature-docs.md

`tests/frontmatter/agents.test.js` continues to structurally validate this file's frontmatter
unmodified (name/description/tools unchanged). `tests/integration/workflow-runtime.test.js`'s new
tests (see that file's own component) exercise the real, reworded contract end-to-end: a fixture
Tech-Spec skeleton with no per-component body text is fed through the real `pm-phase1.js` dispatch
path, confirming the host no longer calls `assembleTechSpec()`'s full output for this one prompt.

### lib/agent-registry.js

`tests/integration/workflow-runtime.test.js`'s new drill-down tests (see that file's own component)
exercise the real `resolve(id)` path for `gaia.agent.planner.validate-tech-spec-component-detail`
end-to-end (through the same `c.worker()`/registry resolution every other agent in this pipeline
already goes through) — not a mocked registry — so a missing or malformed entry would fail those
tests with an unresolvable-agent error, not silently.

### tests/integration/workflow-runtime.test.js

This component *is* the test file — no further test file covers it. See the implementation note
above for its one companion unit-test file.

## 11. Implementation Order

1. `lib/agent-registry.js` — depends on: nothing (pure data addition; needed before `pm-phase1.js`
   can successfully dispatch the new agent)
2. `src/claude/agents/gaia-validate-tech-spec-component-detail.md` — depends on: nothing (new file;
   independent of 1, both needed before `pm-phase1.js` can dispatch it end-to-end)
3. `src/claude/agents/gaia-validate-feature-docs.md` — depends on: nothing (reworded independently;
   `pm-phase1.js` must match its new schema contract, so land together or before `pm-phase1.js`)
4. `src/claude/workflows/pm-phase1.js` — depends on: 1, 2, 3 (dispatches both agents under their
   final contracts)
5. `tests/integration/workflow-runtime.test.js` — depends on: 1, 2, 3, 4

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| The main validator over-uses `needsComponentDetail`, flagging most/all components for drill-down (a confused or overly cautious model response) | Many drill-down batches dispatched in one cycle — more LLM cost/wall-clock than today's single call, though never a single unbounded call | Accepted: batching at `K` already guarantees no SINGLE call explodes; total batches scale with flagged-component count, which is still bounded by the feature's own component count — strictly worse than the common case, never worse than a crash |
| The main validator names a `fileSlug` that exists but is NOT actually relevant to the claim (a bad guess, not a hallucination) | The drill-down agent reports the claim as unconfirmed (since the named file doesn't address it), producing a finding that may force an unnecessary revision cycle | Accepted: this fails safe (an extra revision cycle, not a silent false-clean pass) and is bounded by the existing 3-cycle limit; no worse than today's single-pass agent misjudging coverage |
| Losing per-component design-body visibility in the MAIN pass could silently drop a genuine gap if the model never recognizes it needs `needsComponentDetail` at all (under-flagging, not over-flagging) | A real coverage gap goes unnoticed, same failure mode the Out-of-Scope "granularity trade-off" already accepted in `feature.md` | Accepted per `feature.md`'s own Out-of-Scope: no real incident has shown this specific failure yet; `gaia-generate-tech-spec-component.md`'s own template contract remains the primary authority for per-component technical completeness, not this validator |
| A new agent (`gaia-validate-tech-spec-component-detail`) shipped without its `lib/agent-registry.js` entry — the exact FTR-021/FTR-024 bug class | `pm-phase1.js`'s dispatch would fail at `resolveAgent`/`resolve(id)` with an unresolvable agent ID | Mitigated structurally: Implementation Order step 1 lands the registry entry BEFORE `pm-phase1.js` ever references the new `agentId`, and `tests/integration/workflow-runtime.test.js`'s new tests exercise the real dispatch path end-to-end, not a mocked one |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact attribution prefix for an orphan-AC finding | **Resolved** | Always `"Tech-Spec: ..."` — see `components/pm-phase1.js.md`'s `computeAcComponentTraceabilityGaps` |
| 2 | Should the deterministic check also flag a dangling File-Inventory Spec link? | **Resolved** | Deferred out of this feature's MVP-of-scope-as-shipped: FTR-027's own component-validity gate already covers this earlier in the pipeline (before the validator ever runs), and `--force` still re-enters that same gate on the next cycle — adding a second, redundant check here was judged not worth the extra surface for a gap FTR-027 already closes upstream |
| 3 | Where does the new deterministic-check function live? | **Resolved** | Inline in `pm-phase1.js`, next to `parseComponentsTable`/`parseAcTableRelatedUc` — see `components/pm-phase1.js.md` |
| 4 | Default batch size `K`? | **Resolved** | Fixed code constant, `K = 8`, not externally configurable — no real evidence yet justifies tuning |
| 5 | Does the drill-down agent receive `feature.path` for extra context? | **Resolved** | No — claim text + component file paths only, mirroring `gaia-generate-tech-spec-component`'s own narrow-input precedent |
| 6 | New agent registration | **Resolved** | `lib/agent-registry.js` entry required (Implementation Order step 1); `lib/asset-catalog.js` needs no change (directory-glob install) |

## Dependencies and Assumptions

- FTR-020/FTR-024/FTR-025/FTR-026/FTR-027 (available): the split-generation architecture, skeleton/
  detail separation, and existing per-item validity mechanisms — all reused, none replaced.
- `tech-spec-assembler.js`'s `loadTechSpec()`/`assembleTechSpec()` and `req-assembler.js`'s
  `loadRequirements()` stay unmodified and are imported by neither this feature's new code nor
  `pm-phase1.js`'s existing `assembleRequirements()`/`assembleTechSpec()` helpers (both call them
  via `run-asset`, as today).
- `lib/agent-registry.js`'s existing per-entry shape is reused unmodified; the new entry follows
  the existing precedent of `minimumToolkitVersion: '0.13.0'` on every entry regardless of when it
  was actually added.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident
  (`Fincantieri.CommonLibraries.MFExample`, FTR-003) — not a hypothetical scalability concern.
