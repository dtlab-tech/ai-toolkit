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

function computeAcComponentTraceabilityGaps(acIdsList, components) {
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
})
