'use strict'

// FTR-021 US-04-TASK-TEST-01: pm-phase1.js's per-use-case generation loop must skip (not
// dispatch) a use case only when the skeleton was NOT just (re)generated this run AND its
// detail file already exists — resume-by-existence is only valid relative to the CURRENT
// skeleton, since a freshly (re)generated skeleton may have changed a use case's row (title,
// actor, priority) and an old detail file can no longer be trusted as-is. Since pm-phase1.js
// runs in a sandboxed AsyncFunction with no `require` (lib/workflow-runner.js) and cannot
// itself be `require`d by a test, this exercises a hand-synced mirror of its selection
// predicate — the same pattern tests/pm-phase2-wbs-resume.test.js already uses for
// pm-phase2.js's own resume logic — plus a source-text check that the real script still
// contains the matching condition, so the mirror cannot silently drift unnoticed.

const fs = require('fs')
const path = require('path')

const PM_PHASE1_SOURCE = fs.readFileSync(
  path.join(__dirname, '../src/claude/workflows/pm-phase1.js'), 'utf8')

function selectPendingUcIds(ucTable, reqDir, existsFn, regenSkeleton) {
  return ucTable.filter(row => !(!regenSkeleton && existsFn(`${reqDir}/${row.file}`))).map(row => row.id)
}

describe('pm-phase1 requirements resume-by-existence: mirror stays in sync with the real script', () => {
  test('pm-phase1.js still contains the exact resume-by-existence condition the mirror replicates', () => {
    expect(PM_PHASE1_SOURCE).toContain('if (!regenSkeleton && c.exists(ucPath)) continue')
  })

  test('pm-phase1.js forces full use-case regeneration whenever the skeleton itself was (re)generated', () => {
    expect(PM_PHASE1_SOURCE).toContain('const regenSkeleton = forceAll || skeletonStale || !c.exists(reqIndexPath)')
  })

  test('the needsRequirementsFix branch always forces a full regeneration, never a resume', () => {
    expect(PM_PHASE1_SOURCE).toContain('if (result.needsRequirementsFix) { await generateRequirements(true); assembledRequirements = assembleRequirements() }')
  })
})

describe('selectPendingUcIds() — skeleton unchanged this run (regenSkeleton = false)', () => {
  test('dispatches only UC IDs whose detail file is missing', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
    const existing = new Set(['/req/use-cases/UC-01.md'])
    expect(selectPendingUcIds(ucTable, '/req', p => existing.has(p), false)).toEqual(['UC-02'])
  })

  test('dispatches nothing when every UC file already exists', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }]
    expect(selectPendingUcIds(ucTable, '/req', () => true, false)).toEqual([])
  })

  test('dispatches every UC on a fresh skeleton with no files yet', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
    expect(selectPendingUcIds(ucTable, '/req', () => false, false)).toEqual(['UC-01', 'UC-02'])
  })
})

describe('selectPendingUcIds() — skeleton was just (re)generated (regenSkeleton = true)', () => {
  test('dispatches every UC even when its file already exists on disk', () => {
    const ucTable = [{ id: 'UC-01', file: 'use-cases/UC-01.md' }, { id: 'UC-02', file: 'use-cases/UC-02.md' }]
    expect(selectPendingUcIds(ucTable, '/req', () => true, true)).toEqual(['UC-01', 'UC-02'])
  })
})

describe('legacy-feature regression (AC-07)', () => {
  test.todo('a feature with only a monolithic Requirements.md (no req/ directory) still ' +
    'passes assertCompleteSections(9) and preserves docsDigest behavior unchanged — ' +
    'requires an end-to-end pm-phase1 harness exercising a real workflow-runner invocation, ' +
    'not a pure-function unit test; see tests/pm-phase1.*.test.js for the existing harness ' +
    'pattern this should extend')
})
