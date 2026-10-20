'use strict'

const {
  checkUniqueUcIds,
  checkUcIdFormat,
  checkUcTableFileParity,
  checkCrossReferencesResolve,
  checkAcTableHeader,
} = require('../src/claude/scripts/req-graph-checks')

describe('checkUniqueUcIds()', () => {
  test('passes when all UC IDs are unique', () => {
    expect(checkUniqueUcIds({ ucIds: ['UC-01', 'UC-02'] })).toHaveLength(0)
  })

  test('flags a UC ID that appears twice', () => {
    const errors = checkUniqueUcIds({ ucIds: ['UC-01', 'UC-01'] })
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('DUPLICATE_UC_ID')
    expect(errors[0].ucId).toBe('UC-01')
  })

  test('flags each distinct duplicated id once, regardless of repeat count', () => {
    const errors = checkUniqueUcIds({ ucIds: ['UC-01', 'UC-01', 'UC-01', 'UC-02'] })
    expect(errors).toHaveLength(1)
  })
})

describe('checkUcIdFormat()', () => {
  test.each(['UC-01', 'UC-99', 'UC-123'])('accepts well-formed id %s', id => {
    expect(checkUcIdFormat({ ucIds: [id] })).toHaveLength(0)
  })

  test.each(['UC-1', 'UC1', 'uc-01', 'USE-CASE-01', 'UC-'])('rejects malformed id %s', id => {
    const errors = checkUcIdFormat({ ucIds: [id] })
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('INVALID_UC_ID_FORMAT')
  })
})

describe('checkUcTableFileParity()', () => {
  test('passes on a fresh skeleton with no use-case files yet — this is the normal pre-dispatch state, not an error', () => {
    expect(checkUcTableFileParity({ ucIds: ['UC-01', 'UC-02'] }, [])).toHaveLength(0)
  })

  test('passes when the table and the directory listing match exactly', () => {
    expect(checkUcTableFileParity({ ucIds: ['UC-01', 'UC-02'] }, ['UC-01', 'UC-02'])).toHaveLength(0)
  })

  test('flags only the orphan file, not the table row with no file yet', () => {
    const errors = checkUcTableFileParity({ ucIds: ['UC-01', 'UC-02'] }, ['UC-01', 'UC-03'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('UC_FILE_WITHOUT_TABLE_ROW')
    expect(errors[0].ucId).toBe('UC-03')
  })
})

describe('checkCrossReferencesResolve()', () => {
  test('passes when every AC/BR reference resolves, including "All UCs"', () => {
    const errors = checkCrossReferencesResolve({
      ucIds: ['UC-01', 'UC-02'],
      acTable: [
        { id: 'AC-01', relatedUc: 'UC-01' },
        { id: 'AC-02', relatedUc: 'All UCs' },
        { id: 'AC-03', relatedUc: 'UC-01, UC-02' },
      ],
      businessRules: [{ id: 'BR-01', appliesTo: 'UC-01, UC-02' }],
    })
    expect(errors).toHaveLength(0)
  })

  test('flags a dangling AC and a dangling Business Rule reference', () => {
    const errors = checkCrossReferencesResolve({
      ucIds: ['UC-01'],
      acTable: [{ id: 'AC-01', relatedUc: 'UC-99' }],
      businessRules: [{ id: 'BR-01', appliesTo: 'UC-99' }],
    })
    expect(errors.map(e => e.category).sort()).toEqual(
      ['DANGLING_AC_UC_REFERENCE', 'DANGLING_BR_UC_REFERENCE'])
  })

  test('handles a missing acTable/businessRules gracefully', () => {
    expect(checkCrossReferencesResolve({ ucIds: ['UC-01'] })).toHaveLength(0)
  })
})

describe('checkAcTableHeader()', () => {
  test('a correct 4-column header produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC', 'Priority'])).toEqual([])
  })

  test('a correct 3-column header (no trailing Priority) also produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC'])).toEqual([])
  })

  test('fewer than 3 columns produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Criterion'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })

  test('a 5-column header (Given/When/Then split) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Given', 'When', 'Then', 'Priority'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
    expect(errors[0].message).toContain('"ID", "Given", "When"')
  })

  test('null header (no table found) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(null)
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })
})
