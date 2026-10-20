# tests/cli/workflow-worker-contract.test.js — Modified

## Change

New tests added to the existing `describe('extractMarkdownDocument (non-schema plain-text worker
payload)', ...)` block (AC-08/AC-09), and a new `describe('worker() missing-structured-output
retry (FTR-029)', ...)` block (AC-03/AC-04), both using this file's own existing real-dispatch
style (`createControl` + `c.worker(...)`, not a mocked extraction function).

## Algorithm

Added to the existing `extractMarkdownDocument` describe block:

```js
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
```

New describe block for UC-01's secondary retry (placed near the other `worker()`-level tests in
this file):

```js
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
```

## Tests

This component *is* the test file — no further test file covers it.
