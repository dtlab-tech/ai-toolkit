'use strict';
const fs = require('fs');
const path = require('path');
const { runWorkflow } = require('../../lib/workflow-runner');
const { fixture } = require('../helpers/workflow-fixture');
const { loadWorkBreakdown } = require('../../src/claude/scripts/wbs-assembler');
let f;
beforeEach(() => { f = fixture(); });
afterEach(() => { f.clean(); });
const success = value => ({ exitCode: 0, result: { is_error: false, result: value, usage: { input_tokens: 10, output_tokens: 5 } } });
// pm-phase1.js requires Requirements/Tech-Spec to carry their full numbered
// section skeleton (9 / 12 top-level "## N. " headings) as a truncation
// guard — a minimal "# Result\n" placeholder no longer satisfies that
// contract, so fixture content for those two documents must include every
// required section.
const sectionedDoc = (count, note = '') => Array.from({ length: count }, (_, i) => `## ${i + 1}. Section ${i + 1}\n`).join('\n') + (note ? `\n${note}\n` : '');
// FTR-021: gaia-generate-requirements now produces only the skeleton (every section except
// each use case's own flow body); Section 2 is reduced to a use-case index table. A second
// agent, gaia-generate-requirements-use-case, is dispatched once per table row to produce
// that use case's full detail, which pm-phase1.js reassembles into the same 9-section
// document via req-assembler.js. One UC row keeps these fixtures minimal while still
// exercising the real skeleton -> per-UC -> assembly path (not a single mocked blob).
const USE_CASE_TABLE = '| UC ID | Title | Actor | Priority | File |\n|---|---|---|---|---|\n| UC-01 | Example | User | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |\n';
// FTR-023: Section 7 needs a real AC table (not a bare placeholder) — tech-spec-graph-checks.js's
// CLI calls wb-graph-checks.js's parseAcTable against this same document, which hard-exits if it
// can't find a real "## 7. Acceptance Criteria" table. "All UCs" avoids coupling this fixture to
// phase/UC-scope matching, which is unrelated to what any of these tests exercise.
const requirementsSkeletonDoc = (note = '', upToSection = 9) => Array.from({ length: upToSection }, (_, i) => {
  const n = i + 1;
  if (n === 2) return `## 2. Use Cases\n\n${USE_CASE_TABLE}`;
  if (n === 7) return '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n| AC-01 | placeholder | All UCs |\n';
  return `## ${n}. Section ${n}${n === 1 && note ? ' (' + note + ')' : ''}\n`;
}).join('\n');
const useCaseDetailDoc = () => '### UC-01: Example\n\n| Field | Value |\n|---|---|\n| Actor | User |\n| Preconditions | - |\n| Trigger | - |\n| Priority | Must |\n\n**Main flow:**\n1. Step\n\n**Postconditions:**\n- Done\n';
// FTR-024: gaia-generate-tech-spec now produces only the skeleton (every section except each
// component's own Backend/Frontend/External-Integration/Testing detail); Section 9 gains
// Domain/Spec columns and is the Components index. A second agent,
// gaia-generate-tech-spec-component, is dispatched once per table row to produce that
// component's full detail, which pm-phase1.js reassembles via tech-spec-assembler.js. One
// component row ("a.js") keeps these fixtures minimal while still exercising the real
// skeleton -> per-component -> assembly path.
const COMPONENTS_TABLE = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
  '| a.js | example | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n\n' +
  '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
const techSpecSkeletonDoc = (upToSection = 12) => Array.from({ length: upToSection }, (_, i) => {
  const n = i + 1;
  return n === 9 ? `## 9. File Inventory\n\n${COMPONENTS_TABLE}` : `## ${n}. Section ${n}\n`;
}).join('\n');
const techSpecComponentDetailDoc = () =>
  '# a.js — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\nExample body.\n\n## Tests\n\nExample tests.\n';
// The agent has no Write tool — it returns the document content directly (plain
// result text, or the schema's `report` field), and the host persists it.
function phase1Dispatch({ args }) {
  const name = args[args.indexOf('--agent') + 1];
  const known = ['gaia-generate-requirements', 'gaia-generate-requirements-use-case', 'gaia-generate-tech-spec', 'gaia-generate-tech-spec-component', 'gaia-validate-feature-docs'];
  if (!known.includes(name)) throw new Error('Unexpected worker: ' + name);
  const content = name === 'gaia-generate-requirements' ? requirementsSkeletonDoc()
    : name === 'gaia-generate-requirements-use-case' ? useCaseDetailDoc()
    : name === 'gaia-generate-tech-spec' ? techSpecSkeletonDoc()
    : name === 'gaia-generate-tech-spec-component' ? techSpecComponentDetailDoc()
    : '# Result\n';
  const response = success(content);
  if (name === 'gaia-validate-feature-docs') response.result.structured_output = { valid: true, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
  return Promise.resolve(response);
}
test('real installed pm-phase1 executes only semantic workers and persists done after outputs', async () => {
  const dispatch = jest.fn(phase1Dispatch);
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch).toHaveBeenCalledTimes(5); // requirements skeleton + 1 use case + tech-spec skeleton + 1 component + validate
  expect(result.validation.summary).toContain('0 gaps');
  expect(result.token_ledger).toHaveLength(5);
  expect(f.entries().every(e => e.status === 'done')).toBe(true);
  expect(fs.readFileSync(path.join(f.dir, 'FTR-099-process-log.txt'), 'utf8')).toContain('Gate 1');
});
test('worker exception leaves both activity and workflow failed', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => { throw new Error('crash'); } })).rejects.toThrow('crash');
  expect(f.entries().map(e => e.status)).toEqual(['failed', 'failed']);
});

test.each([undefined, null, ''])('a written validation report without structured output fails explicitly: %s', async payload => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      response.result.result = JSON.stringify({ valid: true, findings: [] });
      response.result.structured_output = payload;
    }
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    // FTR-029: needsRequirementsFix/needsTechSpecFix are no longer in the schema's required array
    .rejects.toThrow('Worker returned no structured output: gaia.agent.planner.validate-feature-docs; expected fields: valid, findings, report');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-Validation-Report.md'))).toBe(false);
  expect(f.entries()[0].status).toBe('failed');
  expect(f.entries().find(e => e.agentId === 'gaia.agent.planner.validate-feature-docs').status).toBe('failed');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-process-log.txt'))).toBe(false);
});

test('document findings trigger host revision followed by a clean structured verdict', async () => {
  let validations = 0;
  const dispatch = jest.fn(async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      const schema = JSON.parse(options.args[options.args.indexOf('--json-schema') + 1]);
      // FTR-029: needsRequirementsFix/needsTechSpecFix moved out of required (still in properties)
      expect(schema.required).toEqual(['valid', 'findings', 'report']);
      if (++validations === 1) response.result.structured_output = { valid: false, findings: ['Requirements: missing acceptance criterion'], needsRequirementsFix: true, needsTechSpecFix: false, report: '# Result\n' };
    }
    return response;
  });
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(result.validation.summary).toContain('clean on cycle 2');
  expect(dispatch.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])).toEqual([
    'gaia-generate-requirements', 'gaia-generate-requirements-use-case', 'gaia-generate-tech-spec', 'gaia-generate-tech-spec-component', 'gaia-validate-feature-docs',
    'gaia-generate-requirements', 'gaia-generate-requirements-use-case', 'gaia-validate-feature-docs',
  ]);
  expect(f.entries().every(e => e.status === 'done')).toBe(true);
  expect(result.docs_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
});

test('docs_digest is deterministic over the same Requirements/Tech-Spec content and changes when they do', async () => {
  const first = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: phase1Dispatch });
  const again = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: phase1Dispatch });
  expect(again.docs_digest).toBe(first.docs_digest); // second run is a fresh-skip no-op — same content, same digest
  const changed = await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch: async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-generate-requirements')) response.result.result = requirementsSkeletonDoc('revised');
    return response;
  } });
  expect(changed.docs_digest).not.toBe(first.docs_digest);
});

test('a validator returning valid:true with non-empty findings is a contradiction, not a pass', async () => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      response.result.structured_output = { valid: true, findings: ['stray finding'], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
    }
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch })).rejects.toThrow('contradictory result');
  expect(f.entries()[0].status).toBe('failed');
});

test('a validator reporting gaps but flagging neither document for revision fails closed', async () => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) {
      response.result.structured_output = { valid: false, findings: ['unattributed gap'], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
    }
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch })).rejects.toThrow('flagged neither document for revision');
  expect(f.entries()[0].status).toBe('failed');
});

test.each([
  { valid: true },
  { valid: 'true', findings: [], needsRequirementsFix: false, needsTechSpecFix: false },
  { valid: false, findings: [42], needsRequirementsFix: true, needsTechSpecFix: false },
])('malformed validation verdict blocks Gate 1: %j', async payload => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) response.result.structured_output = payload;
    return response;
  } })).rejects.toThrow(/structured/);
  expect(f.entries()[0].status).toBe('failed');
});

test('a clean structured verdict without its report field cannot complete pm-phase1', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async options => {
    if (options.args.includes('gaia-validate-feature-docs')) {
      return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [], needsRequirementsFix: false, needsTechSpecFix: false } } };
    }
    return phase1Dispatch(options);
  } })).rejects.toThrow('Missing structured field: report');
  expect(f.entries()[0].status).toBe('failed');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-process-log.txt'))).toBe(false);
});

test('successful worker without required report fails the workflow', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async options => {
    if (options.args.includes('gaia-validate-feature-docs')) return success('ok');
    return phase1Dispatch(options);
  } })).rejects.toThrow('Worker returned no structured output: gaia.agent.planner.validate-feature-docs; expected fields: valid, findings, report');
  expect(f.entries()[0].status).toBe('failed');
});
test('a Tech-Spec truncated mid-generation is rejected immediately instead of silently reaching Gate 1', async () => {
  // Reproduces a real downstream failure: the model's cumulative output exceeded its configured
  // ceiling mid-reply, the CLI reported a clean exit with nothing signaling truncation, and the
  // host persisted the half-written document as if it were complete. Truncated after section 10
  // (not section 9): the skeleton still has a well-formed Components table, so the structural
  // pre-check (tech-spec-graph-checks.js) passes and per-component/assembly proceed — the SAME
  // truncation-detection path (assertCompleteSections, on the final assembled document) this
  // test is meant to verify still catches the missing sections 11-12. A skeleton truncated
  // before section 9 is caught earlier instead, by the pre-check itself (a different, equally
  // fail-closed error) — not what this test exercises.
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecSkeletonDoc(10));
    return phase1Dispatch(options);
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    .rejects.toThrow(/Tech-Spec output is incomplete: missing section\(s\).*of 12/);
  expect(f.entries()[0].status).toBe('failed');
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-process-log.txt'))).toBe(false);
});

