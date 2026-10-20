# tests/integration/workflow-runtime.test.js — Modified

## Change

New tests covering AC-01/AC-02 (the validator's relaxed schema, end to end through the real
`pm-phase1` dispatch path) and AC-10/AC-11/AC-12 (fail-fast immediate per-item validation with one
bounded retry, both the per-component and per-UC loops).

## Algorithm

```js
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
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
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
```

## Tests

This component *is* the test file — no further test file covers it.
