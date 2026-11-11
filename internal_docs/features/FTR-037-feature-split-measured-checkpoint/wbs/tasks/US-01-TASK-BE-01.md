<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add check-size command scaffold with skipped status and JSON result printer
- **Outcome:** feature-split.js accepts a check-size command with --feature-dir and --prefix, applies isNewFeature to return status skipped, prints one JSON object with the keys status, counts, thresholds, over and unavailable, sets exit code 1 only for unavailable, and reports top-level failures as status unavailable.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-18
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add check-size command scaffold with skipped status

**Implementation notes:**

Modifies `src/claude/scripts/feature-split.js` (existing FTR-035 facade). The excerpt does not give the current dispatch code, line numbers, or the exact export signatures of `isNewFeature` and `loadConfig`. Confirm those in the file before writing. Do not add measurement logic here; BE-02 to BE-06 fill in the counts.

1. **Register the command.** Add `check-size` to the existing command dispatch next to the other facade commands. Do not change the behaviour of existing commands.

2. **Argument parsing.** The test harness calls `--project <root> check-size --feature-dir <dir> --prefix <ID>`, while the pm-phase1 hook (BE-08) calls `--project <root> -- check-size ...`. Accept both by ignoring a literal `--` token:

```js
function parseCheckSizeArgs(argv) {
  const args = { project: null, featureDir: null, prefix: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--') continue;
    if (t === '--project') args.project = argv[++i];
    else if (t === '--feature-dir') args.featureDir = argv[++i];
    else if (t === '--prefix') args.prefix = argv[++i];
  }
  if (!args.featureDir || !args.prefix) {
    throw new FeatureSplitError('check-size requires --feature-dir and --prefix');
  }
  return args;
}
```

3. **Result shape.** Every result has exactly the five keys from the outcome. Only `status` varies, and the default values are empty:

```js
function result(status, extra = {}) {
  return { status, counts: {}, thresholds: {}, over: [], unavailable: [], ...extra };
}
```

4. **Scaffold logic.** The scaffold uses only `isNewFeature` (FTR-035 D-07). A feature that is not new returns `skipped` with no counts and no config read. A new feature must not return `passed`, because nothing is measured yet. This task returns a fail-closed `unavailable` with a reason that names the pending work. This is a decision: the excerpt does not specify the scaffold's new-feature output, and the design requires that unmeasured features never pass (BR-03).

```js
function checkSize({ project, featureDir, prefix }) {
  if (!isNewFeature(featureDir).isNew) return result('skipped');   // isNewFeature returns { isNew, reason }, never a boolean
  // Thresholds are read here so the output shape is complete, via the FTR-035
  // loader. Its exact export signature must be confirmed in the file.
  const thresholds = loadConfig(project).thresholds;
  return result('unavailable', {
    thresholds,
    unavailable: [{ count: 'check-size', reason: 'measurement not implemented yet (BE-02 to BE-05)' }],
  });
}
```

5. **Top-level handling and printing.** Catch every error, not only `FeatureSplitError`, and convert it to `unavailable`. Print exactly one JSON object on stdout and set the exit code only from status. Do not write anything else to stdout.

```js
function runCheckSize(argv) {
  let out;
  try {
    out = checkSize(parseCheckSizeArgs(argv));
  } catch (err) {
    out = result('unavailable', { unavailable: [{ count: 'check-size', reason: err.message }] });
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = out.status === 'unavailable' ? 1 : 0;
}
```

No numeric threshold is hardcoded. No LLM client is imported. The function does not write to the feature folder.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node src/claude/scripts/feature-split.js --project . check-size --feature-dir ./internal_docs/features/FTR-NONEXISTENT-fixture --prefix FTR-NONEXISTENT
```

```
npm test
```