test('a Requirements document truncated mid-generation is rejected immediately', async () => {
  // Truncated after section 7 (not section 2): the skeleton still has a well-formed Use
  // Cases table and Acceptance Criteria/Business Rules sections, so the structural
  // self-consistency pre-check (req-skeleton-check.js) passes and assembly proceeds — the
  // SAME truncation-detection path (assertCompleteSections, on the final assembled
  // document) this test is meant to verify still catches the missing sections 8-9. A
  // skeleton truncated before section 2 is caught earlier instead, by the pre-check itself
  // (a different, equally fail-closed error) — not what this test exercises.
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-requirements')) return success(requirementsSkeletonDoc('', 7));
    return phase1Dispatch(options);
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    .rejects.toThrow(/Requirements output is incomplete: missing section\(s\).*of 9/);
  expect(f.entries()[0].status).toBe('failed');
});

test('a previously truncated Tech-Spec skeleton left on disk from an earlier failed run is regenerated, not mistaken for fresh', async () => {
  // FTR-025: there is no more assembled FTR-099-Tech-Spec.md for a crashed run to leave behind —
  // generation only ever produces spec/index.md + its per-component files, and the assembled
  // document (when one is produced at all, e.g. by pm-phase2's bridge step) is always rebuilt
  // fresh. The equivalent corruption target now is the SKELETON itself: a spec/index.md that got
  // written (mtime newer than feature.md, so a naive mtime-only freshness check alone would
  // accept it) but is missing most of its sections, because the model's own response was
  // truncated mid-reply. The outer regen gate already catches this via missingSections; this
  // test pins down that generateTechSpec's OWN internal regenSkeleton decision agrees — a real
  // gap found and fixed while writing this test (both now check completeness, not just mtime).
  const dispatch = jest.fn(phase1Dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  fs.writeFileSync(path.join(f.dir, 'spec', 'index.md'), '## 1. Overview\n\n## 2. Architecture\n');
  dispatch.mockClear();
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])).toContain('gaia-generate-tech-spec');
  expect(result.validation.summary).toContain('clean');
  const finalSkeleton = fs.readFileSync(path.join(f.dir, 'spec', 'index.md'), 'utf8');
  expect(finalSkeleton).not.toContain('## 1. Overview\n\n## 2. Architecture');
  for (let n = 1; n <= 12; n++) expect(finalSkeleton).toMatch(new RegExp(`^## ${n}\\.\\s`, 'm'));
});

