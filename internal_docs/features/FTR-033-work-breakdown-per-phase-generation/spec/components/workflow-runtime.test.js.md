# tests/integration/workflow-runtime.test.js — Modified

## Change

Three changes to this one file:

1. **`phase2Dispatch(wb, semanticVerdict)` (the shared fixture used by ~15 pre-existing tests
   across this file, every FTR-020 through FTR-031 era `pm-phase2` test) is upgraded to be
   phase-aware** — it must answer BOTH `gaia-generate-work-breakdown` (now enumeration-only) and
   the new `gaia-generate-work-breakdown-phase` from the one `wb` object every existing test
   already passes it, so none of those ~15 tests need to change at all. Without this, every one of
   them would break the moment `pm-phase2.js`'s real two-tier flow ships (the mechanism
   `phase2Dispatch` fakes would no longer match what the real code actually dispatches).
2. **The `'FTR-032 follow-up — bounded needsComponentDetail drill-down for the WBS skeleton call'`
   describe block (3 tests + its own `writeSplitFixtures`/`skeletonResponse`/`findSkeletonCalls`
   helpers) is deleted outright** — it tests `needsComponentDetail` drill-down AT THE ENUMERATION
   TIER, a capability this feature deliberately does not carry forward (the enumeration call never
   declares `needsComponentDetail`; only the per-phase call does, since phase-level decisions never
   need a component's own design body). This is a relocation, not a coverage loss: the one
   still-valid assertion from its first test ("the skeleton prompt ... never per-component
   bodies") is folded into the new AC-01 test's own `doExampleWork` assertion below; the
   drill-down mechanism itself is re-proven at its new, correct tier by AC-08.
3. New `describe('FTR-033 — per-phase WBS skeleton generation', ...)` block, reusing this file's
   own existing `phase2Dispatch(wb)`/`f.feature`/`f.options`/`f.dir` fixture helpers and the
   `ftr-021-req`/`ftr-024-spec` fixtures (2 UCs: UC-01 "System does the first thing", UC-02
   "System does the second thing"). Builds a new 2-phase `phaseList` fixture (US-01 sourceUC
   UC-01, US-02 sourceUC UC-02) and a `findCalls(dispatch, agentName)` helper to isolate calls by
   agent name and, where needed, by the phase a call's own prompt names (matched via
   `"id": "<phaseId>"`).

## Algorithm — phase2Dispatch upgrade

```js
// Replaces the current phase2Dispatch (lines 592-601). The 'gaia-generate-work-breakdown-task'
// and fallback (semantic validator) branches are byte-for-byte unchanged.
function phase2Dispatch(wb, semanticVerdict = { valid: true, findings: [] }) {
  const enumeratedPhases = wb.phases.map(p => ({
    id: p.id, type: p.type, title: p.title, sourceUC: p.sourceUC, commit: p.commit,
  }));
  return async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-work-breakdown') {
      return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
        structured_output: { schemaVersion: 3, feature: wb.feature, phases: enumeratedPhases } } };
    }
    if (name === 'gaia-generate-work-breakdown-phase') {
      const m = options.prompt.match(/"id":\s*"([^"]+)"/);
      const phase = wb.phases.find(p => p.id === (m && m[1]));
      const tasks = {};
      for (const taskId of phase.taskIds) tasks[taskId] = wb.tasks[taskId];
      return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
        structured_output: { context: phase.context, tasks } } };
    }
    if (name === 'gaia-generate-work-breakdown-task') return success(taskDetailDoc('INFRA-TASK-BE-01'));
    return { exitCode: 0, result: { is_error: false, structured_output: semanticVerdict, usage: { input_tokens: 10, output_tokens: 5 } } };
  };
}
```

Every existing `wb` fixture passed to `phase2Dispatch` across this file already carries `title`,
`commit`, `sourceUC`, and a per-phase `context` on each phase entry (required by the CURRENT,
pre-FTR-033 `SKELETON_SCHEMA`) — so this upgrade needs no changes to any of those ~15 call sites'
own fixture objects, only to `phase2Dispatch`'s own body. The one test at workflow-runtime.test.js
line 923 (`'pm-phase2 gives each per-task worker only its own AC-matched Tech-Spec component...'`)
that does NOT use `phase2Dispatch` (it has its own inline dispatch function) needs its own
`'gaia-generate-work-breakdown-phase'` branch added analogously — return `wb.tasks` filtered to
that phase's own `taskIds`, same shape as above.

## Algorithm — new FTR-033 describe block

## Algorithm

```js
describe('FTR-033 — per-phase WBS skeleton generation', () => {
  function writeSplitFixtures() {
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-021-req'), path.join(f.dir, 'req'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-024-spec'), path.join(f.dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'),
      '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n');
  }
  const phaseList = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [
      { id: 'US-01', type: 'user-story', title: 'US-01 title', sourceUC: ['UC-01'], commit: { type: 'feat', subject: 'us01' } },
      { id: 'US-02', type: 'user-story', title: 'US-02 title', sourceUC: ['UC-02'], commit: { type: 'feat', subject: 'us02' } },
    ],
  };
  function phaseTasksResponse(taskId, extra) {
    return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
      structured_output: { context: `${taskId.split('-')[0]} context.`, tasks: {
        [taskId]: { title: `${taskId} title`, outcome: 'o', domain: 'BE', agentType: 'developer-backend',
          dependsOn: [], acceptanceCriteria: ['AC-01'], outputCount: 1, commit: { type: 'feat', subject: taskId.toLowerCase() } },
      }, ...extra } } }
  }
  function phaseAwareDispatch() {
    return jest.fn(async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-work-breakdown') {
        return { exitCode: 0, result: { is_error: false, structured_output: phaseList, usage: { input_tokens: 10, output_tokens: 5 } } };
      }
      if (name === 'gaia-generate-work-breakdown-phase') {
        if (options.prompt.includes('"id": "US-01"')) return phaseTasksResponse('US-01-TASK-BE-01');
        if (options.prompt.includes('"id": "US-02"')) return phaseTasksResponse('US-02-TASK-BE-01');
      }
      if (name === 'gaia-generate-work-breakdown-task') return success(taskDetailDoc(options.prompt.match(/"id":\s*"([^"]+)"/)[1]));
      return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [] }, usage: { input_tokens: 10, output_tokens: 5 } } };
    });
  }
  function findCalls(dispatch, agentName) {
    return dispatch.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === agentName);
  }

  test('the enumeration call produces only id/type/title/sourceUC/commit per phase, no tasks (AC-01)', async () => {
    writeSplitFixtures();
    const dispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const enumCalls = findCalls(dispatch, 'gaia-generate-work-breakdown');
    expect(enumCalls).toHaveLength(1);
    expect(enumCalls[0].prompt).not.toContain('"tasks"');
    expect(enumCalls[0].prompt).not.toContain('doExampleWork'); // a component's own design BODY — never inlined
  });

  test('exactly one bounded call per phase, dispatched in enumerated order (AC-02)', async () => {
    writeSplitFixtures();
    const dispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const phaseCalls = findCalls(dispatch, 'gaia-generate-work-breakdown-phase');
    expect(phaseCalls).toHaveLength(2);
    expect(phaseCalls[0].prompt).toContain('"id": "US-01"');
    expect(phaseCalls[1].prompt).toContain('"id": "US-02"');
  });

  test('a phase call receives its own scoped Requirements, the Tech-Spec skeleton, and only PRIOR phases\' tasks (AC-03)', async () => {
    writeSplitFixtures();
    const dispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const [us01Call, us02Call] = findCalls(dispatch, 'gaia-generate-work-breakdown-phase');
    expect(us01Call.prompt).toContain('System does the first thing');
    expect(us01Call.prompt).not.toContain('System does the second thing');
    expect(us01Call.prompt).toContain('src/example-be.js'); // Tech-Spec skeleton's own index row
    expect(us01Call.prompt).toContain('(none — this is the first phase generated)');
    expect(us02Call.prompt).toContain('System does the second thing');
    expect(us02Call.prompt).not.toContain('System does the first thing');
    expect(us02Call.prompt).toContain('US-01-TASK-BE-01'); // US-01's own already-decided task, visible to US-02
  });

  test('phase N\'s tasks are persisted to index.json before phase N+1 is dispatched (AC-04)', async () => {
    writeSplitFixtures();
    const indexSnapshotsAtUs02Dispatch = [];
    const dispatch = jest.fn(async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-work-breakdown-phase' && options.prompt.includes('"id": "US-02"')) {
        indexSnapshotsAtUs02Dispatch.push(JSON.parse(fs.readFileSync(path.join(f.dir, 'wbs', 'index.json'), 'utf8')));
      }
      return phaseAwareDispatch().getMockImplementation()(options);
    });
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    expect(indexSnapshotsAtUs02Dispatch).toHaveLength(1);
    expect(indexSnapshotsAtUs02Dispatch[0].tasks['US-01-TASK-BE-01']).toBeDefined();
    expect(indexSnapshotsAtUs02Dispatch[0].tasks['US-02-TASK-BE-01']).toBeUndefined();
  });

  test('a resumed run with phase 1 already completed skips it and resumes at phase 2 (AC-05)', async () => {
    writeSplitFixtures();
    const firstDispatch = phaseAwareDispatch();
    // simulate a crash: run once, then truncate index.json back to "only US-01 done"
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: firstDispatch });
    const index = JSON.parse(fs.readFileSync(path.join(f.dir, 'wbs', 'index.json'), 'utf8'));
    index.phases[1].taskIds = [];
    delete index.tasks['US-02-TASK-BE-01'];
    fs.writeFileSync(path.join(f.dir, 'wbs', 'index.json'), JSON.stringify(index, null, 2));
    fs.rmSync(path.join(f.dir, 'wbs', 'user-stories', 'US-02.md'), { force: true });
    f.entries()[0].status = 'running'; // allow a second real dispatch pass
    const resumeDispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: resumeDispatch });
    expect(findCalls(resumeDispatch, 'gaia-generate-work-breakdown')).toHaveLength(0); // enumeration not redispatched
    const us01Calls = findCalls(resumeDispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-01"'));
    expect(us01Calls).toHaveLength(0); // phase 1 not redispatched
    const us02Calls = findCalls(resumeDispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-02"'));
    expect(us02Calls).toHaveLength(1); // phase 2 resumed
  });

  test('a complete per-phase-produced skeleton passes wb-skeleton-check/wb-graph-checks/wb-validate (AC-06)', async () => {
    writeSplitFixtures();
    const dispatch = phaseAwareDispatch();
    const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    expect(result.gate2_payload.gate2_blocked).toBe(false);
    expect(result.total_tasks).toBe(2);
  });

  test('gaia-generate-work-breakdown-task (per-task DETAIL pass) runs unaffected against the assembled skeleton (AC-07)', async () => {
    writeSplitFixtures();
    const dispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const detailCalls = findCalls(dispatch, 'gaia-generate-work-breakdown-task');
    expect(detailCalls).toHaveLength(2);
  });

  test('needsComponentDetail at the per-phase tier triggers exactly one bounded second call for that phase only (AC-08)', async () => {
    writeSplitFixtures();
    let us01CallCount = 0;
    const dispatch = jest.fn(async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-work-breakdown-phase' && options.prompt.includes('"id": "US-01"')) {
        us01CallCount++;
        if (us01CallCount === 1) return phaseTasksResponse('US-01-TASK-BE-01', { needsComponentDetail: [{ fileSlug: 'example-be.js.md', reason: 'need interface detail' }] });
        return phaseTasksResponse('US-01-TASK-BE-01');
      }
      return phaseAwareDispatch().getMockImplementation()(options);
    });
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const us01Calls = findCalls(dispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-01"'));
    expect(us01Calls).toHaveLength(2);
    expect(us01Calls[1].prompt).toContain('Component detail you requested:');
    expect(us01Calls[1].prompt).toContain('doExampleWork');
    const us02Calls = findCalls(dispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-02"'));
    expect(us02Calls).toHaveLength(1); // US-02's own call is unaffected by US-01's drill-down round
  });
});
```

`phaseAwareDispatch()` is built fresh per test (never shared) since several tests mutate call
counts or re-invoke it from inside a wrapping `jest.fn`; its `getMockImplementation()` re-entry
pattern (used in the AC-04/AC-08 tests, which need to observe/count calls to ONE specific agent
while still delegating every other agent's response to the shared fixture) mirrors the existing
FTR-032-follow-up block's own `return phase2Dispatch(finalWb)(options)` delegation idiom — the
same idiom, generalized to a `jest.fn` since `phaseAwareDispatch()` itself must be inspectable via
`findCalls`.

## Tests

This component *is* the test file for AC-01 through AC-08. AC-09 (full-suite regression) is not a
new test — it is `npm test` passing in full once every other change in this feature lands.
