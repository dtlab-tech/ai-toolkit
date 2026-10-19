# tests/ac-task-matrix.test.js — Modified

## Change

Replaces the single-output-file assumption in this test suite with assertions against the new
`coverage-matrix/index.json`+`index.md` dual output, and the now-required `featureDir` CLI argument.

## Algorithm

```js
describe('ac-task-matrix.js CLI — coverage-matrix/ output', () => {
  test('writes coverage-matrix/index.json and index.md under the given featureDir', () => {
    const { stdout } = runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const { jsonPath, mdPath } = JSON.parse(stdout)
    expect(jsonPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.json'))
    expect(mdPath).toBe(path.join(featureDir, 'coverage-matrix', 'index.md'))
    expect(fs.existsSync(jsonPath)).toBe(true)
    expect(fs.existsSync(mdPath)).toBe(true)
  })

  test('creates the coverage-matrix/ subfolder when it does not already exist', () => {
    const freshFeatureDir = makeTempFeatureDir() // no coverage-matrix/ yet
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, freshFeatureDir])
    expect(fs.existsSync(path.join(freshFeatureDir, 'coverage-matrix'))).toBe(true)
  })

  test('index.json matches buildMatrixJson()\\'s own shape', () => {
    const { acMap, coverage, techSpecCoverage } = buildKnownFixture() // existing helper
    const expected = buildMatrixJson(prefix, acMap, coverage, techSpecCoverage)
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const written = JSON.parse(fs.readFileSync(path.join(featureDir, 'coverage-matrix', 'index.json'), 'utf8'))
    expect(written.acceptanceCriteria).toEqual(expected.acceptanceCriteria)
  })

  test('index.md contains the Must-AC coverage summary and a link to index.json', () => {
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, featureDir])
    const md = fs.readFileSync(path.join(featureDir, 'coverage-matrix', 'index.md'), 'utf8')
    expect(md).toMatch(/\*\*Must-AC coverage:\*\* \d+\/\d+ covered/)
    expect(md).toContain('[index.json](index.json)')
  })

  test('exits 1 with a usage message when featureDir is omitted', () => {
    const { exitCode, stderr } = runCli([wbsPath, requirementsPath, techSpecPath, prefix])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Usage:')
  })
})
```

Existing tests that asserted the old single-file `{prefix}-AC-Task-Matrix.md` output path (e.g. at
`path.dirname(requirementsPath)`) are updated in place to the new dual-output shape above, not left
alongside it.

## Tests

This component *is* the test file — no further test file covers it.