test('pm-phase1 Tech-Spec resume-by-existence dispatches only missing components', async () => {
  const twoComponentsTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
    '| a.js | example a | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n' +
    '| b.js | example b | AC-01 | BE | [components/b.js.md](components/b.js.md) |\n\n' +
    '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
  const twoComponentSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return n === 9 ? `## 9. File Inventory\n\n${twoComponentsTable}` : `## ${n}. Section ${n}\n`;
  }).join('\n');
  const componentDetail = name => `# ${name} — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\n${name} body.\n\n## Tests\n\nExample tests.\n`;
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-tech-spec') return success(twoComponentSkeletonDoc);
    if (name === 'gaia-generate-tech-spec-component') {
      const compName = options.prompt.includes('Path: a.js') ? 'a.js' : 'b.js';
      return success(componentDetail(compName));
    }
    return phase1Dispatch(options);
  };
  const dispatchFn = jest.fn(dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'a.js.md'))).toBe(true);
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'b.js.md'))).toBe(true);
  // The outer gate that decides whether generateTechSpec runs at all notices a missing
  // component file directly (anyComponentFileMissing), since there is no assembled file to
  // corrupt/delete anymore — deleting just the component is enough to force re-entry.
  fs.unlinkSync(path.join(f.dir, 'spec', 'components', 'b.js.md'));
  dispatchFn.mockClear();
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
  const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
  expect(calledAgents).not.toContain('gaia-generate-tech-spec'); // skeleton still fresh, never re-dispatched
  const componentCalls = dispatchFn.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component');
  expect(componentCalls).toHaveLength(1); // only the missing one, not a.js (already on disk)
  expect(componentCalls[0].prompt).toContain('Path: b.js');
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'b.js.md'))).toBe(true);
  expect(result.validation.summary).toContain('clean');
});
// FTR-027: resume-by-existence must not trust mere presence — a component file that exists but
// is missing its "## Change" section (the real production shape: a whole-response fence wrap,
// since separately fixed at the source) must be regenerated, not silently treated as done forever.
describe('FTR-027 — Tech-Spec component resume validity', () => {
  function twoComponentFixture() {
    const twoComponentsTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
      '| a.js | example a | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n' +
      '| b.js | example b | AC-01 | BE | [components/b.js.md](components/b.js.md) |\n\n' +
      '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
    const twoComponentSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${twoComponentsTable}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
    const componentDetail = name => `# ${name} — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\n${name} body.\n\n## Tests\n\nExample tests.\n`;
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(twoComponentSkeletonDoc);
      if (name === 'gaia-generate-tech-spec-component') {
        const compName = options.prompt.includes('Path: a.js') ? 'a.js' : 'b.js';
        return success(componentDetail(compName));
      }
      return phase1Dispatch(options);
    };
    return { dispatch };
  }

  test('a component missing its ## Change section is regenerated, not skipped', async () => {
    const { dispatch } = twoComponentFixture();
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) });
    fs.writeFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), '# a.js — New\n\nNo Change heading here.\n');
    const dispatchFn = jest.fn(dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).not.toContain('gaia-generate-tech-spec'); // skeleton still fresh, never re-dispatched
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component');
    expect(componentCalls.some(c => c.prompt.includes('Path: a.js'))).toBe(true);
    expect(fs.readFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), 'utf8')).toContain('## Change');
  });

  test('a valid component is still skipped on resume (no regression)', async () => {
    const { dispatch } = twoComponentFixture();
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) });
    const dispatchFn = jest.fn(dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component');
    expect(componentCalls).toHaveLength(0);
  });
});
// FTR-027: same gap, for Requirements use cases — a file that exists but starts with the wrong
// UC heading (a garbled or off-topic response) must be regenerated, not skipped forever.
describe('FTR-027 — Requirements use-case resume validity', () => {
  test('a UC file starting with the wrong heading is regenerated, not skipped', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(phase1Dispatch) });
    fs.writeFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), '### UC-02: Wrong use case\n\nGarbled.\n');
    const dispatchFn = jest.fn(phase1Dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).toContain('gaia-generate-requirements-use-case');
    expect(calledAgents).not.toContain('gaia-generate-requirements'); // skeleton still fresh
    expect(fs.readFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), 'utf8')).toContain('### UC-01:');
  });

  test('a valid UC file is still skipped on resume (no regression)', async () => {
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(phase1Dispatch) });
    const dispatchFn = jest.fn(phase1Dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).not.toContain('gaia-generate-requirements-use-case');
  });
});
// Real, repeated production defect across both per-item generation agents (confirmed via direct
// worker-evidence inspection, not hypothetical): the model occasionally prefixes its real
// deliverable with a short conversational lead-in ("Now I'll generate the complete use case
// details for UC-05...") before the heading it was explicitly instructed to lead with. The
// agents' own "no preamble" instruction alone did not reliably prevent it, so pm-phase1.js now
// tolerates and strips a short bounded preamble before validating/persisting, instead of hard-
// failing (use cases) or silently writing the narration into the file (components).
describe('FTR-033 follow-up — tolerate a leading conversational preamble before the real heading', () => {
  test('a UC response with a short narration preamble is stripped before validation and persistence', async () => {
    const withPreamble = `Now I'll generate the complete use case details for UC-01.\n\n${useCaseDetailDoc()}`;
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements-use-case') return success(withPreamble);
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) });
    const written = fs.readFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), 'utf8');
    expect(written.startsWith('### UC-01:')).toBe(true);
    expect(written).not.toContain("Now I'll generate");
  });

  test('a UC response whose heading never appears at all still fails after exhausting retries (no false positive)', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements-use-case') return success('Sorry, I could not find enough information to proceed with this request.\n');
      return phase1Dispatch(options);
    };
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) }))
      .rejects.toThrow('failed structural validation after 2 attempts');
  });

  test('a UC response with a preamble longer than the tolerated window still fails (bounded, not unbounded tolerance)', async () => {
    const tooLongPreamble = Array.from({ length: 6 }, (_, i) => `Narration line ${i + 1}.`).join('\n');
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements-use-case') return success(`${tooLongPreamble}\n${useCaseDetailDoc()}`);
      return phase1Dispatch(options);
    };
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) }))
      .rejects.toThrow('failed structural validation after 2 attempts');
  });

  test('a component response with a narration preamble is stripped before persistence (never silently written)', async () => {
    const componentDetail = "Now I have the information. Let me generate the design for a.js.\n\n# a.js — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\nExample body.\n\n## Tests\n\nExample tests.\n";
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec-component') return success(componentDetail);
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) });
    const written = fs.readFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), 'utf8');
    expect(written.startsWith('# a.js — New')).toBe(true);
    expect(written).not.toContain('Now I have the information');
  });
});
test('two components with colliding basenames receive distinct, deterministic fileSlug values', async () => {
  const collidingTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
    '| src/a/index.js | example a | AC-01 | BE | [components/index.js.md](components/index.js.md) |\n' +
    '| src/b/index.js | example b | AC-01 | BE | [components/index.js.md](components/index.js.md) |\n\n' +
    '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
  const collidingSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return n === 9 ? `## 9. File Inventory\n\n${collidingTable}` : `## ${n}. Section ${n}\n`;
  }).join('\n');
  const componentDetail = marker => `# component — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\n${marker}\n\n## Tests\n\nExample tests.\n`;
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-tech-spec') return success(collidingSkeletonDoc);
    if (name === 'gaia-generate-tech-spec-component') {
      const marker = options.prompt.includes('Path: src/a/index.js') ? 'body-of-a' : 'body-of-b';
      return success(componentDetail(marker));
    }
    return phase1Dispatch(options);
  };
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  // First occurrence keeps the original slug; the colliding second occurrence is disambiguated
  // by prepending path segments (host-computed, deterministic — see disambiguateFileSlugs).
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'index.js.md'))).toBe(true);
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'b-index.js.md'))).toBe(true);
  const indexDoc = fs.readFileSync(path.join(f.dir, 'spec', 'index.md'), 'utf8');
  expect(indexDoc).toContain('src/a/index.js | example a | AC-01 | BE | [components/index.js.md](components/index.js.md)');
  expect(indexDoc).toContain('src/b/index.js | example b | AC-01 | BE | [components/b-index.js.md](components/b-index.js.md)');
  // No assembled Tech-Spec file exists anymore — read each component's own detail file directly.
  expect(fs.readFileSync(path.join(f.dir, 'spec', 'components', 'index.js.md'), 'utf8')).toContain('body-of-a');
  expect(fs.readFileSync(path.join(f.dir, 'spec', 'components', 'b-index.js.md'), 'utf8')).toContain('body-of-b');
});
// Real production bug: the component template's own Spec link is explicitly "provisional, not
// final" so the host can rewrite it — disambiguateFileSlugs only ever did so for COLLISIONS,
// never enforcing the ".md" suffix itself. A real Tech-Spec skeleton had the model omit ".md"
// entirely for 20 of ~61 components (e.g. `[components/Settings.tsx](components/Settings.tsx)`),
// so the host faithfully wrote that component's Markdown CONTENT into a file literally named
// `Settings.tsx` — confusing at best, and indistinguishable on disk from the real source file's
// own extension. Fixed by normalizing every slug to end in ".md" before the collision check runs.
test('a component Spec link missing its ".md" suffix is normalized before being written to disk', async () => {
  const noSuffixTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
    '| src/shell/app/src/pages/Settings/Settings.tsx | Replace strings | AC-01 | FE | [components/shell-app-Settings.tsx](components/shell-app-Settings.tsx) |\n\n' +
    '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
  const noSuffixSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return n === 9 ? `## 9. File Inventory\n\n${noSuffixTable}` : `## ${n}. Section ${n}\n`;
  }).join('\n');
  const componentDetail = () => '# Settings.tsx — Modified\n\n## Change\n\nExample change.\n\n## Algorithm\n\nExample body.\n\n## Tests\n\nExample tests.\n';
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-tech-spec') return success(noSuffixSkeletonDoc);
    if (name === 'gaia-generate-tech-spec-component') return success(componentDetail());
    return phase1Dispatch(options);
  };
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'shell-app-Settings.tsx'))).toBe(false);
  expect(fs.existsSync(path.join(f.dir, 'spec', 'components', 'shell-app-Settings.tsx.md'))).toBe(true);
  const indexDoc = fs.readFileSync(path.join(f.dir, 'spec', 'index.md'), 'utf8');
  expect(indexDoc).toContain('[components/shell-app-Settings.tsx.md](components/shell-app-Settings.tsx.md)');
});
// Closes the gap flagged when the gaia-* templates were moved into the toolkit: the per-UC
// generation agent is deliberately never given req/index.md's Business Rules/Acceptance
// Criteria tables (to avoid re-deciding which UCs exist), so it cannot produce the use-case
// template's "Related Business Rules"/"Related Acceptance Criteria" cross-reference lines
// itself — the host now computes and appends both, mechanically, after the agent's own response.
test('pm-phase1 appends host-computed Related Business Rules/Acceptance Criteria cross-references to each use case', async () => {
  const twoUcTable = '| UC ID | Title | Actor | Priority | File |\n|---|---|---|---|---|\n' +
    '| UC-01 | First | User | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |\n' +
    '| UC-02 | Second | User | Should | [use-cases/UC-02.md](use-cases/UC-02.md) |\n';
  // tech-spec-ac-check's underlying parseAcTable (wb-graph-checks.js) resolves each referenced
  // UC's priority from the Section 2 index table's own Priority column (a fallback added
  // alongside this fix — a split-format skeleton has no per-UC "### UC-NN:" heading at all, that
  // detail lives in a separate req/use-cases/UC-NN.md file). Do NOT inject fake "### UC-NN:"
  // sub-tables into Section 2's body here — every pipe-starting line within a section's range is
  // read as an index-table ROW by req-assembler.js's own parser (no sub-heading awareness), so a
  // "| Field | Value |" sub-table row gets misparsed as a bogus extra UC row (a real bug, found
  // exactly this way: req-skeleton-check.js rejected it as "malformed File column for UC 'Field'").
  const reqDocWithBRs = Array.from({ length: 9 }, (_, i) => {
    const n = i + 1;
    if (n === 2) return `## 2. Use Cases\n\n${twoUcTable}`;
    if (n === 3) return '## 3. Business Rules\n\n| ID | Rule | Applies to |\n|---|---|---|\n' +
      '| BR-01 | Only applies to UC-01 | UC-01 |\n| BR-02 | Applies everywhere | All UCs |\n';
    if (n === 7) return '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n' +
      '| AC-01 | Scoped to UC-01 only | UC-01 |\n';
    return `## ${n}. Section ${n}\n`;
  }).join('\n');
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-requirements') return success(reqDocWithBRs);
    if (name === 'gaia-generate-requirements-use-case') {
      const ucId = options.prompt.match(/UC ID: (UC-\d+)/)[1];
      return success(`### ${ucId}: Example\n\n| Field | Value |\n|---|---|\n| Actor | User |\n` +
        '| Preconditions | - |\n| Trigger | - |\n| Priority | Must |\n\n**Main flow:**\n1. Step\n\n**Postconditions:**\n- Done\n');
    }
    return phase1Dispatch(options);
  };
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  const uc01 = fs.readFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-01.md'), 'utf8');
  // UC-01: both BR-01 (scoped to it) and BR-02 (All UCs) apply; AC-01 is scoped to it.
  expect(uc01).toContain('**Related Business Rules:** BR-01, BR-02 (see [index.md](../index.md#3-business-rules))');
  expect(uc01).toContain('**Related Acceptance Criteria:** AC-01 (see [index.md](../index.md#7-acceptance-criteria))');
  const uc02 = fs.readFileSync(path.join(f.dir, 'req', 'use-cases', 'UC-02.md'), 'utf8');
  // UC-02: only BR-02 (All UCs) applies; no AC references it at all.
  expect(uc02).toContain('**Related Business Rules:** BR-02 (see [index.md](../index.md#3-business-rules))');
  expect(uc02).toContain('**Related Acceptance Criteria:** — (see [index.md](../index.md#7-acceptance-criteria))');
});
// Regression test for a real production bug: a headless `--print --no-session-persistence`
// worker has no TTY to answer a permission prompt, so an agent instructed to Read its own
// toolkit template file (outside the project root for a globally-installed toolkit) was
// silently denied ("Worker permission denied: ...; tools: Read") even though the rest of its
// response was generated correctly. Fixed by having the host inline each template's text
// directly into the prompt (via the new print-asset CLI command) instead of telling the agent
// to Read it itself — this test locks in that every one of the four pm-phase1 agents that used
// to read a template actually receives it inlined now.
test('pm-phase1 inlines each agent\'s own template text into its prompt, instead of making it Read the file itself', async () => {
  const prompts = {};
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (!prompts[name]) prompts[name] = options.prompt;
    return phase1Dispatch(options);
  };
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(prompts['gaia-generate-requirements']).toContain('Template (req/index.md):');
  expect(prompts['gaia-generate-requirements']).toContain('REQUIREMENTS INDEX TEMPLATE');
  expect(prompts['gaia-generate-requirements-use-case']).toContain('Template (req/use-cases/{UC-ID}.md):');
  expect(prompts['gaia-generate-requirements-use-case']).toContain('USE CASE TEMPLATE');
  expect(prompts['gaia-generate-tech-spec']).toContain('Template (spec/index.md):');
  expect(prompts['gaia-generate-tech-spec']).toContain('TECH-SPEC INDEX TEMPLATE');
  expect(prompts['gaia-generate-tech-spec-component']).toContain('Template (spec/components/{fileSlug}.md):');
  expect(prompts['gaia-generate-tech-spec-component']).toContain('COMPONENT TEMPLATE');
});
test('fresh outputs skip workers; force requests them again', async () => {
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: phase1Dispatch });
  const dispatch = jest.fn(phase1Dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch).not.toHaveBeenCalled();
  await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch });
  // FTR-027 (AC-08): every item generated above is genuinely VALID, so the new
  // isValidComponentDetail/isValidUseCaseFile checks never cause a skip either — the middle
  // assertion above (dispatch not called) already proves the new checks don't force unwanted
  // regeneration, and this one proves --force still regenerates everything unconditionally
  // regardless of validity, exactly as before this feature.
  expect(dispatch).toHaveBeenCalledTimes(5); // requirements skeleton + 1 use case + tech-spec skeleton + 1 component + validate
});
test('pm-phase2 stops before dispatch without Gate 1', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled(); expect(f.entries()[0].status).toBe('failed');
});
test('retired pm-phase3 never dispatches implementation or creates a done ledger', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('pm-phase3', [f.feature], { ...f.options, dispatch })).rejects.toThrow('tasks start/run');
  expect(dispatch).not.toHaveBeenCalled();
});
test('unsupported assessment scopes fail closed rather than silently run zero assessors', async () => {
  const dispatch = jest.fn();
  await expect(runWorkflow('am-phase1', ['.', '--prefix', 'ASSESS-001', '--scope=unknown'], { ...f.options, dispatch })).rejects.toThrow('Unknown');
  expect(dispatch).not.toHaveBeenCalled();
});
test('security/domain/dependencies/devops use one generic assessor, never remediation workers', async () => {
  const calls = [];
  // Neither assessor has a Write tool: each returns its content directly (plain text, or
  // a `files` array under --json-schema) and the host persists it.
  const dispatch = async options => {
    calls.push(options);
    if (options.args.includes('gaia-intervention-documentation-standard')) {
      return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
        structured_output: { files: [
          { path: 'ASSESS-001-Interventions-Index.md', content: '| ID | Title | Criticality |\n|---|---|---|\n| INT-001 | Risk | HIGH |\n' },
        ] } } };
    }
    return success('# Assessment\n');
  };
  const result = await runWorkflow('am-phase1', ['.', '--prefix', 'ASSESS-001', '--scope=security,domain-model,dependencies,devops'], { ...f.options, dispatch });
  expect(calls.map(o => o.args[o.args.indexOf('--agent') + 1])).toEqual(['gaia-generic-software-assessment', 'gaia-intervention-documentation-standard']);
  expect(calls[0].prompt).toContain('Explicit scope: security, domain-model, dependencies, devops');
  expect(result.severity_counts.HIGH).toBe(1); expect(result.remediation_hours_est).toBe(4);
  const approved = await runWorkflow('am-phase2', ['--prefix', 'ASSESS-001', '--ack', 'Reviewed', '--flagged', 'INT-001'], f.options);
  expect(approved.flagged_count).toBe(1);
  expect(fs.readFileSync(path.join(f.root, approved.approvals_path), 'utf8')).toContain('| INT-001 | Yes |');
});

