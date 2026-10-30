'use strict'

// pm-phase1.js's validation loop used to "revise" by blindly regenerating from feature.md: the
// generators never saw the validator's findings, so three cycles were three independent attempts
// at the same input. It also appended the host's "Related Business Rules/Acceptance Criteria"
// block after one the use-case agent sometimes writes itself, leaving two conflicting blocks.
// pm-phase1.js runs in a sandboxed AsyncFunction with no `require` and cannot be required by a
// test, so the pure helpers are extracted from the real source text (never re-typed here, so they
// cannot drift) and the wiring is pinned with source-text checks, as the sibling
// pm-phase1-*.test.js files do.

const fs = require('fs')
const path = require('path')

const SOURCE = fs.readFileSync(
  path.join(__dirname, '../src/claude/workflows/pm-phase1.js'), 'utf8')

function extractFunction(name) {
  const match = SOURCE.match(new RegExp(`  function ${name}\\([^)]*\\) \\{\\n[\\s\\S]*?\\n  \\}\\n`))
  if (!match) throw new Error(`function ${name} not found in pm-phase1.js`)
  return new Function(`return (${match[0].trim()})`)()
}

const revisionSection = extractFunction('revisionSection')
const stripModelCrossReferences = extractFunction('stripModelCrossReferences')

describe('revisionSection()', () => {
  test('adds nothing when there are no findings (first generation is unchanged)', () => {
    expect(revisionSection([])).toBe('')
  })

  test('lists every finding so the generator sees what was reported', () => {
    const section = revisionSection(['Requirements: AC-06 has no component', 'Tech-Spec: threshold values missing'])
    expect(section).toContain('- Requirements: AC-06 has no component')
    expect(section).toContain('- Tech-Spec: threshold values missing')
  })

  test('tells the generator not to invent new open questions for decided points', () => {
    expect(revisionSection(['x'])).toContain('do not raise a new open question for anything feature.md already decides')
  })
})

describe('stripModelCrossReferences()', () => {
  const body = '### UC-02: Check size\n\n**Postconditions:**\n- done\n'

  test('leaves a response without Related lines untouched', () => {
    expect(stripModelCrossReferences(body)).toBe(body)
  })

  test('removes a model-written Related block so only the host block remains', () => {
    const withModelBlock = `${body}\n**Related Business Rules:** BR-01, BR-02\n\n**Related Acceptance Criteria:** —\n`
    expect(stripModelCrossReferences(withModelBlock).trimEnd()).toBe(body.trimEnd())
  })

  test('removes a block holding only the Acceptance Criteria line', () => {
    const only = `${body}\n**Related Acceptance Criteria:** AC-01\n`
    expect(stripModelCrossReferences(only).trimEnd()).toBe(body.trimEnd())
  })

  test('does not touch the word "Related" inside the prose of the flow', () => {
    const prose = '### UC-01: X\n\nRelated Business Rules are applied by the host.\n'
    expect(stripModelCrossReferences(prose)).toBe(prose)
  })
})

describe('pm-phase1.js wiring', () => {
  test('every generator prompt carries the revision section', () => {
    const uses = SOURCE.match(/revisionSection\(revisionFindings\)/g) || []
    // requirements skeleton, tech-spec skeleton, use-case prompt, component prompt
    expect(uses.length).toBe(4)
  })

  test('the revision branch hands the merged findings to the generators before regenerating', () => {
    const setIdx = SOURCE.indexOf('revisionFindings = mergedFindings')
    const reqIdx = SOURCE.indexOf('if (mergedNeedsRequirementsFix) { await generateRequirements(true)')
    const specIdx = SOURCE.indexOf('if (mergedNeedsTechSpecFix) { await generateTechSpec(true)')
    expect(setIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeLessThan(reqIdx)
    expect(setIdx).toBeLessThan(specIdx)
  })

  test('routing reads the document prefix of every finding, not only the host-computed ones', () => {
    expect(SOURCE).toContain("result.needsTechSpecFix || mergedFindings.some(f => f.startsWith('Tech-Spec:'))")
    expect(SOURCE).toContain("result.needsRequirementsFix || mergedFindings.some(f => f.startsWith('Requirements:'))")
  })

  test('a finding with no prefix and no flag still fails closed', () => {
    expect(SOURCE).toContain('flagged neither document for revision')
  })

  test('the use-case file is written with the model-written Related block stripped first', () => {
    expect(SOURCE).toContain('stripModelCrossReferences(detail).trimEnd() + ucCrossReferences(c.read(reqIndexPath), row.id)')
  })
})
