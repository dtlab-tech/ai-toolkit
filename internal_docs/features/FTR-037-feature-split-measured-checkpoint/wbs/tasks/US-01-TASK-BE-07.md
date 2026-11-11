<a id="task-US-01-TASK-BE-07"></a>
### US-01-TASK-BE-07

- **Task ID:** US-01-TASK-BE-07
- **Title:** Add guarded check-size result parser to pm-phase1
- **Outcome:** pm-phase1.js contains a parser that turns a missing result, an exit code other than 0 or 1, non-JSON stdout, or a result without a string status into an unavailable result with a reason. It never throws and never returns passed for those inputs.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-17
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add guarded check-size result parser to pm-phase1

**Implementation notes:**

Scope: add one pure helper and one unavailable-result builder to `src/claude/workflows/pm-phase1.js`. This task does not call the parser from the workflow body and does not change the return value. That wiring belongs to US-01-TASK-BE-08. The excerpt does not include the current contents of `pm-phase1.js`, so the exact line where the helper is inserted is not known. Place both functions at module top level, next to the existing helpers, and before the workflow function. They must not depend on any other name in the file.

Gap to resolve before implementing: the excerpt does not show the shape of the `run-asset` result object. This note assumes it exposes `stdout` (string) and `exitCode` (number). If the real field names differ, change only the two property reads in `parseSplitCheck`.

Deviation from the Tech-Spec sketch: the sketch takes `(stdout, exitCode)`. This note takes the whole result object instead. That lets a missing result (`undefined` or `null`) map to `unavailable` without a throw at the call site.

```js
const SPLIT_CHECK_EXIT_CODES = new Set([0, 1]);

// BR-04 / D-04: every failure path yields unavailable with a reason, never passed.
function unavailableCheck(reason) {
  return {
    status: 'unavailable',
    counts: null,
    thresholds: null,
    over: [],
    unavailable: [{ count: 'check-size', reason }],
    proposal: null,
  };
}

// Returns the parsed check-size JSON, or an unavailable result. Never throws.
function parseSplitCheck(result) {
  if (result === null || typeof result !== 'object') {
    return unavailableCheck('check-size did not return a result');
  }
  if (!SPLIT_CHECK_EXIT_CODES.has(result.exitCode)) {
    return unavailableCheck(`check-size did not run (exit ${result.exitCode})`);
  }
  if (typeof result.stdout !== 'string') {
    return unavailableCheck('check-size produced no output');
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    return unavailableCheck('check-size output is not JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.status !== 'string') {
    return unavailableCheck('check-size output has no string status');
  }
  return parsed;
}
```

Behavior the code must guarantee:
- A missing result, an exit code other than 0 or 1 (including `undefined`), non-string stdout, non-JSON stdout, JSON `null`, a non-object JSON value, or an object without a string `status` each return `status: "unavailable"` with a non-empty `unavailable` reason.
- Exit code 1 with a valid JSON object that has a string `status` (for example `"unavailable"`) is returned unchanged. The parser does not rewrite a valid body.
- The only path that returns a non-unavailable value is the final `return parsed`, and it runs only when all the checks above pass. The parser does not inspect `status` values beyond requiring a string. The allow-list decision (`passed`/`skipped` continue) belongs to BE-08.
- The parser does no threshold comparison and holds no numeric literal.

**Verification commands:**

```
node -e "const F=Object.getPrototypeOf(async function(){}).constructor;new F(require('fs').readFileSync(process.argv[1],'utf8').replace(/^export /gm,''))" src/claude/workflows/pm-phase1.js
```

```
grep -q "function parseSplitCheck" src/claude/workflows/pm-phase1.js
```

```
npm test
```