test('am-phase1 resumes: an assessor whose output already exists on disk is never re-dispatched', async () => {
  // Simulates a crash after one assessor's output already landed on disk but
  // before the run ever reached ledger completion — a fresh attempt (new runId,
  // same prefix/outputDir) must not pay for that assessor again.
  const outputDir = path.join(f.root, 'docs/assessments/ASSESS-002');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'ASSESS-002-Layer-Assessment.md'), '# Already-done layered-architecture report\n');
  const calls = [];
  const dispatch = async options => {
    calls.push(options);
    const agent = options.args[options.args.indexOf('--agent') + 1];
    if (agent === 'gaia-layered-architecture-assessment') throw new Error('must not re-dispatch an assessor whose output already exists');
    if (options.args.includes('gaia-intervention-documentation-standard')) {
      return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
        structured_output: { files: [{ path: 'ASSESS-002-Interventions-Index.md', content: '| ID | Title | Criticality |\n|---|---|---|\n' }] } } };
    }
    return success('# Assessment\n');
  };
  const result = await runWorkflow('am-phase1', ['.', '--prefix', 'ASSESS-002', '--scope=architecture,concurrency'], { ...f.options, dispatch });
  expect(calls.map(o => o.args[o.args.indexOf('--agent') + 1])).toEqual(['gaia-concurrency-safety-assessment', 'gaia-intervention-documentation-standard']);
  const layerSummary = result.assessment_summaries.find(s => s.agent === 'gaia.agent.assessment.layered-architecture');
  expect(fs.readFileSync(path.join(f.root, layerSummary.output_file), 'utf8')).toContain('Already-done layered-architecture report');
});

function phase2Setup() {
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'), '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n');
  // FTR-022: one real AC row so ac-task-matrix.js has something non-trivial to render. "All
  // UCs" (unscoped) avoids needing a UC heading whose US-NN-derived phase scope would have to
  // match the fixture's single INFRA phase (check 20) — the scope-matching machinery isn't
  // what this fixture exists to exercise.
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Requirements.md'),
    '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n' +
    '| AC-01 | Example criterion | All UCs |\n');
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), '## 9. File Inventory\n\nNew files: none\n');
  // FTR-020: gaia-generate-work-breakdown now returns a schema-v3 SKELETON (validated via
  // --json-schema, not plain text) — wb-valid.json is the pre-FTR-020 schema-v2 full-document
  // shape and no longer matches what pm-phase2.js's skeleton call actually requests. One
  // phase, one task is the minimal shape satisfying SKELETON_SCHEMA's required fields.
  const wb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [{ id: 'INFRA', type: 'infrastructure', title: 'Infrastructure', sourceUC: [], context: 'Shared infra setup.',
      commit: { type: 'feat', subject: 'infra' }, taskIds: ['INFRA-TASK-BE-01'] }],
    tasks: { 'INFRA-TASK-BE-01': {
      title: 'Example task', outcome: 'Example outcome', domain: 'BE', agentType: 'developer-backend',
      dependsOn: [], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 8, tokens: 10000 },
      outputCount: 1, commit: { type: 'feat', subject: 'example' },
    } },
  };
  return wb;
}
// The per-task agent's response is the existing rendered detail-block format (field lines +
// fenced verification commands) — written verbatim via c.writeOutput, not schema-validated.
const taskDetailDoc = taskId => `### ${taskId}\n\n- **Task ID:** ${taskId}\n- **Title:** Example task\n` +
  '- **Outcome:** Example outcome\n- **Domain:** BE\n- **Agent type:** developer-backend\n' +
  '- **Dependencies:** —\n- **Acceptance criteria:** —\n- **Estimate — agent minutes:** 8\n' +
  '- **Estimate — tokens:** 10000\n- **Output count:** 1\n- **Grouping rationale:** —\n' +
  '- **Commit type:** feat\n- **Commit scope:** —\n- **Commit subject:** example\n\n' +
  '**Verification commands:**\n\n```\nnode --check src/index.js\n```\n';
// FTR-033: phase-aware — answers BOTH the phase-enumeration call (gaia-generate-work-breakdown,
// now enumeration-only) and the new per-phase call (gaia-generate-work-breakdown-phase) from the
// one `wb` object every existing test already passes, so none of the ~15 pre-existing pm-phase2
// tests using this fixture need to change.
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
// FTR-027: same gap, for Work Breakdown tasks — a task file marked "generated" but with zero
// verification commands (the task template's own documented "Must be non-empty" contract) must be
// regenerated, not skipped forever.
describe('FTR-027 — Work Breakdown task resume validity', () => {
  test('a generated task with zero verification commands is regenerated, not skipped', async () => {
    const wb = phase2Setup();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: jest.fn(phase2Dispatch(wb)) });
    const taskPath = path.join(f.dir, 'wbs', 'tasks', 'INFRA-TASK-BE-01.md');
    const noCommands = fs.readFileSync(taskPath, 'utf8').replace(/\*\*Verification commands:\*\*[\s\S]*$/, '**Verification commands:**\n');
    fs.writeFileSync(taskPath, noCommands);
    const dispatchFn = jest.fn(phase2Dispatch(wb));
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: dispatchFn });
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).toContain('gaia-generate-work-breakdown-task');
  });

  test('a generated task with a real verification command is still skipped (no regression)', async () => {
    const wb = phase2Setup();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: jest.fn(phase2Dispatch(wb)) });
    const dispatchFn = jest.fn(phase2Dispatch(wb));
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: dispatchFn });
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).not.toContain('gaia-generate-work-breakdown-task');
  });
});

// FTR-032: the WBS skeleton call no longer asks for a per-task effort estimate — the per-task
// detail call already produces one (its own template asks for it), the skeleton used to just
// discard it. These tests prove: a skeleton response omitting `estimate` entirely is accepted; the
// assembled task's `estimate` comes from the per-task detail response, not the (now estimate-less)
// skeleton; and nothing downstream (c.estimates(), the structural checks) regresses.
describe('FTR-032 — WBS skeleton call no longer requires estimate; per-task detail call is the source of truth', () => {
  const taskDetailDocWithEstimate = (taskId, { agentMinutes, tokens }) =>
    taskDetailDoc(taskId)
      .replace(/- \*\*Estimate — agent minutes:\*\* \d+/, `- **Estimate — agent minutes:** ${agentMinutes}`)
      .replace(/- \*\*Estimate — tokens:\*\* \d+/, `- **Estimate — tokens:** ${tokens}`);

  test('a skeleton response omitting estimate entirely is accepted (AC-01)', async () => {
    const wb = phase2Setup();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).resolves.toBeDefined();
  });

  test('the assembled task\'s estimate comes from the per-task detail response, not the skeleton (AC-02)', async () => {
    const wb = phase2Setup();
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
    const assembled = loadWorkBreakdown(path.join(f.dir, 'wbs'));
    const task = assembled.phases[0].tasks.find(t => t.id === 'INFRA-TASK-BE-01');
    expect(task.estimate).toEqual({ agentMinutes: 13, tokens: 31000 });
  });

  test('c.estimates() still reports effort totals correctly with the shrunk skeleton (AC-03)', async () => {
    const wb = phase2Setup();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    expect(result.human_estimate).toBeDefined();
    expect(result.agent_estimate).toBeDefined();
  });

  test('wb-skeleton-check/wb-graph-checks still pass against a skeleton with no estimate field at all (AC-04)', async () => {
    const wb = phase2Setup();
    delete wb.tasks['INFRA-TASK-BE-01'].estimate;
    const dispatch = jest.fn(phase2Dispatch(wb));
    // a rejection here would mean a structural check regressed against the new shape — none of
    // wb-skeleton-check.js/wb-graph-checks.js read `estimate`, confirmed by direct inspection
    await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).resolves.toBeDefined();
  });
});

