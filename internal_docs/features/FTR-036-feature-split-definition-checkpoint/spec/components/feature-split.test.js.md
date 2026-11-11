# tests/scripts/feature-split.test.js — Modified

## Change

Domain: TEST. Addresses: AC-01, AC-02, AC-03, AC-04, AC-05, AC-08, AC-11.

This file gains one new top-level `describe('check-definition')` block appended after the existing blocks. It pins the library function `checkDefinition` in `src/claude/scripts/feature-split.js` and the `check-definition` facade command, per FTR-036 D-01 to D-04. Existing tests are not changed. The `DEFAULTS` pin in `loadConfig` (minActors 2, minApplications 2, minFlows 3) already matches BR-05, so no default changes are needed. The new block reuses `isNewFeature`, `meetsMinimum`, `loadConfig`, `FeatureSplitError`, `findStagingLeftovers` and the existing `root` fixture. It adds one helper, `runFacadeWithInput(args, input)`, next to `runFacade`, which stays unchanged because it sends no stdin.

Open gaps, for the host to surface at Gate 1:
1. The excerpt gives Addresses only as IDs. AC-01 to AC-11 text is not in the excerpt, so the cases below are derived from D-01 to D-04, BR-02, BR-04, the status `skipped` test (Tech-Spec §12), and RECORD_INVALID handling (Tech-Spec §6). The AC-to-case mapping needs confirmation.
2. BR-02 says an unevaluable signal does not raise the flag, but the excerpt does not define "cannot be evaluated". This design treats a list field that is absent or `null` as unevaluated. A field that is present but not an array is `RECORD_INVALID`.
3. D-04 does not give the output shape for `skipped`. This design returns `signals: null`, `flows: []`, `unevaluated: []`.
4. The facade argument form follows D-04 literally, including the `--` separator. This must be checked against the facade's argument parser.

## Service Interface

The contract that the new tests pin, for `feature-split.js`:

```js
// LIB.checkDefinition({ featuresRoot, featureId, record, config }) -> result
// record: { actors: string[] | null, applications: string[] | null,
//           flows: { name: string, reason: string }[] | null }   (D-03, held in memory)
// config: loadConfig({ projectRoot }) result; minimums come from config.definitionSignals (D-01)

function checkDefinition({ featuresRoot, featureId, record, config }) {
  const dir = findFeatureDir(featuresRoot, featureId);   // folder whose basename is featureId or starts with `${featureId}-`; null if none
  if (dir && !isNewFeature(dir).isNew) {
    return { status: 'skipped', signals: null, flows: [], unevaluated: [] };
  }
  const flows = validateRecord(record);                  // throws RECORD_INVALID; writes nothing
  const signals = {};
  const unevaluated = [];
  const SIGNALS = [
    ['actors', 'minActors'],
    ['applications', 'minApplications'],
    ['flows', 'minFlows'],
  ];
  for (const [key, minKey] of SIGNALS) {
    const list = record[key];
    if (list == null) {                                  // BR-02: cannot be evaluated, never raises the flag
      signals[key] = null;
      unevaluated.push(key);
      continue;
    }
    const count = new Set(list.map(s => String(s).trim()).filter(Boolean)).size;   // distinct, non-empty
    const minimum = config.definitionSignals[minKey];
    signals[key] = { count, minimum, met: meetsMinimum(count, minimum) };
  }
  const flagged = Object.values(signals).some(s => s && s.met);
  return { status: flagged ? 'flagged' : 'not-flagged', signals, flows: flows ?? [], unevaluated };
}
```

`validateRecord` checks that the record is a plain object. It checks that each present list field is an array (`actors`, `applications`) or an array of `{ name, reason }` with a non-empty string `name` (`flows`). Anything else throws `FeatureSplitError('RECORD_INVALID', ...)`. `findFeatureDir` returns `null` when no folder matches, and `isNewFeature(null)` is never called, so a feature that has no folder yet is evaluated, not skipped.

