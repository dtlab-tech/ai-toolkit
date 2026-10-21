'use strict'

// FTR-028 US-02-TASK-TEST-01: pm-phase1.js's computeAcComponentTraceabilityGaps() is a pure,
// deterministic, zero-LLM-cost function (no I/O beyond the two already-parsed table contents it
// is handed) — the "component references a nonexistent AC" direction is, in practice, already
// hard-rejected earlier by the pre-existing tech-spec-ac-check (FTR-023) at Tech-Spec generation
// time, so a full end-to-end integration scenario can never actually reach this function with
// that condition true (see tests/integration/workflow-runtime.test.js's own "orphan AC" test for
// the direction that IS reachable end-to-end). Since pm-phase1.js runs in a sandboxed
// AsyncFunction with no `require` (lib/workflow-runner.js) and cannot itself be `require`d by a
// test, this exercises a hand-synced mirror of the function — the same pattern
// tests/pm-phase1-req-resume.test.js already uses — plus a source-text check that the real script
// still contains the matching implementation, so the mirror cannot silently drift unnoticed.

const fs = require('fs')
const path = require('path')

const PM_PHASE1_SOURCE = fs.readFileSync(
  path.join(__dirname, '../src/claude/workflows/pm-phase1.js'), 'utf8')

// risksText defaults to '' — the Section-12 exemption (FTR-030) is additive to the original
// FTR-028 behavior, so every existing call site/test below that doesn't pass it is unaffected.
function computeAcComponentTraceabilityGaps(acIdsList, components, risksText = '') {
  const acIds = new Set(acIdsList)
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
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escapedId}\\b`).test(risksText)) addressedAcIds.add(id)
  }
  for (const id of acIds) {
    if (!addressedAcIds.has(id)) findings.push(`Tech-Spec: ${id} is not addressed by any Tech-Spec component`)
  }
  return findings
}

describe('pm-phase1 AC<->component traceability: mirror stays in sync with the real script', () => {
  test('pm-phase1.js still contains the exact traceability check the mirror replicates', () => {
    expect(PM_PHASE1_SOURCE).toContain('function computeAcComponentTraceabilityGaps(reqIndexContent, specIndexContent)')
    expect(PM_PHASE1_SOURCE).toContain("findings.push(`Tech-Spec: component ${comp.filePath} references nonexistent ${ref}`)")
    expect(PM_PHASE1_SOURCE).toContain('findings.push(`Tech-Spec: ${id} is not addressed by any Tech-Spec component`)')
  })

  test('pm-phase1.js still exempts an AC mentioned by ID in Section 12 (Risks & Mitigations)', () => {
    expect(PM_PHASE1_SOURCE).toContain('const { start: risksStart, end: risksEnd } = findReqSection(specLines, 12)')
    expect(PM_PHASE1_SOURCE).toContain('if (new RegExp(`\\\\b${escapedId}\\\\b`).test(risksText)) addressedAcIds.add(id)')
  })

  test('the merge recomputes valid purely from mergedFindings, never from the raw result.valid', () => {
    expect(PM_PHASE1_SOURCE).toContain('const mergedValid = mergedFindings.length === 0')
  })
})

describe('computeAcComponentTraceabilityGaps()', () => {
  test('an AC referenced by zero components produces exactly one orphan finding', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01', 'AC-02'], [
      { filePath: 'a.js', addresses: 'AC-01' },
    ])
    expect(findings).toEqual(['Tech-Spec: AC-02 is not addressed by any Tech-Spec component'])
  })

  test('a component referencing a nonexistent AC-ID produces exactly one bad-reference finding', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01'], [
      { filePath: 'a.js', addresses: 'AC-01, AC-99' },
    ])
    expect(findings).toEqual(['Tech-Spec: component a.js references nonexistent AC-99'])
  })

  test('both directions can fire together for the same input', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01', 'AC-02'], [
      { filePath: 'a.js', addresses: 'AC-01, AC-99' },
    ])
    expect(findings).toEqual(expect.arrayContaining([
      'Tech-Spec: component a.js references nonexistent AC-99',
      'Tech-Spec: AC-02 is not addressed by any Tech-Spec component',
    ]))
    expect(findings).toHaveLength(2)
  })

  test('a dash ("—") Addresses value is never treated as a reference', () => {
    const findings = computeAcComponentTraceabilityGaps([], [
      { filePath: 'a.js', addresses: '—' },
    ])
    expect(findings).toEqual([])
  })

  test('every AC addressed by exactly one component, and vice versa, produces zero findings', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01', 'AC-02'], [
      { filePath: 'a.js', addresses: 'AC-01' },
      { filePath: 'b.js', addresses: 'AC-02' },
    ])
    expect(findings).toEqual([])
  })

  test('two components addressing the same AC produce no orphan finding for it', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01'], [
      { filePath: 'a.js', addresses: 'AC-01' },
      { filePath: 'b.js', addresses: 'AC-01' },
    ])
    expect(findings).toEqual([])
  })

  // FTR-030: a real incident — AC-13 was "`_old/` must not be modified" (a negative/process
  // constraint verified via `git diff`, not a positive per-file deliverable) and was a permanent
  // false-positive orphan finding under FTR-028's original check (no component SHOULD ever
  // address it). The real Tech-Spec already documented it, by literal ID, in Section 12
  // (Risks & Mitigations) — this is that same real text, trimmed.
  const REAL_RISKS_TEXT = '## 12. Risks & Mitigations\n\n' +
    '| **_old/ directory integrity** | High — AC-13 requires no modification to `_old/` files... |\n'

  test('an AC mentioned by its literal ID in Section 12 is not flagged as orphaned', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01', 'AC-13'], [
      { filePath: 'a.js', addresses: 'AC-01' },
    ], REAL_RISKS_TEXT)
    expect(findings).toEqual([])
  })

  test('an AC addressed by neither a component nor Section 12 is still flagged (no false-negative)', () => {
    const findings = computeAcComponentTraceabilityGaps(['AC-01', 'AC-02'], [
      { filePath: 'a.js', addresses: 'AC-01' },
    ], REAL_RISKS_TEXT) // mentions AC-13, not AC-02 — must not accidentally exempt AC-02
    expect(findings).toEqual(['Tech-Spec: AC-02 is not addressed by any Tech-Spec component'])
  })

  test('the Section-12 match is whole-ID, not a substring match (AC-1 does not satisfy AC-13 or vice versa)', () => {
    const findingsForAc1 = computeAcComponentTraceabilityGaps(['AC-1'], [], REAL_RISKS_TEXT)
    expect(findingsForAc1).toEqual(['Tech-Spec: AC-1 is not addressed by any Tech-Spec component'])
    const findingsForAc130 = computeAcComponentTraceabilityGaps(['AC-130'], [], 'Section 12 mentions AC-13 only.\n')
    expect(findingsForAc130).toEqual(['Tech-Spec: AC-130 is not addressed by any Tech-Spec component'])
  })
})