// FTR-033: splits the single monolithic skeleton call (deciding the ENTIRE feature's task graph in
// one turn — confirmed to fail reliably at real feature scale, 12/12 consecutive failures on a
// real feature, independent of prompt size post-FTR-032 and of dispatch mechanism, headless and
// interactive both fail on the byte-identical prompt) into a lightweight phase-enumeration call
// plus one bounded call per phase. Supersedes the old "FTR-032 follow-up" describe block that used
// to live here: that block tested needsComponentDetail drill-down AT THE ENUMERATION TIER, a
// capability this feature does not carry forward (the enumeration call never declares
// needsComponentDetail; only the per-phase call does, since phase-level decisions never need a
// component's own design body) — its one still-valid assertion ("the skeleton prompt never inlines
// a component's own body") is folded into this block's own AC-01 test below; the drill-down
// mechanism itself is re-proven at its new, correct tier by the AC-08 test.
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
    // AC-01 is scoped to UC-01 (US-01's own sourceUC), AC-02 to UC-02 (US-02's) — per the
    // ftr-021-req fixture's own AC table. Each phase's task must cite only its own phase's AC or
    // wb-skeleton-check's ac_wrong_us structural check (AC-scope sourceUC fix) correctly rejects it.
    const phaseId = taskId.split('-TASK-')[0];
    const ac = phaseId === 'US-01' ? 'AC-01' : 'AC-02';
    return { exitCode: 0, result: { is_error: false, usage: { input_tokens: 10, output_tokens: 5 },
      structured_output: { context: `${phaseId} context.`, tasks: {
        [taskId]: { title: `${taskId} title`, outcome: 'o', domain: 'BE', agentType: 'developer-backend',
          dependsOn: [], acceptanceCriteria: [ac], outputCount: 1, commit: { type: 'feat', subject: taskId.toLowerCase() } },
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

// Cost hardening. Measured against two real projects: a per-task call was carrying ~185 KB of
// host-supplied context (AC-matched component bodies + every task in the feature + a full
// AGENTS.md read), and per-phase calls — handed only Section 9 index rows — burned 36-43 turns
// going and reading the project's real source to recover designs the Tech-Spec already stated.
describe('prompt scoping — per-task and per-phase context is bounded by the host', () => {
  function splitFixtures() {
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-021-req'), path.join(f.dir, 'req'), { recursive: true });
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-024-spec'), path.join(f.dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'),
      '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n');
  }
  // One task NAMES src/example-be.js; both tasks cite AC-01+AC-02, so AC matching alone would
  // pull in BOTH component bodies.
  const twoPhaseWb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [
      { id: 'US-01', type: 'user-story', title: 'US-01 t', sourceUC: ['UC-01'], context: 'c1',
        commit: { type: 'feat', subject: 'us01' }, taskIds: ['US-01-TASK-BE-01'] },
      { id: 'US-02', type: 'user-story', title: 'US-02 t', sourceUC: ['UC-02'], context: 'c2',
        commit: { type: 'feat', subject: 'us02' }, taskIds: ['US-02-TASK-BE-01'] },
    ],
    tasks: {
      'US-01-TASK-BE-01': { title: 'Implement src/example-be.js', outcome: 'src/example-be.js exists',
        domain: 'BE', agentType: 'developer-backend', dependsOn: [], acceptanceCriteria: ['AC-01'],
        outputCount: 1, commit: { type: 'feat', subject: 'be' } },
      'US-02-TASK-BE-01': { title: 'Second task', outcome: 'something else entirely',
        domain: 'BE', agentType: 'developer-backend', dependsOn: [], acceptanceCriteria: ['AC-02'],
        outputCount: 1, commit: { type: 'feat', subject: 'be2' } },
    },
  };
  function capturingDispatch() {
    return jest.fn(async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-work-breakdown') {
        const phases = twoPhaseWb.phases.map(p => ({ id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC }));
        return { exitCode: 0, result: { is_error: false, structured_output: { schemaVersion: 3, feature: 'FTR-099', phases }, usage: { input_tokens: 10, output_tokens: 5 } } };
      }
      if (name === 'gaia-generate-work-breakdown-phase') {
        const phase = twoPhaseWb.phases.find(p => options.prompt.includes(`"id": "${p.id}"`));
        const tasks = {}; for (const id of phase.taskIds) tasks[id] = twoPhaseWb.tasks[id];
        return { exitCode: 0, result: { is_error: false, structured_output: { context: phase.context, tasks }, usage: { input_tokens: 10, output_tokens: 5 } } };
      }
      if (name === 'gaia-generate-work-breakdown-task') return success(taskDetailDoc(options.prompt.match(/"id":\s*"([^"]+)"/)[1]));
      return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [] }, usage: { input_tokens: 10, output_tokens: 5 } } };
    });
  }
  const taskCalls = d => d.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-work-breakdown-task');
  const phaseCalls = d => d.mock.calls.map(([o]) => o).filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-work-breakdown-phase');

  test("a per-task prompt carries every AC-matched component as an index row, but only the body of the component the task itself names", async () => {
    splitFixtures();
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const be = taskCalls(dispatch).find(o => o.prompt.includes('US-01-TASK-BE-01'));
    expect(be.prompt).toContain('src/example-be.js'); // index row + named component
    expect(be.prompt).toContain('doExampleWork'); // its body IS inlined
    expect(be.prompt).not.toContain('ExampleProps'); // a sibling component's body is NOT
  });

  test('a per-task prompt scopes the sibling list to its own phase and earlier ones, never later ones', async () => {
    splitFixtures();
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const first = taskCalls(dispatch).find(o => o.prompt.includes('"id": "US-01-TASK-BE-01"'));
    const second = taskCalls(dispatch).find(o => o.prompt.includes('"id": "US-02-TASK-BE-01"'));
    expect(first.prompt).not.toContain('US-02-TASK-BE-01'); // a later phase's task is invisible
    expect(second.prompt).toContain('US-01-TASK-BE-01'); // an earlier phase's task is visible
  });

  test('a per-phase prompt inlines the design bodies its own Acceptance Criteria cover, so the agent never has to go read the source', async () => {
    splitFixtures();
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const us01 = phaseCalls(dispatch).find(o => o.prompt.includes('"id": "US-01"'));
    expect(us01.prompt).toContain('doExampleWork'); // AC-01 -> example-be.js body, inlined up front
    expect(us01.prompt).not.toContain('ExampleProps'); // AC-02 belongs to US-02, not this phase
  });

  test("AGENTS.md's command sections are extracted and inlined; unrelated sections are not", async () => {
    splitFixtures();
    fs.writeFileSync(path.join(f.root, 'AGENTS.md'),
      '# Conventions\n\n## Build commands\n\nRun `npm run build-marker`.\n\n## Team history\n\nIrrelevant narrative-marker prose.\n');
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    const prompt = taskCalls(dispatch)[0].prompt;
    expect(prompt).toContain('build-marker');
    expect(prompt).not.toContain('narrative-marker');
  });

  test('every worker dispatch carries a runaway budget cap by default', async () => {
    splitFixtures();
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
    for (const call of dispatch.mock.calls.map(([o]) => o)) {
      expect(call.args).toContain('--max-budget-usd');
    }
  });

  test('an explicit budget of 0 disables the cap rather than being rejected', async () => {
    splitFixtures();
    const dispatch = capturingDispatch();
    await runWorkflow('pm-phase2', [f.feature], { ...f.options, workerMaxBudgetUsd: 0, dispatch });
    expect(dispatch.mock.calls.map(([o]) => o)[0].args).not.toContain('--max-budget-usd');
  });
});

