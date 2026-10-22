<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Cover per-phase WBS generation end to end and keep every pre-existing pm-phase2 test passing
- **Outcome:** tests/integration/workflow-runtime.test.js's shared phase2Dispatch fixture is upgraded to answer BOTH the phase-enumeration and per-phase calls from one wb object (so every pre-existing pm-phase2 test keeps passing unmodified); two tests with their own inline (non-shared) dispatch gain the same per-phase handling; the obsolete enumeration-tier drill-down describe block is removed; a new FTR-033 describe block proves AC-01 through AC-08 against the real two-tier flow
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-INFRA-01, US-01-TASK-INFRA-02, US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** The shared-fixture upgrade and the new describe block are one task because the new tests cannot pass without the upgraded fixture, and the fixture upgrade has no independent value without the tests that exercise the two-tier flow it now supports — splitting them risks landing one half without the other, the exact gap this feature's own grouping precedent (FTR-024's agent+registry task) exists to avoid.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** cover per-phase WBS generation end to end, keep pre-existing pm-phase2 tests passing

**Implementation notes:**

Per `spec/components/workflow-runtime.test.js.md` verbatim, against the real current
`tests/integration/workflow-runtime.test.js`. Four edits, all within this one file:

**Edit 1 — replace `phase2Dispatch` (current lines 592-601) with the phase-aware version:**

```js
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

Every `wb` fixture passed to `phase2Dispatch` anywhere in this file already carries `title`,
`commit`, `sourceUC`, and a per-phase `context` on each phase entry (required by the CURRENT
`SKELETON_SCHEMA`), so none of the ~15 pre-existing call sites need any change — only this one
function's body changes.

**Edit 2 — two tests define their OWN inline dispatch instead of using `phase2Dispatch`, and both
need an added `'gaia-generate-work-breakdown-phase'` branch or they will break under the real
two-tier flow:**

1. `'pm-phase2 writes each phase detail file with Source UC/Context/Tasks-in-phase/Depends-on-phases...'`
   (current lines 811-850): after its existing `if (name === 'gaia-generate-work-breakdown') { ... }`
   branch (which currently returns the full two-phase `wb` with tasks included — change it to
   return only `{ schemaVersion: 3, feature: wb.feature, phases: wb.phases.map(p => ({ id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC })) }`),
   add:
   ```js
   if (name === 'gaia-generate-work-breakdown-phase') {
     const phaseId = options.prompt.match(/"id":\s*"([^"]+)"/)[1];
     const phase = wb.phases.find(p => p.id === phaseId);
     const tasks = {};
     for (const taskId of phase.taskIds) tasks[taskId] = wb.tasks[taskId];
     return { exitCode: 0, result: { is_error: false, structured_output: { context: phase.context, tasks }, usage: { input_tokens: 10, output_tokens: 5 } } };
   }
   ```
   This test's own assertions (Source UC/Context/Tasks-in-phase/Depends-on-phases rendered
   correctly, including a real cross-phase `dependsOn`) are UNCHANGED and still exercise exactly
   what they did before — only how the skeleton reaches `pm-phase2.js` changes.

2. `'pm-phase2 gives each per-task worker only its own AC-matched Tech-Spec component...'`
   (current lines 923-965): same change — its existing `gaia-generate-work-breakdown` branch
   (currently returning the full `wb` with tasks) becomes enumeration-only, and gains the same
   `'gaia-generate-work-breakdown-phase'` branch shape as above (using this test's own single-phase
   `wb.phases[0]`).

**Edit 3 — delete the entire `'FTR-032 follow-up — bounded needsComponentDetail drill-down for the
WBS skeleton call'` describe block (current lines 683-775, including its own leading explanatory
comment and its local `writeSplitFixtures`/`finalWb`/`skeletonResponse`/`findSkeletonCalls`
helpers).** It tests `needsComponentDetail` at the ENUMERATION tier — a capability this feature
does not carry forward (the enumeration call/schema never declares that field; only the new
per-phase call does). This is a relocation, not a coverage loss: its one still-valid assertion
("the skeleton prompt never inlines a component's own body") is folded into the new AC-01 test
below via a `doExampleWork` assertion; the drill-down mechanism itself is re-proven at its new,
correct tier by the new AC-08 test.

**Edit 4 — add the new describe block**, placed after the (now-deleted) FTR-032 follow-up block's
former location, before the `test.each([true, false])('pm-phase2 runs real validator...'` test:

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
      }, ...extra } } };
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
    expect(enumCalls[0].prompt).not.toContain('doExampleWork');
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
    expect(us01Call.prompt).toContain('src/example-be.js');
    expect(us01Call.prompt).toContain('(none — this is the first phase generated)');
    expect(us02Call.prompt).toContain('System does the second thing');
    expect(us02Call.prompt).not.toContain('System does the first thing');
    expect(us02Call.prompt).toContain('US-01-TASK-BE-01');
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
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: firstDispatch });
    const index = JSON.parse(fs.readFileSync(path.join(f.dir, 'wbs', 'index.json'), 'utf8'));
    index.phases[1].taskIds = [];
    delete index.tasks['US-02-TASK-BE-01'];
    fs.writeFileSync(path.join(f.dir, 'wbs', 'index.json'), JSON.stringify(index, null, 2));
    fs.rmSync(path.join(f.dir, 'wbs', 'user-stories', 'US-02.md'), { force: true });
    f.entries()[0].status = 'running';
    const resumeDispatch = phaseAwareDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: resumeDispatch });
    expect(findCalls(resumeDispatch, 'gaia-generate-work-breakdown')).toHaveLength(0);
    const us01Calls = findCalls(resumeDispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-01"'));
    expect(us01Calls).toHaveLength(0);
    const us02Calls = findCalls(resumeDispatch, 'gaia-generate-work-breakdown-phase').filter(o => o.prompt.includes('"id": "US-02"'));
    expect(us02Calls).toHaveLength(1);
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
    expect(us02Calls).toHaveLength(1);
  });
});
```

**Verification commands:**

```
npx jest tests/integration/workflow-runtime.test.js
```
