# tests/integration/workflow-runtime.test.js — Modified

## Change

New end-to-end tests covering AC-01 through AC-13: the main validator's prompt no longer contains
per-component design prose; the deterministic AC↔component traceability check (both directions);
`needsComponentDetail` handling (valid fileSlug, hallucinated fileSlug, dedup, batching beyond
`K`); the merge-before-contradiction-guard behavior when the LLM pass alone reports clean but the
host's own checks disagree; and that `docsDigest` is unaffected throughout.

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

## Tests

This component *is* the test file — no further test file covers it. See the implementation note
above for its one companion unit-test file.
