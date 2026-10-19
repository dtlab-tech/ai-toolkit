<a id="task-US-01-TASK-TEST-02"></a>
### US-01-TASK-TEST-02

- **Task ID:** US-01-TASK-TEST-02
- **Title:** Cover ac-task-matrix.js's coverage-matrix/ JSON+MD output
- **Outcome:** tests/ac-task-matrix.test.js asserts the CLI writes coverage-matrix/index.json+index.md under the given featureDir (creating the subfolder if needed), that index.json matches buildMatrixJson()'s own shape, that index.md contains the Must-AC coverage summary and a link to index.json, and that omitting featureDir exits 1 with a usage message
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-03
- **Acceptance criteria:** AC-03, AC-10
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** ac-task-matrix
- **Commit subject:** cover the coverage-matrix/ JSON+MD output

**Implementation notes:**

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
    const freshFeatureDir = makeTempFeatureDir()
    runCli([wbsPath, requirementsPath, techSpecPath, prefix, freshFeatureDir])
    expect(fs.existsSync(path.join(freshFeatureDir, 'coverage-matrix'))).toBe(true)
  })

  test('index.json matches buildMatrixJson()\'s own shape', () => {
    const { acMap, coverage, techSpecCoverage } = buildKnownFixture()
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

**Verification commands:**

```
npm test -- tests/ac-task-matrix.test.js
```