test.each([true, false])('pm-phase2 runs real validator and blocks a negative semantic verdict: %s', async valid => {
  const wb = phase2Setup();
  const dispatch = jest.fn(phase2Dispatch(wb, { valid, findings: [] }));
  const promise = runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  if (valid) {
    const result = await promise;
    expect(result.gate2_payload.gate2_blocked).toBe(false);
    expect(result.total_tasks).toBe(Object.keys(wb.tasks).length);
    // FTR-025: wb-render.js is no longer called automatically — tasks_csv_path is still a
    // computed path (lib/workflow-artifacts.js), but the file itself is only ever produced via
    // the new assemble-docs.js, on demand.
    expect(fs.existsSync(result.tasks_csv_path)).toBe(false);
    expect(result.gate2_payload.renderer_result).toBeUndefined();
    // FTR-026: output moved from one loose {PREFIX}-AC-Task-Matrix.md file into a dedicated
    // coverage-matrix/ subfolder, as a JSON+MD pair.
    expect(result.gate2_payload.ac_task_matrix_json_path).toBe(`${f.dir}/coverage-matrix/index.json`);
    expect(result.gate2_payload.ac_task_matrix_md_path).toBe(`${f.dir}/coverage-matrix/index.md`);
    const matrixJson = JSON.parse(fs.readFileSync(result.gate2_payload.ac_task_matrix_json_path, 'utf8'));
    expect(matrixJson.acceptanceCriteria.some(ac => ac.id === 'AC-01')).toBe(true);
    const matrixContent = fs.readFileSync(result.gate2_payload.ac_task_matrix_md_path, 'utf8');
    expect(matrixContent).toContain('AC ↔ Task Traceability Matrix');
    expect(matrixContent).toContain('AC-01');
    expect(f.entries()[0].status).toBe('done');
  } else {
    await expect(promise).rejects.toThrow('semantic validation');
    expect(f.entries()[0].status).toBe('failed');
    expect(fs.existsSync(path.join(f.dir, 'FTR-099-Work-Breakdown.csv'))).toBe(false);
  }
});
// FTR-025: the FTR-020 phase-detail template (Source UC/Context/Tasks-in-phase/Depends-on-phases)
// was designed but never wired into pm-phase2.js's own real skeleton-to-detail-file write path —
// renderPhaseDetailBlock's round-trip unit tests (wbs-assembler.test.js) already cover the render
// function itself; this proves the real pm-phase2.js wiring computes Depends-on-phases correctly
// from a genuine CROSS-PHASE task dependency, which only the real two-phase skeleton flow exercises.
test('pm-phase2 writes each phase detail file with Source UC/Context/Tasks-in-phase/Depends-on-phases, including a real cross-phase dependency', async () => {
  phase2Setup();
  const wb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [
      { id: 'US-01', type: 'user-story', title: 'US-01 title', sourceUC: ['UC-01'], context: 'US-01 context.',
        commit: { type: 'feat', subject: 'us01' }, taskIds: ['US-01-TASK-BE-01'] },
      { id: 'US-02', type: 'user-story', title: 'US-02 title', sourceUC: ['UC-02'], context: 'US-02 context.',
        commit: { type: 'feat', subject: 'us02' }, taskIds: ['US-02-TASK-BE-01'] },
    ],
    tasks: {
      'US-01-TASK-BE-01': { title: 'First task', outcome: 'o1', domain: 'BE', agentType: 'developer-backend',
        dependsOn: [], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 8, tokens: 10000 },
        outputCount: 1, commit: { type: 'feat', subject: 'first' } },
      'US-02-TASK-BE-01': { title: 'Second task', outcome: 'o2', domain: 'BE', agentType: 'developer-backend',
        dependsOn: ['US-01-TASK-BE-01'], acceptanceCriteria: [], estimate: { agentMinutes: 8, tokens: 10000 },
        outputCount: 1, commit: { type: 'feat', subject: 'second' } },
    },
  };
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-work-breakdown') {
      const phases = wb.phases.map(p => ({ id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC }));
      return { exitCode: 0, result: { is_error: false, structured_output: { schemaVersion: 3, feature: wb.feature, phases }, usage: { input_tokens: 10, output_tokens: 5 } } };
    }
    if (name === 'gaia-generate-work-breakdown-phase') {
      const phaseId = options.prompt.match(/"id":\s*"([^"]+)"/)[1];
      const phase = wb.phases.find(p => p.id === phaseId);
      const tasks = {};
      for (const taskId of phase.taskIds) tasks[taskId] = wb.tasks[taskId];
      return { exitCode: 0, result: { is_error: false, structured_output: { context: phase.context, tasks }, usage: { input_tokens: 10, output_tokens: 5 } } };
    }
    if (name === 'gaia-generate-work-breakdown-task') {
      const taskId = options.prompt.match(/"id":\s*"([^"]+)"/)[1];
      return success(taskDetailDoc(taskId));
    }
    return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [] }, usage: { input_tokens: 10, output_tokens: 5 } } };
  };
  await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  const us01 = fs.readFileSync(path.join(f.dir, 'wbs', 'user-stories', 'US-01.md'), 'utf8');
  expect(us01).toContain('- **Source UC:** UC-01');
  expect(us01).toContain('**Context:**\n\nUS-01 context.');
  expect(us01).toContain('- `US-01-TASK-BE-01` — First task');
  expect(us01).toContain('**Depends on phases:** none');
  const us02 = fs.readFileSync(path.join(f.dir, 'wbs', 'user-stories', 'US-02.md'), 'utf8');
  expect(us02).toContain('- `US-02-TASK-BE-01` — Second task');
  expect(us02).toContain('**Depends on phases:** US-01');
});
function docsDigestFor(requirementsText, techSpecText) {
  return 'sha256:' + require('crypto').createHash('sha256').update(requirementsText + '\u0000' + techSpecText, 'utf8').digest('hex');
}
test('pm-phase2 proceeds when Approvals.md has no Docs Digest line (pre-existing approval, not enforced)', async () => {
  const wb = phase2Setup(); // phase2Setup's own Approvals.md fixture has no Docs Digest line
  const dispatch = jest.fn(phase2Dispatch(wb));
  const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  expect(result.gate2_payload.gate2_blocked).toBe(false);
});
test('pm-phase2 proceeds when the recorded Docs Digest matches current Requirements/Tech-Spec content', async () => {
  const wb = phase2Setup();
  const requirementsText = fs.readFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), 'utf8');
  const techSpecText = fs.readFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), 'utf8');
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'),
    `## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n\n**Docs Digest:** \`${docsDigestFor(requirementsText, techSpecText)}\`\n`);
  const dispatch = jest.fn(phase2Dispatch(wb));
  const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  expect(result.gate2_payload.gate2_blocked).toBe(false);
});
test('pm-phase2 fails closed when the recorded Docs Digest no longer matches Requirements/Tech-Spec (stale approval)', async () => {
  phase2Setup();
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'),
    '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n\n**Docs Digest:** `sha256:' + '0'.repeat(64) + '`\n');
  const dispatch = jest.fn();
  await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).rejects.toThrow('Gate 1 approval is stale');
  expect(dispatch).not.toHaveBeenCalled();
  expect(f.entries()[0].status).toBe('failed');
});
// FTR-026: pm-phase2.js is split-source-native — every call site reads req/index.md/spec/index.md
// directly; in-memory assembly feeds only the Gate 1 digest re-check and is never written to disk
// (the bridge-requirements-tech-spec activity FTR-025 added as a transitional shim is gone).
test('pm-phase2 reads real req/+spec/ split sources directly, without ever writing an assembled file', async () => {
  const { loadRequirements } = require('../../src/claude/scripts/req-assembler');
  const { loadTechSpec } = require('../../src/claude/scripts/tech-spec-assembler');
  fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-021-req'), path.join(f.dir, 'req'), { recursive: true });
  fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-024-spec'), path.join(f.dir, 'spec'), { recursive: true });
  const assembledReq = loadRequirements(path.join(f.dir, 'req'));
  const assembledSpec = loadTechSpec(path.join(f.dir, 'spec'));
  const digest = docsDigestFor(assembledReq, assembledSpec);
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'),
    `## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n\n**Docs Digest:** \`${digest}\`\n`);
  const wb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [{ id: 'US-01', type: 'user-story', title: 'US-01', sourceUC: ['UC-01'], context: 'Context.',
      commit: { type: 'feat', subject: 'us01' }, taskIds: ['US-01-TASK-BE-01'] }],
    tasks: { 'US-01-TASK-BE-01': {
      title: 'Example task', outcome: 'Example outcome', domain: 'BE', agentType: 'developer-backend',
      dependsOn: [], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 8, tokens: 10000 },
      outputCount: 1, commit: { type: 'feat', subject: 'example' },
    } },
  };
  // Captures the semantic validator's own prompt to confirm it receives the split req/index.md
  // path, not an assembled/legacy file path (US-02's own repointing).
  let semanticPrompt;
  const innerDispatch = phase2Dispatch(wb);
  const dispatch = jest.fn(async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-validate-work-breakdown-semantic') semanticPrompt = options.prompt;
    return innerDispatch(options);
  });
  const result = await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  expect(result.gate2_payload.gate2_blocked).toBe(false);
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-Requirements.md'))).toBe(false);
  expect(fs.existsSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'))).toBe(false);
  expect(semanticPrompt).toContain(`${f.dir}/req/index.md`);
  expect(semanticPrompt).not.toContain('FTR-099-Requirements.md');
  const matrixJson = JSON.parse(fs.readFileSync(path.join(f.dir, 'coverage-matrix', 'index.json'), 'utf8'));
  expect(matrixJson.acceptanceCriteria.some(ac => ac.id === 'AC-01')).toBe(true);
});
// FTR-026 (UC-04): the per-task worker no longer receives the entire assembled Tech-Spec — only
// the component(s) whose Addresses column cites that task's own acceptanceCriteria, or the full
// Components table as a fallback when nothing matches.
test('pm-phase2 gives each per-task worker only its own AC-matched Tech-Spec component, with a full-table fallback', async () => {
  fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-021-req'), path.join(f.dir, 'req'), { recursive: true });
  fs.cpSync(path.join(__dirname, '..', 'fixtures', 'ftr-024-spec'), path.join(f.dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Approvals.md'), '## Gate 1 — Document Approvals\n\n| Status |\n|---|\n| ✅ Approved |\n');
  const wb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [{ id: 'US-01', type: 'user-story', title: 'US-01', sourceUC: ['UC-01', 'UC-02'], context: 'Context.',
      commit: { type: 'feat', subject: 'us01' }, taskIds: ['US-01-TASK-BE-01', 'US-01-TASK-BE-02'] }],
    tasks: {
      'US-01-TASK-BE-01': { title: 'Matched task', outcome: 'o1', domain: 'BE', agentType: 'developer-backend',
        dependsOn: [], acceptanceCriteria: ['AC-01'], estimate: { agentMinutes: 8, tokens: 10000 },
        outputCount: 1, commit: { type: 'feat', subject: 'matched' } },
      'US-01-TASK-BE-02': { title: 'Unmatched task', outcome: 'o2', domain: 'BE', agentType: 'developer-backend',
        dependsOn: [], acceptanceCriteria: [], estimate: { agentMinutes: 8, tokens: 10000 },
        outputCount: 1, commit: { type: 'feat', subject: 'unmatched' } },
    },
  };
  const taskPrompts = {};
  const dispatch = async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-work-breakdown') {
      const phases = wb.phases.map(p => ({ id: p.id, type: p.type, title: p.title, commit: p.commit, sourceUC: p.sourceUC }));
      return { exitCode: 0, result: { is_error: false, structured_output: { schemaVersion: 3, feature: wb.feature, phases }, usage: { input_tokens: 10, output_tokens: 5 } } };
    }
    if (name === 'gaia-generate-work-breakdown-phase') {
      const phaseId = options.prompt.match(/"id":\s*"([^"]+)"/)[1];
      const phase = wb.phases.find(p => p.id === phaseId);
      const tasks = {};
      for (const taskId of phase.taskIds) tasks[taskId] = wb.tasks[taskId];
      return { exitCode: 0, result: { is_error: false, structured_output: { context: phase.context, tasks }, usage: { input_tokens: 10, output_tokens: 5 } } };
    }
    if (name === 'gaia-generate-work-breakdown-task') {
      const taskId = options.prompt.match(/"id":\s*"([^"]+)"/)[1];
      taskPrompts[taskId] = options.prompt;
      return success(taskDetailDoc(taskId));
    }
    return { exitCode: 0, result: { is_error: false, structured_output: { valid: true, findings: [] }, usage: { input_tokens: 10, output_tokens: 5 } } };
  };
  await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  expect(taskPrompts['US-01-TASK-BE-01']).toContain('src/example-be.js');
  expect(taskPrompts['US-01-TASK-BE-01']).not.toContain('example-fe.tsx');
  expect(taskPrompts['US-01-TASK-BE-01']).not.toContain('deploy.yml');
  expect(taskPrompts['US-01-TASK-BE-02']).toContain("full Components table below");
  expect(taskPrompts['US-01-TASK-BE-02']).toContain('src/example-be.js');
  // Regression: the task-detail template used to be a Read the agent performed itself — a path
  // outside the project for a globally-installed toolkit, silently denied under a headless
  // `--print` worker with no TTY to answer a permission prompt. Now inlined by the host instead.
  expect(taskPrompts['US-01-TASK-BE-01']).toContain('Template (tasks/{TASK_ID}.md):');
  expect(taskPrompts['US-01-TASK-BE-01']).toContain('TASK DETAIL TEMPLATE');
  expect(taskPrompts['US-01-TASK-BE-02']).toContain('src/example-fe.tsx');
});
test('pm-phase2 does not write Requirements/Tech-Spec files for a legacy feature either (monolithic files only, no req/spec/)', async () => {
  const wb = phase2Setup(); // writes FTR-099-Requirements.md/FTR-099-Tech-Spec.md directly, no req/spec/ dirs
  const before = {
    req: fs.readFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), 'utf8'),
    spec: fs.readFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), 'utf8'),
  };
  await runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch: jest.fn(phase2Dispatch(wb)) });
  expect(fs.readFileSync(path.join(f.dir, 'FTR-099-Requirements.md'), 'utf8')).toBe(before.req);
  expect(fs.readFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), 'utf8')).toBe(before.spec);
});
test('malformed WB fails deterministic validation before semantic dispatch', async () => {
  // FTR-020: the skeleton call is schema-validated by worker() itself — a response that isn't
  // even schema-shaped JSON (e.g. plain text) now fails CLOSED one layer earlier than this
  // test originally assumed, at worker() itself, never reaching wb-validate.js at all. To
  // still exercise "a structurally bad WB is rejected before semantic dispatch" as intended,
  // use a skeleton that IS schema-valid JSON but graph-invalid (a task depending on a
  // nonexistent task ID) — caught by the new structural pre-check (wb-skeleton-check,
  // UC-02) before any per-task or semantic call is ever dispatched.
  // FTR-033: the structural pre-check now runs only after BOTH tiers complete (phase enumeration
  // + this one phase's own task-generation call) — 2 dispatches for a single-phase WB, not 1 —
  // since the broken task graph only exists once a phase's own tasks are generated.
  phase2Setup();
  const brokenWb = {
    schemaVersion: 3, feature: 'FTR-099',
    phases: [{ id: 'INFRA', type: 'infrastructure', title: 'Infrastructure', sourceUC: [], context: 'Shared infra setup.',
      commit: { type: 'feat', subject: 'infra' }, taskIds: ['INFRA-TASK-BE-01'] }],
    tasks: { 'INFRA-TASK-BE-01': {
      title: 'Example task', outcome: 'Example outcome', domain: 'BE', agentType: 'developer-backend',
      dependsOn: ['NONEXISTENT-TASK'], acceptanceCriteria: [], estimate: { agentMinutes: 8, tokens: 10000 },
      outputCount: 1, commit: { type: 'feat', subject: 'example' },
    } },
  };
  const dispatch = jest.fn(phase2Dispatch(brokenWb));
  await expect(runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch })).rejects.toThrow();
  expect(dispatch).toHaveBeenCalledTimes(2); // enumeration + one phase's task generation — pre-check rejects before any per-task/semantic call
  expect(f.entries()[0].status).toBe('failed');
  expect(f.entries().find(e => e.agent.includes(':wb-skeleton-check:')).status).toBe('failed');
});
test('workflow CLI executes am-phase2 with real files and no LLM process', () => {
  const { spawnSync } = require('child_process');
  const dir = path.join(f.root, 'docs/assessments/ASSESS-099'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ASSESS-099-Interventions-Index.md'), '| ID | Criticality |\n|---|---|\n| INT-001 | LOW |\n');
  const result = spawnSync(process.execPath, [path.join(__dirname, '../../bin/cli.js'), 'workflow', 'run', 'am-phase2', '--project', f.root, '--home', f.home,
    '--', '--prefix', 'ASSESS-099', '--ack', 'I reviewed these findings', '--flagged', 'INT-001'], { encoding: 'utf8', shell: false });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).flagged_count).toBe(1);
});

