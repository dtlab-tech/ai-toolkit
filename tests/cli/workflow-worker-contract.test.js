'use strict';
const fs = require('fs');
const path = require('path');
const { createControl } = require('../../lib/workflow-control');
const { runWorkflow } = require('../../lib/workflow-runner');
const { fixture } = require('../helpers/workflow-fixture');
const id = 'gaia.agent.planner.requirements';
let f;
beforeEach(() => { f = fixture(); });
afterEach(() => { f.clean(); });
const response = extra => ({ exitCode: 0, result: { is_error: false, result: 'Done',
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20, cache_creation_input_tokens: 7 }, ...extra } });
function evidence() {
  const run = fs.readdirSync(f.options.diagnosticsDir)[0];
  const dir = path.join(f.options.diagnosticsDir, run);
  return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8'));
}

test('pm-phase1 never marks a requirements worker done when its response is empty', async () => {
  await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: async () => response({ result: '' }) }))
    .rejects.toThrow(/no result/i);
  const worker = f.entries().find(e => e.agentId === id);
  expect(worker.status).toBe('failed');
  expect(worker.phase_delta_tokens).toBe(42);
  expect(evidence().outcome).toBe('failed');
});

test('permission denial is explicit even when the CLI claims success and keeps usage evidence', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response({ permission_denials: [
    { tool_name: 'Write', tool_input: { file_path: path.join(f.dir, 'report.md'), content: 'private document' } },
  ] }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('Worker permission denied');
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
  expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(42);
  expect(evidence().response.result.usage.cache_read_input_tokens).toBe(20);
  expect(evidence().response.result.permission_denials[0].tool_name).toBe('Write');
});

// Real production evidence, twice, on two different paths: the model occasionally constructs a
// path with a single leading backslash and no drive letter (e.g. `\AGENTS.md`, or
// `\src\shell\app\...`), which resolves outside the project directory on Windows and is correctly
// denied — but the agent recovers and still produces a complete, structurally valid result. The
// unconditional check used to throw that away anyway, wasting the whole call. A denial on a
// mutating tool (Write/Edit/Bash/...) is a different risk entirely — a near-miss on a real side
// effect, not a missed read — and must still fail immediately regardless of the rest of the
// response; the test above already covers that and is untouched by this change.
test('a Read-only denial does not fail the call when the result is otherwise valid', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response({ permission_denials: [
    { tool_name: 'Read', tool_input: { file_path: '\\src\\shell\\app\\src\\pages\\Settings\\Users\\UserDetailPage.test.tsx' } },
  ] }) });
  const result = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
  expect(result).toBeDefined();
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().response.result.permission_denials[0].tool_name).toBe('Read');
});

test('a Read-only denial mixed with a mutating-tool denial still fails the call', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response({ permission_denials: [
    { tool_name: 'Read', tool_input: { file_path: '\\AGENTS.md' } },
    { tool_name: 'Write', tool_input: { file_path: path.join(f.dir, 'report.md') } },
  ] }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('Worker permission denied');
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
});

