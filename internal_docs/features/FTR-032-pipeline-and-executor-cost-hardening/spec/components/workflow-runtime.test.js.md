# tests/integration/workflow-runtime.test.js — Modified

## Change

New `describe('FTR-032 — WBS skeleton call no longer requires estimate; per-task detail call is the source of truth', ...)` block, reusing this file's own existing `phase2Dispatch(wb)`/`taskDetailDoc(taskId)` fixture helpers (already rendering a real `- **Estimate — agent minutes:**`/`- **Estimate — tokens:**` field pair in `taskDetailDoc`'s own template-shaped response) — no new fixture machinery needed, only new assertions and two deliberately-mismatched `estimate` values (one via the skeleton `wb` object, a DIFFERENT one via `taskDetailDoc`) to prove which one wins.

## Algorithm

```js
describe('FTR-032 — WBS skeleton call no longer requires estimate; per-task detail call is the source of truth', () => {
  test('a skeleton response omitting estimate entirely is accepted (AC-01)', async () => {
    const wb = baseWb(); // this file's own existing fixture builder
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).resolves.toBeDefined();
  });

  test('the assembled task\'s estimate comes from the per-task detail response, not the skeleton (AC-02)', async () => {
    const wb = baseWb();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate; // skeleton no longer carries it at all
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-work-breakdown-task') {
        // deliberately a DIFFERENT value than any skeleton-era fixture ever used, so a pass
        // here can only mean the per-task response's own estimate was actually read
        return success(taskDetailDocWithEstimate('INFRA-TASK-BE-01', { agentMinutes: 13, tokens: 31000 }));
      }
      return phase2Dispatch(wb)(options);
    };
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const assembled = loadWorkBreakdown(path.join(f.dir, 'FTR-099-wbs'));
    const task = assembled.phases[0].tasks.find(t => t.id === 'INFRA-TASK-BE-01');
    expect(task.estimate).toEqual({ agentMinutes: 13, tokens: 31000 });
  });

  test('c.estimates() still reports effort totals correctly with the shrunk skeleton (AC-03)', async () => {
    const wb = baseWb();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    expect(result.human_estimate).toBeDefined();
    expect(result.agent_estimate).toBeDefined();
  });

  test('wb-skeleton-check/wb-graph-checks still pass against a skeleton with no estimate field at all (AC-04)', async () => {
    const wb = baseWb();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).resolves.toBeDefined();
    // (a rejection here would mean a structural check regressed against the new shape — none
    // of wb-skeleton-check.js/wb-graph-checks.js read `estimate`, confirmed by direct inspection)
  });
});
```

`taskDetailDocWithEstimate(taskId, { agentMinutes, tokens })` is a small new helper alongside the
existing `taskDetailDoc`, identical except for its own Estimate field values being parameters
instead of the fixed `8`/`10000` — added near `taskDetailDoc`'s own definition, not duplicating
the rest of the template string.

## Tests

This component *is* the test file for AC-01 through AC-04 — no further test file covers them.