test.each([
  { exitCode: 0, result: { is_error: true, result: 'failure' } },
  { exitCode: 0, parseError: 'malformed stdout' },
  { exitCode: null, timedOut: true },
])('worker protocol failure cannot create a done owner: %j', async response => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => response })).rejects.toThrow('Worker failed');
  expect(f.entries()[0].status).toBe('failed');
});
test('a missing Claude executable fails the real subprocess adapter and the owner', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, claudePath: path.join(f.root, 'missing-claude.exe') })).rejects.toThrow('executable not found');
  expect(f.entries()[0].status).toBe('failed');
});
test('repeated negative document validation never reports Gate 1 ready', async () => {
  const dispatch = async options => {
    const response = await phase1Dispatch(options);
    if (options.args.includes('gaia-validate-feature-docs')) response.result.structured_output = { valid: false, findings: ['Requirements incomplete'], needsRequirementsFix: true, needsTechSpecFix: false, report: '# Result\n' };
    return response;
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch })).rejects.toThrow('gaps remain');
  expect(f.entries()[0].status).toBe('failed');
});

// FTR-023: Tech-Spec File Inventory "Addresses" column must cite only real Requirements AC IDs.
// FTR-024: the skeleton's Section 9 now carries Domain/Spec columns too (Addresses stays 3rd,
// the position tech-spec-graph-checks.js's unmodified parser reads) — a valid Spec link is
// required here because the clean case below must dispatch the per-component agent to pass.
const techSpecDocWithFileInventory = addresses => Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  if (n === 9) return `## 9. File Inventory\n\n### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n| a.js | x | ${addresses} | BE | [components/a.js.md](components/a.js.md) |\n\n### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n`;
  return `## ${n}. Section ${n}\n`;
}).join('\n');

test('pm-phase1 rejects a Tech-Spec with a dangling Addresses reference before semantic validation', async () => {
  // FTR-024: tech-spec-ac-check now runs against the skeleton strictly before per-component
  // generation starts (not just before semantic validation) — a structurally broken skeleton
  // must reject before a single per-component token is spent, not just before validation.
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecDocWithFileInventory('AC-99'));
    if (options.args.includes('gaia-generate-tech-spec-component')) throw new Error('must not be dispatched — tech-spec-ac-check should reject first');
    if (options.args.includes('gaia-validate-feature-docs')) throw new Error('must not be dispatched — tech-spec-ac-check should reject first');
    return phase1Dispatch(options);
  };
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
    .rejects.toThrow(/dangling AC references/);
  expect(f.entries()[0].status).toBe('failed');
});

test('pm-phase1 proceeds unchanged for a clean (dash-only) Tech-Spec', async () => {
  // FTR-028: a dash-only component (addressing no AC) is only "clean" if Requirements also has no
  // AC left unaddressed — pair the dash with an empty AC table so the new deterministic
  // AC<->component traceability check (computeAcComponentTraceabilityGaps) has nothing to flag;
  // this test's own intent (dash is accepted by the pre-existing dangling-reference check, not
  // rejected like "AC-99") is otherwise unaffected.
  const requirementsNoAcDoc = () => Array.from({ length: 9 }, (_, i) => {
    const n = i + 1;
    if (n === 2) return `## 2. Use Cases\n\n${USE_CASE_TABLE}`;
    if (n === 7) return '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n';
    return `## ${n}. Section ${n}\n`;
  }).join('\n');
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-requirements')) return success(requirementsNoAcDoc());
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecDocWithFileInventory('—'));
    return phase1Dispatch(options);
  };
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(result.validation.summary).toContain('0 gaps');
});

// FTR-028: gaia-validate-feature-docs's own prompt no longer grows with per-component design
// prose — only Section 9's skeleton (one row per component) is inlined for the Tech-Spec side.
describe('FTR-028 — validator prompt uses the Tech-Spec skeleton only', () => {
  function sentinelFixture() {
    const componentsTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
      '| a.js | example | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n\n' +
      '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
    const skeletonDoc = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${componentsTable}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
    const componentDetail = '# a.js — New\n\n## Change\n\nSENTINEL_COMPONENT_BODY_TEXT\n\n## Algorithm\n\nSENTINEL_COMPONENT_BODY_TEXT\n\n## Tests\n\nExample tests.\n';
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(skeletonDoc);
      if (name === 'gaia-generate-tech-spec-component') return success(componentDetail);
      return phase1Dispatch(options);
    };
    return { dispatch };
  }
  function findValidatorCall(dispatchFn) {
    return dispatchFn.mock.calls.map(([o]) => o)
      .find(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-validate-feature-docs');
  }

  test('the main validator dispatch prompt contains no per-component Change/Algorithm/Tests prose', async () => {
    const { dispatch } = sentinelFixture();
    const dispatchFn = jest.fn(dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const validatorCall = findValidatorCall(dispatchFn);
    expect(validatorCall.prompt).not.toContain('SENTINEL_COMPONENT_BODY_TEXT');
    expect(validatorCall.prompt).toContain('## 9. File Inventory'); // skeleton's own section still present
  });

  test('Requirements text passed to the validator is unchanged (full UC detail still inlined)', async () => {
    const { dispatch } = sentinelFixture();
    const dispatchFn = jest.fn(dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    const validatorCall = findValidatorCall(dispatchFn);
    expect(validatorCall.prompt).toContain('Main flow'); // useCaseDetailDoc()'s own flow text — only the Tech-Spec side was reduced
  });
});

// FTR-028/UC-02: AC<->component traceability is checked deterministically (host-only, zero LLM
// cost) and merged into the result BEFORE the contradiction guard — a model saying valid:true can
// still be overridden by a real structural gap it was never shown.
describe('FTR-028 — deterministic AC<->component traceability (UC-02)', () => {
  const requirementsTwoAcDoc = () => Array.from({ length: 9 }, (_, i) => {
    const n = i + 1;
    if (n === 2) return `## 2. Use Cases\n\n${USE_CASE_TABLE}`;
    if (n === 7) return '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n| AC-01 | placeholder | All UCs |\n| AC-02 | orphan | All UCs |\n';
    return `## ${n}. Section ${n}\n`;
  }).join('\n');
  function cleanValidateResponse() {
    const response = success('# Result\n');
    response.result.structured_output = { valid: true, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
    return response;
  }

  test('an AC addressed by zero components produces a finding and forces needsTechSpecFix despite a clean LLM pass', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements') return success(requirementsTwoAcDoc()); // AC-01 + AC-02, only AC-01 addressed
      if (name === 'gaia-validate-feature-docs') return cleanValidateResponse(); // LLM never sees this gap — it's purely ID-based
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })).rejects.toThrow('gaps remain after 3 cycles');
    const report = fs.readFileSync(path.join(f.dir, 'FTR-099-Validation-Report.md'), 'utf8');
    expect(report).toContain('AC-02 is not addressed by any Tech-Spec component');
    const validateCalls = dispatchFn.mock.calls.filter(([o]) => o.args[o.args.indexOf('--agent') + 1] === 'gaia-validate-feature-docs');
    expect(validateCalls.length).toBe(3); // every cycle re-dispatched despite the LLM's own valid:true each time
  });

  // FTR-030: a real incident — an AC describing a negative/process constraint (e.g. "no files
  // under _old/ were modified", verified via git diff, never a dedicated component) is a
  // permanent false-positive orphan finding under the original check, since no component SHOULD
  // ever address it. The Tech-Spec's own Section 12 (Risks & Mitigations) is where such
  // constraints are already documented, by literal AC-ID — this must be recognized as addressed.
  test('an AC documented by ID in Section 12 (Risks & Mitigations) is not a false-positive orphan', async () => {
    const techSpecWithRisksMention = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      if (n === 9) return '## 9. File Inventory\n\n### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n| a.js | x | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n\n### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
      if (n === 12) return '## 12. Risks & Mitigations\n\n| Risk | Impact | Mitigation |\n|---|---|---|\n| _old/ directory integrity | High — AC-02 requires no modification to `_old/` files | git diff _old/ must be empty |\n';
      return `## ${n}. Section ${n}\n`;
    }).join('\n');
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements') return success(requirementsTwoAcDoc()); // AC-01 + AC-02, only AC-01 addressed by a component
      if (name === 'gaia-generate-tech-spec') return success(techSpecWithRisksMention);
      if (name === 'gaia-validate-feature-docs') return cleanValidateResponse();
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(result.validation.summary).toContain('clean');
    const report = fs.readFileSync(path.join(f.dir, 'FTR-099-Validation-Report.md'), 'utf8');
    expect(report).not.toContain('AC-02 is not addressed');
  });

  // "A component referencing a nonexistent AC-ID" (the other direction of the same traceability
  // check) is NOT exercised end to end here: a Tech-Spec with a genuinely dangling AC reference is
  // already hard-rejected earlier, at generation time, by the pre-existing tech-spec-ac-check
  // (FTR-023) — reaching the validation step with that condition true is not a realistic pipeline
  // state. See tests/pm-phase1-ac-traceability.test.js for a direct, deterministic unit test of
  // that direction against the real (mirrored) computeAcComponentTraceabilityGaps() logic.

  test('no traceability gaps + a genuinely clean LLM pass stays valid, with no additional-findings section', async () => {
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(phase1Dispatch) });
    expect(result.validation.summary).toContain('clean');
    const report = fs.readFileSync(path.join(f.dir, 'FTR-099-Validation-Report.md'), 'utf8');
    expect(report).not.toContain('## Additional findings');
  });
});

