<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add the deterministic AC<->component traceability check and the merge-before-guard mechanism
- **Outcome:** pm-phase1.js gains computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent); the validation cycle merges its findings into result before the valid/findings contradiction guard, recomputing valid/needsTechSpecFix/needsRequirementsFix from the merged set, and appends any new findings to the persisted Validation-Report
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-02, AC-03, AC-04, AC-05
- **Estimate — agent minutes:** 24
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** The deterministic check and the merge mechanism it requires are one indivisible unit — the check alone has no effect on the validation cycle's outcome without the merge wired in, and the merge mechanism has no finding source to merge without the check.
- **Commit type:** feat
- **Commit scope:** pm-phase1
- **Commit subject:** enforce AC<->component traceability deterministically, merged before the validator's own contradiction guard

**Implementation notes:**

In `src/claude/workflows/pm-phase1.js`, add near the existing duplicated table parsers
(`parseAcTableRelatedUc` at line 117, `parseComponentsTable` at line 216):

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
```

Then replace the validation cycle's body (currently lines 442-468, right after the `c.worker(valId,
...)` call that this task leaves otherwise unchanged from US-01-TASK-BE-01) with:

```js
const result = await c.worker(valId, /* unchanged prompt/schema from US-01-TASK-BE-01 */)

const reqIndexContent = c.read(reqIndexPath)
const specIndexContent = c.read(specIndexPath)
const structuralFindings = computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent)

// Implementation refinement (found while coding, not anticipated when this task was written): a
// raw self-consistency guard must run on the MODEL'S OWN response BEFORE any merge — a pending
// needsComponentDetail entry (added in US-03) is itself a form of "not yet resolved", same as a
// non-empty findings array. Add this now so US-03-TASK-BE-02 doesn't need to revisit this guard:
const rawHasOpenItems = result.findings.length > 0 || (result.needsComponentDetail || []).length > 0
if (result.valid === rawHasOpenItems) {
  throw new Error(`Validation agent returned a contradictory result on cycle ${cycle}: valid=${result.valid} with ${result.findings.length} finding(s) and ${(result.needsComponentDetail || []).length} needsComponentDetail entry(ies)`)
}

// This task's merge only has one new finding source (structuralFindings); US-03-TASK-BE-02 will
// extend `newFindings` to also include drill-down and bad-fileSlug findings — do not hardcode an
// assumption here that structuralFindings is the only source, write `newFindings` as its own
// array so that extension is a pure addition, not a rewrite.
const newFindings = [...structuralFindings]
const mergedFindings = [...result.findings, ...newFindings]
// Deliberately NOT `result.valid && ...`: result.valid may be false solely because of a pending
// needsComponentDetail entry that a later cycle's drill-down (US-03) will confirm with zero
// findings — mergedValid must be re-derivable purely from mergedFindings, not tied to the raw
// self-report, or a resolved component-detail check could never become clean.
const mergedValid = mergedFindings.length === 0
const mergedNeedsTechSpecFix = result.needsTechSpecFix || newFindings.some(f => f.startsWith('Tech-Spec:'))
const mergedNeedsRequirementsFix = result.needsRequirementsFix || newFindings.some(f => f.startsWith('Requirements:'))

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
```

This REPLACES the prior raw `result.valid`/`result.findings`-based contradiction guard and
report-write entirely — there is no longer a separate "write report, then separately check valid"
step; both now operate on the merged values. Confirm `c.write` is available on the control object
(it is — `lib/workflow-control.js`'s `api` object already exposes it, used elsewhere for output
writes) before assuming a new helper is needed.

**Verification commands:**

```
npm test
```