test('a Read-only denial on an otherwise-invalid result still fails — downstream validity still decides', async () => {
  const c = createControl({ ...f.options, dispatch: async () => response({ result: '',
    permission_denials: [{ tool_name: 'Glob', tool_input: { pattern: '\\src\\**' } }] }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow(/no result/i);
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
});

test('a schema worker cannot complete with an empty report field', async () => {
  const dest = path.join(f.dir, 'report.md');
  const c = createControl({ ...f.options, dispatch: async () => response({
    structured_output: { valid: true, findings: [], report: '   ' },
  }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    outputs: [{ path: dest }], schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }))).rejects.toThrow(/content missing or empty/i);
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
  expect(fs.existsSync(dest)).toBe(false);
});

test('the host — never the agent — writes a declared output; evidence omits prompt and redacts credentials', async () => {
  const dest = path.join(f.dir, 'report.md');
  const c = createControl({ ...f.options, workerMaxBudgetUsd: 0.1, dispatch: async ({ args }) => {
    expect(args).toContain('--max-budget-usd');
    expect(args).not.toContain('--permission-mode');
    expect(args).not.toContain('--allowedTools');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(f.entries().find(e => e.agentId).status).toBe('running');
    expect(fs.existsSync(dest)).toBe(false); // the agent has no Write tool and cannot have created it
    return { ...response({ api_key: 'secret-example', result: 'Authorization: Bearer secret-bearer' }), stderr: 'token=secret-token' };
  } });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'PRIVATE PROMPT', {
    outputs: [{ path: dest }],
  }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(fs.readFileSync(dest, 'utf8')).toBe('Authorization: Bearer secret-bearer');
  const captured = evidence();
  expect(captured.outcome).toBe('done');
  expect(captured.invocation.cwd).toBe(f.root);
  expect(JSON.stringify(captured)).not.toMatch(/secret-example|secret-bearer|secret-token|PRIVATE PROMPT/);
});

test('a JSON output wrapped in conversational prose and a code fence is recovered verbatim as parseable JSON', async () => {
  const dest = path.join(f.dir, 'FTR-099-Work-Breakdown.json');
  const wrapped = 'Perfect. I have all the necessary information. Let me now generate the work breakdown JSON.\n\n'
    + 'Based on my analysis:\n\n```json\n{\n  "schemaVersion": 2,\n  "feature": "FTR-099",\n  "phases": []\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(JSON.parse(fs.readFileSync(dest, 'utf8'))).toEqual({ schemaVersion: 2, feature: 'FTR-099', phases: [] });
});

test('a JSON output with a raw (unescaped) newline inside a text field is repaired before being written', async () => {
  const dest = path.join(f.dir, 'FTR-099-Work-Breakdown.json');
  const rawDescription = 'First line\nSecond line';
  const wrapped = '```json\n{\n  "schemaVersion": 2,\n  "feature": "FTR-099",\n'
    + '  "phases": [{ "id": "US-01", "tasks": [{ "id": "T1", "description": "' + rawDescription + '" }] }]\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  const written = JSON.parse(fs.readFileSync(dest, 'utf8'));
  expect(written.phases[0].tasks[0].description).toBe(rawDescription);
});

test('a JSON output with no recoverable JSON document is written through unchanged for the downstream validator to reject', async () => {
  const dest = path.join(f.dir, 'FTR-099-Work-Breakdown.json');
  const c = createControl({ ...f.options, dispatch: async () => response({ result: 'I need more information before I can proceed.' }) });
  await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] }));
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(fs.readFileSync(dest, 'utf8')).toBe('I need more information before I can proceed.');
});

