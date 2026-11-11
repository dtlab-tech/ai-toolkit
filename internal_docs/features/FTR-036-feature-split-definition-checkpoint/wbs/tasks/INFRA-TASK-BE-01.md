<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Add parseGrillingRecord and evaluateDefinition to feature-split.js
- **Outcome:** feature-split.js contains an exported parseGrillingRecord, which throws RECORD_INVALID for non-JSON or non-object input, and an exported pure evaluateDefinition. evaluateDefinition returns status, signals, flows and unevaluated from definitionSignals minimums via meetsMinimum, and lists a missing or malformed signal field under unevaluated.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add grilling record parsing and definition signal evaluation

**Implementation notes:**

Scope and sources. No Tech-Spec excerpt cites this task (acceptance criteria are empty), so the Components fallback applies. The relevant component is `feature-split.js`. Its design body was not supplied, so the design below comes from Tech-Spec §2.1, §6 and §12 and from the current file. I read `src/claude/scripts/feature-split.js` once, as the modification target, to confirm the helpers and export pattern.

Two points in the excerpt that the implementer must know:

1. **Record shape (D-03) is not defined in the excerpt.** The excerpt names the record's top-level shape only as "the D-03 shape" and gives the signal keys as `actors`, `applications` and `flows`, each `null` (unevaluated) or an array. This note assumes a top-level object with those three keys. Only the array length is counted. Element shape is not checked here. If D-03 defines element fields, stop and report before adding checks.
2. **Malformed signal fields.** Tech-Spec §6 says a non-null, non-array field is `RECORD_INVALID`. This task's outcome says a missing or malformed signal field is listed under `unevaluated`. This note follows the outcome for `evaluateDefinition`, which is this task's own fixed scope. `parseGrillingRecord` checks only the top level. The §6 field-level rule is not implemented here, and the conflict should be reconciled before INFRA-TASK-BE-02 and INFRA-TASK-TEST-02 are written.

Where to add the code. Insert the new block in `src/claude/scripts/feature-split.js` immediately before `const COMMANDS = { apply: runApply, register: runRegister };` (currently line 1149), so it sits after `register`. Do not change `COMMANDS` here; that is INFRA-TASK-BE-02. Add two lines to the export list after `module.exports.register = register;` (currently line 1217). `fail`, `meetsMinimum` and `FeatureSplitError` already exist in the file and are reused.

Code to add:

```js
// D-03 signal keys mapped to their definitionSignals minimum keys (feature-split.config.json).
const GRILLING_SIGNALS = [
  { key: 'actors', minKey: 'minActors' },
  { key: 'applications', minKey: 'minApplications' },
  { key: 'flows', minKey: 'minFlows' },
];

// Parses the grilling record from stdin text. Throws RECORD_INVALID only at the top level.
// Field-level problems are handled by evaluateDefinition (see note 2 above).
function parseGrillingRecord(text) {
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    fail('RECORD_INVALID', 'The grilling record on stdin is not valid JSON');
  }
  if (record === null || typeof record !== 'object' || Array.isArray(record))
    fail('RECORD_INVALID', 'The grilling record must be a JSON object');
  return record;
}

// Pure: no I/O. definitionSignals is config.definitionSignals as returned by loadConfig.
// Returns { status: 'flagged' | 'not-flagged', signals, flows, unevaluated }.
// A signal whose field is missing, null or not an array is unevaluated. It never raises the flag.
// A signal raises the flag when meetsMinimum(count, minimum) holds for at least one signal (D-05, at least N).
function evaluateDefinition(record, definitionSignals) {
  const signals = {};
  const unevaluated = [];
  for (const { key, minKey } of GRILLING_SIGNALS) {
    const minimum = definitionSignals[minKey];
    const value = record[key];
    if (!Array.isArray(value)) {
      unevaluated.push(key);
      signals[key] = { count: null, minimum, met: false };
      continue;
    }
    signals[key] = { count: value.length, minimum, met: meetsMinimum(value.length, minimum) };
  }
  const flows = Array.isArray(record.flows) ? record.flows : [];
  const flagged = Object.values(signals).some(s => s.met);
  return { status: flagged ? 'flagged' : 'not-flagged', signals, flows, unevaluated };
}
```

Export lines to add after `module.exports.register = register;`:

```js
module.exports.parseGrillingRecord = parseGrillingRecord;
module.exports.evaluateDefinition = evaluateDefinition;
```

Behaviour that must hold, checked by the verification commands:
- `parseGrillingRecord('not json')`, `'null'`, `'[]'` and `'"x"'` throw `FeatureSplitError` with code `RECORD_INVALID`. A valid object returns the parsed object.
- `evaluateDefinition({actors:[1,2], applications:[1,2], flows:[]}, {minActors:2, minApplications:2, minFlows:3})` returns `status: 'flagged'`, `unevaluated: []`.
- `evaluateDefinition({actors:[1], applications:null, flows:[1,2]}, {minActors:2, minApplications:2, minFlows:3})` returns `status: 'not-flagged'` and `unevaluated: ['applications']`.
- `evaluateDefinition({actors:[1,2]}, ...)` with `applications` and `flows` absent lists both under `unevaluated`, and `status` is `flagged` because `actors` meets its minimum.

Estimate. This is about 60 lines of pure code plus exports, with no file I/O and no new dependencies. It fits the ≤15 band with a 12-minute estimate.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); if(typeof m.parseGrillingRecord!=='function'||typeof m.evaluateDefinition!=='function'){process.exit(1)}"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); try{m.parseGrillingRecord('not json');process.exit(1)}catch(e){if(e.code!=='RECORD_INVALID')process.exit(1)}"
```

```
npm test
```