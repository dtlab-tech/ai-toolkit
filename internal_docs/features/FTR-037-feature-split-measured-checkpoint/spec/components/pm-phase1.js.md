# src/claude/workflows/pm-phase1.js — Modified

## Change

`pm-phase1.js` gains one hook, placed after the existing validation loop and before the Gate 1 digest is built. The hook runs `feature-split.js check-size` through `run-asset`, using the `c.command` form the file already uses, and parses the result with a guarded parser (BR-04). It adds the result to the workflow return value as `split_checkpoint`, shaped as in D-05 (`{ status, counts, thresholds, over, unavailable, proposal }`). When `status` is `"passed"` or `"skipped"`, the workflow continues to the Gate 1 digest unchanged. When `status` is `"split-proposed"`, `"unavailable"`, or any value other than those two, the workflow returns early with `split_checkpoint` and does not build the Gate 1 digest (fail-closed, so an unknown status never passes; BR-03). The hook does no threshold comparison itself, so no numeric threshold is hard-coded here; the comparison is done by `check-size` against the FTR-035 configuration keys (D-03, FTR-035 D-05). The hook does not call `apply`, does not build the proposal, and does not prompt the user; those happen in the `implement-feature` main loop (D-06). Everything else in the workflow is left unchanged, including the existing validation loop and the Gate 1 digest content.

Open gaps for the host to surface at Gate 1:
1. The excerpt does not give the exact variable names and line numbers for the validation loop, the Gate 1 digest, or the `run-asset` result object (stdout, exit code). The code below uses assumed names and must be aligned with the file before implementation.
2. On rejection (UC-03, D-10), the pipeline must "continue to Gate 1 unchanged", but this design returns before the Gate 1 digest on `split-proposed`. The excerpt does not say which component builds the digest after a rejection. Either `pm-phase1` must be re-entered for the digest or the digest must be built before the stop. This is not decided by the source.
3. The acceptance-criteria text for AC-17, AC-18 and AC-22 is not in the excerpt. This component's mapping to those criteria is inferred from D-06, D-11 and BR-03/BR-04, and should be confirmed against the Requirements.

## Algorithm

```js
// Inserted in pm-phase1's workflow body: after the validation loop, before the Gate 1 digest.
// Names marked "assumed" must be aligned with the existing file (see Change, gap 1).

const SPLIT_CHECK_CONTINUE = new Set(['passed', 'skipped']);

function unavailableCheck(reason) {
  // BR-04 / D-04: a missing or unparseable result is reported as unavailable, never as passing.
  return { status: 'unavailable', counts: null, thresholds: null, over: [],
           unavailable: [{ count: 'check-size', reason }], proposal: null };
}

function parseSplitCheck(stdout, exitCode) {
  // D-05: exit 0 = passed/skipped/split-proposed, exit 1 = unavailable (both still print JSON).
  if (exitCode !== 0 && exitCode !== 1) {
    return unavailableCheck(`check-size did not run (exit ${exitCode})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return unavailableCheck('check-size output is not JSON');
  }
  if (!parsed || typeof parsed.status !== 'string') {
    return unavailableCheck('check-size output has no status');
  }
  return parsed;
}

// Hook (assumed names: c, featureDir, prefix, run, existingReturn, buildGate1Digest)
const checkRun = await run(c.command(
  'run-asset',
  ['scripts/feature-split.js', '--project', c.projectRoot, '--',
   'check-size', '--feature-dir', featureDir, '--prefix', prefix]
));                                                   // assumed: c.command form, see gap 1
const split_checkpoint = parseSplitCheck(checkRun.stdout, checkRun.exitCode);

if (!SPLIT_CHECK_CONTINUE.has(split_checkpoint.status)) {
  // split-proposed | unavailable | unknown: stop before Gate 1 (UC-02, BR-03).
  // Gate 1 digest is NOT built here; see Change, gap 2.
  return { ...existingReturn, split_checkpoint };
}

// passed | skipped: fall through to the unchanged Gate 1 digest.
const gate1Digest = buildGate1Digest(/* existing arguments */);
return { ...existingReturn, gate1Digest, split_checkpoint };
```

Design notes:
- The guarded parser treats every failure path as `unavailable`. A non-JSON result, a missing `status`, or an exit code other than 0 or 1 never reaches the continue branch (BR-04).
- The continue test is a positive allow-list (`passed`, `skipped`). Any other status, including a status not yet defined, stops the pipeline. This keeps the failure mode on the side of not passing (BR-03).
- `split_checkpoint` is always set in the return value, on both the stop and continue paths, so `implement-feature` Step 1a (D-11) can read it in every case.

## Tests

The hook is a workflow file, so it is pinned by static tests, not by runtime tests of `check-size` (those belong to `feature-split.js`'s own test file).

- **`tests/workflows/split-checkpoint-static.test.js`** (this component's test file, also listed in the index):
  - The `check-size` call appears after the validation loop and before the Gate 1 digest construction (source-order assertion on the file text).
  - The call uses the `c.command` form already used in the file, with `scripts/feature-split.js`, `--project`, `check-size`, `--feature-dir`, and `--prefix` arguments (D-05, D-06).
  - The workflow return value contains the `split_checkpoint` key on the stop path and on the continue path.
  - The continue allow-list is exactly `passed` and `skipped`; the test fails if `split-proposed`, `unavailable`, or any unknown status can reach the Gate 1 digest.
  - A non-JSON stdout, a missing `status`, and an exit code other than 0 or 1 each produce `status: "unavailable"` (BR-04, D-04), and never `passed`.
  - Exit code 1 with a valid JSON body of `status: "unavailable"` is passed through unchanged.
  - The workflow text contains no call to `apply`, no proposal construction, and no user prompt (D-06). This confirms the prompt and apply stay in the `implement-feature` main loop.
  - No numeric threshold literal appears in `pm-phase1.js` (the comparison is delegated to `check-size` and the FTR-035 configuration).