// Regression tests for a real production bug: a plain-text (non-schema) component-detail worker
// wrapped its entire deliverable in conversational prose + an outer ```markdown fence. Its own
// real "## Change"/"## Tests" headings landed inside that fence and were (correctly) treated as
// non-headings by tech-spec-assembler.js's fence-aware parser, so the written file's real content
// was unreachable — surfacing only much later, during final Tech-Spec assembly, as an opaque
// "component file is missing its ## Change section" error naming no file at all.
describe('extractMarkdownDocument (non-schema plain-text worker payload)', () => {
  test('a whole response wrapped in conversational prose + an outer fence is unwrapped to the real document', async () => {
    const wrapped = 'Perfect! Now I have enough context. Let me create the technical design.\n\n'
      + '```markdown\n# src/demo/app/src/locales/en.json — New\n\n## Change\n\nExample change text.\n\n'
      + '## Tests\n\nExample tests text.\n```';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toContain('# src/demo/app/src/locales/en.json — New');
    expect(detail).toContain('## Change');
    expect(detail).toContain('## Tests');
    expect(detail).not.toContain('Perfect! Now I have enough context');
    expect(detail).not.toMatch(/^```/);
    expect(detail.trim()).not.toMatch(/```\s*$/);
  });

  test('a nested fenced example inside the real content (e.g. a Data Model section) survives the unwrap intact', async () => {
    // The non-greedy "first ``` ... last ```" regex approach would wrongly stop at this NESTED
    // closing fence instead of the real outer one — exactly why the fix is line-range based
    // (matching the last line's close back to the first same-length open), not regex-based.
    const wrapped = 'Let me write this component.\n\n```markdown\n# src/x.json — New\n\n## Change\n\nAdds config.\n\n'
      + '## Data Model\n\n```json\n{\n  "key": "value"\n}\n```\n\nMirrors the shape above.\n\n'
      + '## Tests\n\nAssert the JSON parses.\n```';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toContain('## Data Model');
    expect(detail).toContain('"key": "value"');
    expect(detail).toContain('Mirrors the shape above.');
    expect(detail).toContain('## Tests');
    expect(detail).not.toContain('Let me write this component.');
  });

  test('a well-formed document ending in its own real fenced code example is left completely untouched', async () => {
    // The false-positive this design must avoid: a document whose real headings are already
    // unfenced, that simply happens to end with a legitimate trailing fenced Tests example as its
    // own last line — must NOT be mistaken for a whole-response wrap and have that fence stripped.
    const wellFormed = '# src/x.js — Modified\n\n## Change\n\nReal change.\n\n## Tests\n\n'
      + 'Run:\n\n```\nnpm test -- x.test.js\n```';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: wellFormed }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toBe(wellFormed);
  });

  test('a response with no recoverable heading at all is written through unchanged', async () => {
    const noHeading = 'I need more information before I can design this component.';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: noHeading }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toBe(noHeading);
  });

  test('the fix applies identically when the caller declares a worker output (not just the bare return value)', async () => {
    const dest = path.join(f.dir, 'component.md');
    const wrapped = 'Perfect. Here is the design.\n\n```markdown\n# src/y.js — New\n\n## Change\n\nx.\n\n## Tests\n\ny.\n```';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: wrapped }) });
    await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { outputs: [{ path: dest }] }));
    const written = fs.readFileSync(dest, 'utf8');
    expect(written).toContain('# src/y.js — New');
    expect(written).not.toContain('Perfect. Here is the design.');
  });

  // FTR-029/UC-03: an unclosed whole-response fence wrap — the model opens a ```fence but the
  // response simply ends without a matching close — defeats the closed-fence-unwrap above
  // entirely (no closing line to match) AND the fence-aware heading scan (fence depth never
  // returns to zero, hiding every real heading after the opener).
  test('an unclosed whole-response fence wrap is recovered (opener stripped, real heading revealed)', async () => {
    const unclosed = 'The validation is complete. Here is my component.\n\n```markdown\n'
      + '# src/x.js — New\n\n## Change\n\nExample change.\n\n## Tests\n\nExample tests.\n';
      // deliberately NO closing ``` — the model's turn simply ends
    const c = createControl({ ...f.options, dispatch: async () => response({ result: unclosed }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toContain('## Change');
    expect(detail).toContain('## Tests');
    expect(detail).not.toContain('Here is my component');
    expect(detail).not.toMatch(/^```/);
  });

  test('an unclosed fence whose remainder reveals no heading is left unchanged (no false-positive strip)', async () => {
    const noHeadingAfterStrip = '```\njust some code, not a real document, never closed\n';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: noHeadingAfterStrip }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toBe(noHeadingAfterStrip);
  });

  test('a closed whole-response fence wrap is still recovered (regression, v0.19.2 behavior unchanged)', async () => {
    const closed = 'Perfect! Let me write this.\n\n```markdown\n# src/z.js — New\n\n## Change\n\nx.\n\n## Tests\n\ny.\n```';
    const c = createControl({ ...f.options, dispatch: async () => response({ result: closed }) });
    const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    expect(detail).toContain('## Change');
    expect(detail).not.toContain('Perfect! Let me write this');
  });
});

// FTR-029/UC-01: a schema-required worker's response can end up with no usable structured_output
// for a reason beyond the "needsRequirementsFix/needsTechSpecFix omitted" case the relaxed schema
// already resolves on the first attempt — this is the secondary, bounded defense for that.
describe('worker() missing-structured-output retry (FTR-029)', () => {
  const schema = { type: 'object', properties: { valid: { type: 'boolean' } }, required: ['valid'] };

  test('a clean-exit attempt with no recoverable structured output is retried with a corrective nudge', async () => {
    let callCount = 0;
    const dispatch = async ({ prompt }) => {
      callCount++;
      if (callCount === 1) {
        expect(prompt).not.toContain('did not populate the required');
        return response({ result: 'I need more time to think about this.' }); // no JSON at all
      }
      expect(prompt).toContain('did not populate the required'); // the nudge was appended
      return response({ structured_output: { valid: true } });
    };
    const c = createControl({ ...f.options, dispatch });
    const result = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema }));
    expect(result.valid).toBe(true);
    expect(callCount).toBe(2);
  });

  test('a response recoverable via the existing text fallback is NOT retried', async () => {
    const dispatch = async () => response({ result: '```json\n{"valid": true}\n```' });
    const dispatchFn = jest.fn(dispatch);
    const c = createControl({ ...f.options, dispatch: dispatchFn });
    const result = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema }));
    expect(result.valid).toBe(true);
    expect(dispatchFn).toHaveBeenCalledTimes(1);
  });

  test('exhausting every attempt without usable structured output still throws the existing error', async () => {
    const dispatch = async () => response({ result: 'Still no JSON.' });
    const c = createControl({ ...f.options, dispatch });
    await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema })))
      .rejects.toThrow('Worker returned no structured output');
  });
});