// FTR-028/UC-03: claims the skeleton-only pass can't verify are drilled into narrowly — only the
// specific named component file(s), batched, never the whole Tech-Spec.
describe('FTR-028 — component-detail drill-down (UC-03)', () => {
  function validateResponseWithComponentDetail(entries, valid = false) {
    const response = success('# Result\n');
    response.result.structured_output = { valid, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n', needsComponentDetail: entries };
    return response;
  }
  function drillDownResponse(findings) {
    const response = success('# Result\n');
    response.result.structured_output = { findings };
    return response;
  }
  function findDrillDownCalls(dispatchFn) {
    return dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-validate-tech-spec-component-detail');
  }

  test('a needsComponentDetail entry naming a real fileSlug dispatches a drill-down call reading only that file', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-validate-feature-docs') return validateResponseWithComponentDetail([{ claim: 'endpoint returns 401 on expired token', fileSlug: 'a.js.md' }]);
      if (name === 'gaia-validate-tech-spec-component-detail') return drillDownResponse([]); // confirmed
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    expect(result.validation.summary).toContain('clean');
    const drillDownCalls = findDrillDownCalls(dispatchFn);
    expect(drillDownCalls).toHaveLength(1);
    expect(drillDownCalls[0].prompt).toContain('a.js.md');
    expect(drillDownCalls[0].prompt).toContain('endpoint returns 401 on expired token');
  });

  test('a needsComponentDetail entry naming a nonexistent fileSlug is dropped and reported, never dispatched', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-validate-feature-docs') return validateResponseWithComponentDetail([{ claim: 'some claim', fileSlug: 'DoesNotExist.cs.md' }]);
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })).rejects.toThrow('gaps remain after 3 cycles');
    expect(findDrillDownCalls(dispatchFn)).toHaveLength(0);
    const report = fs.readFileSync(path.join(f.dir, 'FTR-099-Validation-Report.md'), 'utf8');
    expect(report).toContain('component-detail check referenced a non-existent file "DoesNotExist.cs.md"');
  });

  test('an unsatisfied drill-down claim forces needsTechSpecFix even when the main pass has no other findings', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-validate-feature-docs') return validateResponseWithComponentDetail([{ claim: 'endpoint returns 401 on expired token', fileSlug: 'a.js.md' }]);
      if (name === 'gaia-validate-tech-spec-component-detail') return drillDownResponse(['Tech-Spec: a.js.md does not document a 401 response for an expired token']);
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn })).rejects.toThrow('gaps remain after 3 cycles');
    const report = fs.readFileSync(path.join(f.dir, 'FTR-099-Validation-Report.md'), 'utf8');
    expect(report).toContain('does not document a 401 response');
  });

  test('two needsComponentDetail entries naming the same fileSlug collapse into one batch slot', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-validate-feature-docs') return validateResponseWithComponentDetail([
        { claim: 'claim A', fileSlug: 'a.js.md' },
        { claim: 'claim B', fileSlug: 'a.js.md' },
      ]);
      if (name === 'gaia-validate-tech-spec-component-detail') return drillDownResponse([]);
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    expect(result.validation.summary).toContain('clean');
    const drillDownCalls = findDrillDownCalls(dispatchFn);
    expect(drillDownCalls).toHaveLength(1);
    expect(drillDownCalls[0].prompt).toContain('claim A');
    expect(drillDownCalls[0].prompt).toContain('claim B');
  });

  test('more unique flagged components than the batch size produce multiple bounded drill-down calls', async () => {
    const COMPONENT_COUNT = 11; // DRILL_DOWN_BATCH_SIZE (8) + 3 -> ceil(11/8) = 2 batches
    const rows = Array.from({ length: COMPONENT_COUNT }, (_, i) =>
      `| c${i + 1}.js | example | AC-01 | BE | [components/c${i + 1}.js.md](components/c${i + 1}.js.md) |`).join('\n');
    const manyComponentsTable = `### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n${rows}\n\n` +
      '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
    const manySkeletonDoc = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${manyComponentsTable}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
    const entries = Array.from({ length: COMPONENT_COUNT }, (_, i) => ({ claim: `claim ${i + 1}`, fileSlug: `c${i + 1}.js.md` }));
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(manySkeletonDoc);
      if (name === 'gaia-generate-tech-spec-component') {
        const match = options.prompt.match(/Path: (c\d+\.js)/);
        return success(`# ${match[1]} — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\nExample body.\n\n## Tests\n\nExample tests.\n`);
      }
      if (name === 'gaia-validate-feature-docs') return validateResponseWithComponentDetail(entries);
      if (name === 'gaia-validate-tech-spec-component-detail') return drillDownResponse([]);
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    expect(result.validation.summary).toContain('clean');
    const drillDownCalls = findDrillDownCalls(dispatchFn);
    expect(drillDownCalls).toHaveLength(2);
    for (const call of drillDownCalls) {
      const occurrences = (call.prompt.match(/Component file:/g) || []).length;
      expect(occurrences).toBeLessThanOrEqual(8);
    }
  });

  test('no needsComponentDetail entries dispatch zero drill-down calls (common-case cost)', async () => {
    const dispatchFn = jest.fn(phase1Dispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });
    expect(findDrillDownCalls(dispatchFn)).toHaveLength(0);
  });
});

describe('FTR-028 — docsDigest unaffected', () => {
  test('docsDigest still hashes the full assembled Requirements + Tech-Spec regardless of drill-down activity', async () => {
    const { loadRequirements } = require('../../src/claude/scripts/req-assembler');
    const { loadTechSpec } = require('../../src/claude/scripts/tech-spec-assembler');
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-validate-feature-docs') {
        const response = success('# Result\n');
        response.result.structured_output = { valid: false, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n', needsComponentDetail: [{ claim: 'x', fileSlug: 'a.js.md' }] };
        return response;
      }
      if (name === 'gaia-validate-tech-spec-component-detail') {
        const response = success('# Result\n');
        response.result.structured_output = { findings: [] };
        return response;
      }
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    const reqText = loadRequirements(path.join(f.dir, 'req'));
    const specText = loadTechSpec(path.join(f.dir, 'spec'));
    expect(result.docs_digest).toBe(docsDigestFor(reqText, specText));
  });
});

describe('FTR-029 — validator schema no longer requires needsRequirementsFix/needsTechSpecFix', () => {
  test('a clean validator response omitting both fields still reaches Gate 1', async () => {
    const dispatch = async options => {
      if (options.args.includes('gaia-validate-feature-docs')) {
        const r = success('# Result\n');
        r.result.structured_output = { valid: true, findings: [], report: '# Result\n' }; // no needsRequirementsFix/needsTechSpecFix at all
        return r;
      }
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(result.validation.summary).toContain('clean');
  });

  test('a response that DOES include both fields with the correct type is still validated when present', async () => {
    const dispatch = async options => {
      if (options.args.includes('gaia-validate-feature-docs')) {
        const r = success('# Result\n');
        r.result.structured_output = { valid: true, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
        return r;
      }
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(result.validation.summary).toContain('clean');
  });
});

describe('FTR-029 — fail fast on an invalid per-item generation result (UC-04)', () => {
  test('an invalid component on the first attempt, valid on retry, is written and used — no error', async () => {
    let callCount = 0;
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec-component') {
        callCount++;
        return success(callCount === 1
          ? '# a.js — New\n\nNo Change heading here.\n' // invalid: missing "## Change"
          : techSpecComponentDetailDoc()); // valid on retry
      }
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(callCount).toBe(2);
    expect(fs.readFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), 'utf8')).toContain('## Change');
  });

  test('an invalid component on both attempts throws immediately, naming it, before any later component dispatches', async () => {
    const twoComponentsTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n'
      + '| a.js | example a | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n'
      + '| b.js | example b | AC-01 | BE | [components/b.js.md](components/b.js.md) |\n\n'
      + '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
    const twoComponentSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${twoComponentsTable}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(twoComponentSkeletonDoc);
      if (name === 'gaia-generate-tech-spec-component') {
        if (options.prompt.includes('Path: a.js')) return success('# a.js — New\n\nAlways invalid.\n');
        return success(techSpecComponentDetailDoc());
      }
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn }))
      .rejects.toThrow(/a\.js.*failed structural validation after 2 attempts/);
    // b.js must never have been dispatched — the loop stopped at a.js, the item that failed
    expect(dispatchFn.mock.calls.filter(([o]) => o.prompt?.includes('Path: b.js')).length).toBe(0);
  });

  test('an invalid use case on both attempts throws immediately, naming it', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements-use-case') return success('### UC-02: Wrong use case\n\nAlways invalid.\n');
      return phase1Dispatch(options);
    };
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
      .rejects.toThrow(/UC-01.*failed structural validation after 2 attempts/);
  });
});

// FTR-030: a real incident — hand-editing 2 of ~58 Tech-Spec skeleton rows (to add a missing AC
// reference) triggered a full skeleton regeneration, which forced ALL ~88 already-valid components
// to redispatch, since the per-component resume check was a blanket switch keyed only on "was the
// skeleton regenerated at all", never on whether a given row actually changed.
describe('FTR-030 — a naturally-triggered skeleton regen only redispatches components whose row changed', () => {
  function threeComponentsTable(aPurpose) {
    return '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n' +
      `| a.js | ${aPurpose} | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n` +
      '| b.js | example b | AC-01 | BE | [components/b.js.md](components/b.js.md) |\n' +
      '| c.js | example c | AC-01 | BE | [components/c.js.md](components/c.js.md) |\n\n' +
      '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
  }
  function threeComponentSkeletonDoc(aPurpose) {
    return Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${threeComponentsTable(aPurpose)}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
  }
  const componentDetail = name => `# ${name} — New\n\n## Change\n\nExample change.\n\n## Algorithm\n\n${name} body.\n\n## Tests\n\nExample tests.\n`;

  test('only the component whose row actually changed is redispatched; unchanged rows are skipped', async () => {
    const firstDispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(threeComponentSkeletonDoc('example a'));
      if (name === 'gaia-generate-tech-spec-component') {
        const match = options.prompt.match(/Path: (\w+\.js)/);
        return success(componentDetail(match[1]));
      }
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(firstDispatch) });

    // Trigger a NATURAL (not forced) skeleton regen: bump feature.md's own mtime, the same
    // signal skeletonStale's own freshness check uses — never --force, matching the real
    // incident exactly (confirmed with the reporting session: no --force was ever used). Just
    // "now" (not an artificial future offset) — it only needs to be newer than the first run's
    // own artifacts, and an offset into the future risks the SECOND run's real-time Validation-
    // Report write (finishing well under a second later) still looking "older" by comparison.
    const featurePath = f.feature;
    const now = new Date();
    fs.utimesSync(featurePath, now, now);

    const secondDispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(threeComponentSkeletonDoc('example a v2')); // only a.js's row changed
      if (name === 'gaia-generate-tech-spec-component') {
        const match = options.prompt.match(/Path: (\w+\.js)/);
        return success(componentDetail(match[1] + '-v2'));
      }
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(secondDispatch);
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn });

    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    expect(calledAgents).toContain('gaia-generate-tech-spec'); // the skeleton itself WAS regenerated
    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component');
    expect(componentCalls).toHaveLength(1); // only a.js, whose row changed — b.js/c.js skipped
    expect(componentCalls[0].prompt).toContain('Path: a.js');
  });

  test('an explicit --force cycle still regenerates every component, even one whose row is unchanged', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(threeComponentSkeletonDoc('example a'));
      if (name === 'gaia-generate-tech-spec-component') {
        const match = options.prompt.match(/Path: (\w+\.js)/);
        return success(componentDetail(match[1]));
      }
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: jest.fn(dispatch) });

    const dispatchFn = jest.fn(dispatch); // identical skeleton content — every row UNCHANGED
    await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch: dispatchFn });

    const componentCalls = dispatchFn.mock.calls.map(([o]) => o)
      .filter(o => o.args[o.args.indexOf('--agent') + 1] === 'gaia-generate-tech-spec-component');
    expect(componentCalls).toHaveLength(3); // --force bypasses row-diffing entirely, by design
  });
});
