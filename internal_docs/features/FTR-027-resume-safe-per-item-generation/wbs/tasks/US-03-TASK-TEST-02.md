<a id="task-US-03-TASK-TEST-02"></a>
### US-03-TASK-TEST-02

- **Task ID:** US-03-TASK-TEST-02
- **Title:** Cover invalid/valid Work Breakdown task resume behavior end to end
- **Outcome:** tests/integration/workflow-runtime.test.js has passing tests: a task marked generated with a detail file present but zero verification commands is regenerated on resume; a task with at least one verification command is still skipped
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-06, AC-07
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** pm-phase2
- **Commit subject:** cover invalid/valid Work Breakdown task resume behavior end to end

**Implementation notes:**

Add to `tests/integration/workflow-runtime.test.js`, reusing `phase2Setup()`/
`phase2Dispatch()`:

```js
describe('FTR-027 — Work Breakdown task resume validity', () => {
  test('a generated task with zero verification commands is regenerated, not skipped', async () => {
    const wb = phase2Setup()
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: jest.fn(phase2Dispatch(wb)) })
    const taskPath = path.join(f.dir, 'wbs', 'tasks', 'INFRA-TASK-BE-01.md')
    const noCommands = fs.readFileSync(taskPath, 'utf8').replace(/```\nnode --check src\/index\.js\n```/, '')
    fs.writeFileSync(taskPath, noCommands)
    const dispatchFn = jest.fn(phase2Dispatch(wb))
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: dispatchFn })
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])
    expect(calledAgents).toContain('gaia-generate-work-breakdown-task')
  })

  test('a generated task with a real verification command is still skipped (no regression)', async () => {
    const wb = phase2Setup()
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: jest.fn(phase2Dispatch(wb)) })
    const dispatchFn = jest.fn(phase2Dispatch(wb))
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: dispatchFn })
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])
    expect(calledAgents).not.toContain('gaia-generate-work-breakdown-task')
  })
})
```

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js
```
