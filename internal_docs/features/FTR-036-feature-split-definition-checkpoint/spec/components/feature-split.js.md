# src/claude/scripts/feature-split.js — Modified

## Change

This change adds the `check-definition` command to the `COMMANDS` dispatch table in `feature-split.js`, which currently routes only `apply` and `register`. It adds four new functions: `parseGrillingRecord` (reads the stdin JSON and throws `RECORD_INVALID` when it is not a JSON object), `evaluateDefinition` (pure: derives the actor, application and flow counts, compares each with `meetsMinimum` against `definitionSignals`, and returns `{ status, signals, flows, unevaluated }`), `checkDefinition` (resolves the feature folder with the existing `findParentDir`, applies the existing `isNewFeature`, and returns `status: "skipped"` without reading stdin when the feature is not new), and `runCheckDefinition` (parses `--features-root`, `--feature-id` and an optional `--project`, then delegates). It also adds three exports: `evaluateDefinition`, `parseGrillingRecord` and `checkDefinition`. The existing `apply`, `register`, `loadConfig`, `isNewFeature`, `findParentDir`, `parseFlags`, `required`, registry, planning and rendering code is reused unchanged and is not edited. `main`'s unknown-command message changes to list `check-definition`. The command writes nothing to disk. Open gaps for the host: (1) it is not confirmed whether `run-asset` forwards `--project` to the script. The design reads `flags.project` when present and falls back to `process.cwd()`, which matches `loadConfig`'s default. (2) The design treats a missing or malformed signal field (`actors`, `applications`, or `flows` with an entry that has no non-empty `name`) as unevaluated under BR-02, not as an error. Only non-JSON or non-object input raises `RECORD_INVALID`. Confirm this split at Gate 1.

## Service Interface

```js
const DEFINITION_SIGNALS = { actors: 'minActors', applications: 'minApplications', flows: 'minFlows' };

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isNameList = (v) => Array.isArray(v) && v.every(isNonEmptyString);
const isFlowList = (v) => Array.isArray(v) && v.every(f =>
  f !== null && typeof f === 'object' && !Array.isArray(f) && isNonEmptyString(f.name));

// D-03: the grilling record is never written to disk.
function parseGrillingRecord(text) {
  let record;
  try { record = JSON.parse(text); }
  catch { fail('RECORD_INVALID', 'The grilling record on stdin is not valid JSON'); }
  if (record === null || typeof record !== 'object' || Array.isArray(record))
    fail('RECORD_INVALID', 'The grilling record must be a JSON object');
  return record;
}

// Pure. minimums = loadConfig().definitionSignals. Never throws for a missing or malformed
// signal field: that signal goes to `unevaluated` and cannot raise the flag (BR-02).
function evaluateDefinition(record, minimums) {
  const flowsOk = isFlowList(record.flows);
  const counts = {
    actors: isNameList(record.actors) ? record.actors.length : null,
    applications: isNameList(record.applications) ? record.applications.length : null,
    flows: flowsOk ? record.flows.length : null,
  };
  const signals = {};
  const unevaluated = [];
  for (const [key, minKey] of Object.entries(DEFINITION_SIGNALS)) {
    const minimum = minimums[minKey];
    if (counts[key] === null) {
      unevaluated.push(key);
      signals[key] = { count: null, minimum, met: false };
    } else {
      signals[key] = { count: counts[key], minimum, met: meetsMinimum(counts[key], minimum) };
    }
  }
  const flagged = Object.values(signals).some(s => s.met);
  const flows = flowsOk
    ? record.flows.map(f => ({ name: f.name.trim(), reason: isNonEmptyString(f.reason) ? f.reason.trim() : '' }))
    : [];
  return { status: flagged ? 'flagged' : 'not-flagged', signals, flows, unevaluated };
}

// D-04. The record is read only when the feature is new, so a skipped check never touches stdin.
function checkDefinition({ featuresRoot, featureId, readRecord, projectRoot = process.cwd() }) {
  if (!/^FTR-\d+$/.test(featureId ?? ''))
    fail('FEATURE_INVALID', `${featureId} is not an FTR-NNN id`, { key: featureId ?? null });
  const featureDir = findParentDir(featuresRoot, featureId);   // folder "FTR-NNN" or "FTR-NNN-<slug>", or the bare path
  if (!isNewFeature(featureDir).isNew)
    return { status: 'skipped', signals: {}, flows: [], unevaluated: [] };
  const record = parseGrillingRecord(readRecord());
  const { definitionSignals } = loadConfig({ projectRoot });
  return evaluateDefinition(record, definitionSignals);
}

function runCheckDefinition(args, readStdin) {
  const flags = parseFlags(args);
  return checkDefinition({
    featuresRoot: required(flags, 'features-root'),
    featureId: required(flags, 'feature-id'),
    projectRoot: flags.project || process.cwd(),
    readRecord: readStdin,
  });
}

const COMMANDS = { apply: runApply, register: runRegister, 'check-definition': runCheckDefinition };

// added to module.exports:
module.exports.evaluateDefinition = evaluateDefinition;
module.exports.parseGrillingRecord = parseGrillingRecord;
module.exports.checkDefinition = checkDefinition;
```

