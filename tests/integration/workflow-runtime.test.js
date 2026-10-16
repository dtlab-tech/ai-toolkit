'use strict';
const fs = require('fs');
const path = require('path');
const { runWorkflow } = require('../../lib/workflow-runner');
const { fixture } = require('../helpers/workflow-fixture');
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
    .rejects.toThrow('Worker returned no structured output: gaia.agent.planner.validate-feature-docs; expected fields: valid, findings, needsRequirementsFix, needsTechSpecFix, report');
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
      expect(schema.required).toEqual(['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']);
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
  } })).rejects.toThrow('Worker returned no structured output: gaia.agent.planner.validate-feature-docs; expected fields: valid, findings, needsRequirementsFix, needsTechSpecFix, report');
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

test('a previously truncated Tech-Spec left on disk from an earlier failed run is regenerated, not mistaken for fresh', async () => {
  // FTR-024: resume-by-existence now keys off spec/index.md and the component files, never off
  // the assembled FTR-099-Tech-Spec.md — step 4 of generateTechSpec rebuilds and overwrites that
  // file unconditionally on every run. So a half-written final file left on disk from an earlier
  // crashed run (newer than feature.md/Requirements.md, so a naive mtime check alone would
  // accept it) can never be "resumed from": the next run never re-dispatches either agent (the
  // real skeleton/components on disk are still fresh and complete), yet still overwrites the
  // corrupted leftover with a correct, complete reassembly before validation ever sees it.
  const dispatch = jest.fn(phase1Dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  fs.writeFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), '## 1. Overview\n\n## 2. Architecture\n');
  dispatch.mockClear();
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1])).not.toContain('gaia-generate-tech-spec');
  expect(result.validation.summary).toContain('clean');
  const finalContent = fs.readFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), 'utf8');
  expect(finalContent).not.toContain('## 1. Overview\n\n## 2. Architecture');
  for (let n = 1; n <= 12; n++) expect(finalContent).toMatch(new RegExp(`^## ${n}\\.\\s`, 'm'));
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
  // The outer gate that decides whether generateTechSpec runs at all is keyed on the
  // ASSEMBLED file('Tech-Spec')'s own freshness (pm-phase1.js line ~273) — deleting only the
  // component would never reach the per-component resume logic below, since the assembled doc
  // would still look fresh and the whole stage would be skipped. Removing it too simulates a
  // crash between "component b never got written" and "assembly never got re-run".
  fs.unlinkSync(path.join(f.dir, 'spec', 'components', 'b.js.md'));
  fs.unlinkSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'));
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
  const finalContent = fs.readFileSync(path.join(f.dir, 'FTR-099-Tech-Spec.md'), 'utf8');
  expect(finalContent).toContain('body-of-a');
  expect(finalContent).toContain('body-of-b');
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
test('fresh outputs skip workers; force requests them again', async () => {
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: phase1Dispatch });
  const dispatch = jest.fn(phase1Dispatch);
  await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(dispatch).not.toHaveBeenCalled();
  await runWorkflow('pm-phase1', [f.feature, '--force'], { ...f.options, dispatch });
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
function phase2Dispatch(wb, semanticVerdict = { valid: true, findings: [] }) {
  return async options => {
    const name = options.args[options.args.indexOf('--agent') + 1];
    if (name === 'gaia-generate-work-breakdown') {
      return { exitCode: 0, result: { is_error: false, structured_output: wb, usage: { input_tokens: 10, output_tokens: 5 } } };
    }
    if (name === 'gaia-generate-work-breakdown-task') return success(taskDetailDoc('INFRA-TASK-BE-01'));
    return { exitCode: 0, result: { is_error: false, structured_output: semanticVerdict, usage: { input_tokens: 10, output_tokens: 5 } } };
  };
}
test.each([true, false])('pm-phase2 runs real validator/renderer and blocks a negative semantic verdict: %s', async valid => {
  const wb = phase2Setup();
  const dispatch = jest.fn(phase2Dispatch(wb, { valid, findings: [] }));
  const promise = runWorkflow('pm-phase2', [f.feature], { ...f.options, dispatch });
  if (valid) {
    const result = await promise;
    expect(result.gate2_payload.gate2_blocked).toBe(false);
    expect(result.total_tasks).toBe(Object.keys(wb.tasks).length);
    expect(fs.readFileSync(result.tasks_csv_path, 'utf8')).toContain('phase_id|');
    expect(result.gate2_payload.ac_task_matrix_path).toBeDefined();
    const matrixContent = fs.readFileSync(result.gate2_payload.ac_task_matrix_path, 'utf8');
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
      return { exitCode: 0, result: { is_error: false, structured_output: wb, usage: { input_tokens: 10, output_tokens: 5 } } };
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
test('malformed WB fails deterministic validation before semantic dispatch', async () => {
  // FTR-020: the skeleton call is schema-validated by worker() itself — a response that isn't
  // even schema-shaped JSON (e.g. plain text) now fails CLOSED one layer earlier than this
  // test originally assumed, at worker() itself, never reaching wb-validate.js at all. To
  // still exercise "a structurally bad WB is rejected before semantic dispatch" as intended,
  // use a skeleton that IS schema-valid JSON but graph-invalid (a task depending on a
  // nonexistent task ID) — caught by the new structural pre-check (wb-skeleton-check,
  // UC-02) before any per-task or semantic call is ever dispatched.
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
  expect(dispatch).toHaveBeenCalledTimes(1); // skeleton only — pre-check rejects before any per-task/semantic call
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
  const dispatch = async options => {
    if (options.args.includes('gaia-generate-tech-spec')) return success(techSpecDocWithFileInventory('—'));
    return phase1Dispatch(options);
  };
  const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
  expect(result.validation.summary).toContain('0 gaps');
});