test('a declared output cannot authorize a file outside the project', async () => {
  const dispatch = jest.fn();
  const c = createControl({ ...f.options, dispatch });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    outputs: [{ path: path.join(f.root, '..', 'outside.md') }],
  }))).rejects.toThrow('inside the project');
  expect(dispatch).not.toHaveBeenCalled();
});

describe('worker() transient "API Error:" retry', () => {
  // Scoped fake timers so the 5s/20s backoff doesn't actually stall these tests;
  // Date stays real since evidence/ledger timestamps rely on it advancing normally.
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['Date'] }));
  afterEach(() => jest.useRealTimers());

  test('a transient stream failure is retried and succeeds on a later attempt; token usage is summed across attempts', async () => {
    let calls = 0;
    const c = createControl({ ...f.options, dispatch: async () => {
      calls++;
      if (calls < 2) return response({ is_error: true, result: 'API Error: Stream idle timeout - no chunks received' });
      return response({ result: 'Done' });
    } });
    const resultPromise = c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    await jest.advanceTimersByTimeAsync(30000);
    const payload = await resultPromise;
    expect(payload).toBe('Done');
    expect(calls).toBe(2);
    expect(f.entries().find(e => e.agentId).status).toBe('done');
    expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(84); // 42 tokens x 2 attempts
    expect(evidence().attempts).toHaveLength(2);
    expect(evidence().attempts[0].resultPreview).toMatch(/Stream idle timeout/);
    expect(evidence().attempts[1].resultPreview).toBe('Done');
  });

  test('a transient stream failure that never clears exhausts all 3 attempts and fails with the attempt count', async () => {
    let calls = 0;
    const c = createControl({ ...f.options, dispatch: async () => {
      calls++;
      return response({ is_error: true, result: 'API Error: Stream idle timeout - no chunks received' });
    } });
    const resultPromise = c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
    resultPromise.catch(() => {}); // avoid an unhandled-rejection window while fake timers advance below
    await jest.advanceTimersByTimeAsync(30000);
    await expect(resultPromise).rejects.toThrow(/Worker failed.*after 3 attempts/);
    expect(calls).toBe(3);
    expect(f.entries().find(e => e.agentId).status).toBe('failed');
    expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(126); // 42 tokens x 3 attempts
    expect(evidence().attempts).toHaveLength(3);
  });

  test('a non-transient failure (no "API Error:" prefix) is never retried', async () => {
    let calls = 0;
    const c = createControl({ ...f.options, dispatch: async () => {
      calls++;
      return response({ is_error: true, result: 'The model declined this request.' });
    } });
    await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('Worker failed');
    expect(calls).toBe(1);
    expect(evidence().attempts).toHaveLength(1);
  });

  test('a permission denial is never retried, even though is_error could otherwise look transient', async () => {
    let calls = 0;
    const c = createControl({ ...f.options, dispatch: async () => {
      calls++;
      return response({ permission_denials: [{ tool_name: 'Write' }] });
    } });
    await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('Worker permission denied');
    expect(calls).toBe(1);
  });
});

test('spawn and parse failures still have durable diagnostic records', async () => {
  const c = createControl({ ...f.options, dispatch: async () => { throw new Error('spawn unavailable'); } });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'))).rejects.toThrow('spawn unavailable');
  expect(evidence().outcome).toBe('failed');
  expect(evidence().error).toContain('spawn unavailable');
});

test('structured-output failure retains token usage and raw-response diagnostics', async () => {
  // FTR-029: 'Done' has no JSON-shaped candidate at all, so this now exhausts all 3 attempts
  // (the missing-structured-output retry) before failing — 42 tokens/attempt accumulated across
  // all of them, not just the first.
  const c = createControl({ ...f.options, dispatch: async () => response() });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid'] },
  }))).rejects.toThrow('no structured output');
  expect(f.entries().find(e => e.agentId).phase_delta_tokens).toBe(126);
  expect(evidence().response.result.result).toBe('Done');
});