Output contract, printed by `run()` as one JSON line on stdout with exit code 0. A skipped result is `{"status":"skipped","signals":{},"flows":[],"unevaluated":[]}`. An evaluated result looks like `{"status":"flagged","signals":{"actors":{"count":2,"minimum":2,"met":true},"applications":{"count":0,"minimum":2,"met":false},"flows":{"count":3,"minimum":3,"met":true}},"flows":[{"name":"…","reason":"…"}],"unevaluated":[]}`. Errors use the existing `errorPayload` shape with exit code 1 and the codes `RECORD_INVALID`, `FEATURE_INVALID` or `ARG_MISSING`. Minimums are read from `definitionSignals` in the config, not hard-coded.

## Tests

Append to `tests/scripts/feature-split.test.js`. Use temp feature roots created per test, and make no call with a real features root. Cases:

- **Skipped, epic:** a folder `FTR-0NN` containing `epic.md` returns `status: "skipped"`. The test passes a `readRecord` that throws, to prove stdin is not read.
- **Skipped, approvals and WBS:** a folder with `FTR-0NN-Approvals.md`, and separately one with a `wbs/` directory, each return `skipped`.
- **New, folder absent:** `FTR-0NN` not on disk proceeds to evaluation (`isNew` via `not-created`).
- **New, feature.md only:** a folder with only `feature.md` still evaluates.
- **Not flagged:** 1 actor, 1 application, 2 flows gives `not-flagged`, with every `met` false.
- **Boundary, each signal:** exactly `minActors` (2), exactly `minApplications` (2) and exactly `minFlows` (3) each set `met: true` and `flagged`. One below the minimum does not.
- **Flagged by one signal:** 2 actors, 0 applications, 0 flows gives `flagged`, with only `actors.met` true.
- **Unevaluated actors:** the record without an `actors` field gives `unevaluated: ["actors"]`, `actors.count: null`. Applications and flows are still evaluated. With only that one missing, the status is `not-flagged`.
- **Malformed flow entry:** a flow with no `name`, or a non-array `flows`, gives `unevaluated: ["flows"]` and `flows: []`.
- **Flow output:** names and reasons are trimmed, and a missing `reason` becomes `""`.
- **RECORD_INVALID:** non-JSON text, `null`, `[]` and a bare string each throw `RECORD_INVALID` through `main`, with `exitCode: 1`.
- **FEATURE_INVALID:** `feature-id` values `FTR-x`, `036` and empty each throw `FEATURE_INVALID`.
- **Config override:** a project-root `feature-split.config.json` with `definitionSignals.minActors: 3` makes 2 actors not flagged.
- **Writes nothing:** a snapshot of the features root (names and mtimes) is identical before and after every `check-definition` call, in both the skipped and evaluated paths.
- **Dispatch:** `main(['check-definition', '--features-root', r, '--feature-id', 'FTR-0NN'], readStdin)` returns `exitCode: 0`. An unknown command still lists the three commands in its message.
- **Regression:** the existing `apply` and `register` tests pass unchanged.