Facade contract: `feature-split.js check-definition --features-root <path> --feature-id <FTR-ID>` reads the record as JSON from stdin, with `--project` resolved as in the other commands. It prints exactly one JSON object on stdout and exits 0 on success. On failure it prints `{ "error": { code, key, file, message } }` and exits 1, which is the existing facade error contract (pinned at lines 276–300 of this file).

## Tests

Test file: `tests/scripts/feature-split.test.js`, appended `describe('check-definition', ...)` block. Use the existing `root` fixture (`beforeEach`/`afterEach`). Fixtures use a `RECORD(over)` factory with two actors, two applications and three named flows, so the default record is flagged. Use `loadConfig({ projectRoot: root })` for config.

Core cases:
- **skipped (AC-01, Tech-Spec §12):** a feature folder containing `epic.md` returns `status: 'skipped'`, `signals: null`, `flows: []`, `unevaluated: []`, even for a record that would otherwise be flagged. The same holds for `{featureId}-Approvals.md` and for a `wbs/` directory. Each case is a separate `test.each`.
- **not skipped (AC-01):** a folder holding only `req/` and `spec/` is evaluated. A missing folder is also evaluated. Both return `flagged` for the default record.
- **flag at the minimum (AC-02, D-01):** 2 actors, 1 application, 1 flow gives `flagged`, because `meetsMinimum` is inclusive. 1 actor, 1 application, 2 flows gives `not-flagged`, since no minimum is reached.
- **each signal alone:** 2 applications with 1 actor and 2 flows gives `flagged`. 3 flows with 1 actor and 1 application gives `flagged`. Confirms the three signals are independent (D-01).
- **flows output (AC-03, D-02):** a `flagged` result returns `flows` equal to the input list, with each `name` and `reason` preserved. A `not-flagged` result still returns the list.
- **counts are distinct and trimmed:** `['Admin', ' Admin ', '']` counts as 1 actor.
- **BR-02 unevaluable signal:** with `applications` absent (`undefined`) and 1 actor, 2 flows, the result is `not-flagged`, `unevaluated` equals `['applications']`, and `signals.applications` is `null`. Also with `applications` absent and 2 actors, the result is `flagged`, and the flag comes from `actors` alone.
- **config override:** with `feature-split.config.json` setting `definitionSignals.minActors: 3`, a record with 2 actors and 1 application and 2 flows gives `not-flagged`. This shows the minimums come from `loadConfig`, not from literals.
- **RECORD_INVALID (Tech-Spec §6):** malformed-JSON-equivalent input (`actors: 'Customer'` as a string), a flow without a non-empty `name`, and a non-object record each throw `FeatureSplitError` with `code === 'RECORD_INVALID'`. In each case the features root and its folders are byte-identical before and after the call, using the snapshot approach from `apply refusal`.
- **writes nothing (AC-04, BR-03, BR-04):** after a successful `checkDefinition` with a flagged record, the snapshot of `root` is unchanged, so no file is created and the record is not persisted.
- **facade stdout and exit (AC-05):** `runFacadeWithInput(['--project', root, '--', 'check-definition', '--features-root', featuresRoot, '--feature-id', 'FTR-010'], JSON.stringify(RECORD()))` exits 0 and prints exactly one parseable JSON line containing `status`, `signals`, `flows` and `unevaluated`.
- **facade RECORD_INVALID:** the same command with stdin `not json` exits 1, and stdout parses to `{ error: { code: 'RECORD_INVALID', key, file, message } }` with exactly those four keys.
- **facade skipped:** with an `epic.md` in the feature folder, stdout reports `status: 'skipped'` and exit is 0.

Helper, placed next to `runFacade`:

```js
function runFacadeWithInput(args, input) {
  return spawnSync(process.execPath, [FACADE, ...args], { encoding: 'utf8', input });
}
```