test('a schema-valid <structured_output> tag in plain text is accepted when the CLI field is empty', async () => {
  const taggedText = 'Phase 1...\nPhase 2...\n'
    + '<structured_output>{"valid":true,"findings":[]}</structured_output>';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: taggedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }));
  expect(payload).toEqual({ valid: true, findings: [] });
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().usedTextFallback).toBe(true);
});

test('a schema-valid ```json fence in plain text is accepted when the CLI field is empty (same agent, different model-chosen delimiter)', async () => {
  const fencedText = '## Phase 6 — report\n...\n## Phase 7 — Structured Completion\n\n'
    + '```json\n{\n  "valid": true,\n  "findings": [],\n  "report": "# Validation Report"\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }));
  expect(payload).toEqual({ valid: true, findings: [], report: '# Validation Report' });
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().usedTextFallback).toBe(true);
});

test('the last ```json fence wins when the report text itself contains an earlier json example block', async () => {
  const fencedText = 'Example of the target shape:\n```json\n{"not": "the real payload"}\n```\n'
    + 'Phase 7 — Structured Completion\n```json\n{"valid": false, "findings": ["gap"]}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }));
  expect(payload).toEqual({ valid: false, findings: ['gap'] });
});

test('a ```json fence survives a nested, untagged ``` example embedded in a string field', async () => {
  // Reproduces the real gaia-validate-feature-docs failure: the "report" field is itself a
  // markdown document that demonstrates a traceability table inside its own ``` fence (no
  // "json" tag). The non-greedy ```json regex used to stop at that inner fence, truncating
  // the capture into invalid JSON and surfacing "no structured output".
  const fencedText = 'Phase 7 — Structured Completion\n\n```json\n{\n  "valid": false,\n  "findings": ["gap"],\n'
    + '  "report": "# Report\\n\\nExample:\\n```\\n| UC | Task |\\n|----|------|\\n| UC-01 | T1 |\\n```\\nEnd.\\n"\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }));
  expect(payload.valid).toBe(false);
  expect(payload.findings).toEqual(['gap']);
  expect(payload.report).toContain('| UC-01 | T1 |');
  expect(f.entries().find(e => e.agentId).status).toBe('done');
});

test('a ```json fence with a raw (unescaped) newline inside the report string is repaired and recovered', async () => {
  // Reproduces the real downstream FTR-002 failure: the model typed the JSON by hand as part
  // of a chat reply (since structured_output never got populated) and, when embedding a long
  // multi-paragraph report as the "report" field's value, used literal line breaks instead of
  // the required \n escape. The JSON otherwise reads as entirely correct — correct ```json
  // fence tag, correct structure — but JSON.parse rejects raw control characters inside a
  // string literal outright, and used to discard the whole candidate rather than repair it.
  const rawReportBody = 'Full Validation Report\nSummary: FAIL\nSections 1-10 missing';
  const fencedText = 'Phase 7 — Structured Completion\n\n```json\n{\n  "valid": false,\n  "findings": ["Tech-Spec missing sections 1-10"],\n'
    + '  "report": "' + rawReportBody + '"\n}\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: fencedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }));
  expect(payload.valid).toBe(false);
  expect(payload.findings).toEqual(['Tech-Spec missing sections 1-10']);
  expect(payload.report).toBe(rawReportBody);
  expect(f.entries().find(e => e.agentId).status).toBe('done');
  expect(evidence().usedTextFallback).toBe(true);
});

test('an arbitrary <json> tag (a third, previously unseen delimiter) is accepted', async () => {
  // Same agent, same schema as the other delimiter tests — the model chose a different,
  // never-prompted-for tag this run. The extractor must be delimiter-agnostic rather than
  // special-cased to the two conventions seen so far.
  const taggedText = 'Phase 7 — Structured Completion\n\n<json>\n{"valid": true, "findings": [], "report": "clean"}\n</json>';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: taggedText }) });
  const payload = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings', 'report'] },
  }));
  expect(payload).toEqual({ valid: true, findings: [], report: 'clean' });
  expect(f.entries().find(e => e.agentId).status).toBe('done');
});

test('a <structured_output> tag that fails schema validation still fails closed', async () => {
  const taggedText = '<structured_output>{"wrongField":true}</structured_output>';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: taggedText }) });
  await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', {
    schema: { type: 'object', required: ['valid', 'findings'] },
  }))).rejects.toThrow('no structured output');
  expect(f.entries().find(e => e.agentId).status).toBe('failed');
});
