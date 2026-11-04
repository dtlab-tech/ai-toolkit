<a id="task-US-05-TASK-BE-03"></a>
### US-05-TASK-BE-03

- **Task ID:** US-05-TASK-BE-03
- **Title:** Wire facade register command
- **Outcome:** The facade register command requires --features-root and a feature directory argument, parses --keywords as a comma list, and reports ARG_MISSING when either argument is absent. The one-JSON-object stdout and the exit 0 or 1 contract, and the dispatch of register, are inherited from INFRA-TASK-BE-02 and are not re-implemented here.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-02, INFRA-TASK-BE-02
- **Acceptance criteria:** AC-37
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire facade register command

**Implementation notes:**

This task changes only the `register` branch of `main(argv)` in `src/claude/scripts/feature-split.js`. The dispatch, the single-JSON stdout, and the exit 0/1 handling come from INFRA-TASK-BE-02 and stay as they are. The `--keywords` comma parsing already appears in the design's `main`, so it is kept as written. The new work is the explicit `ARG_MISSING` check for the feature directory positional argument, which the design does not have. Without it, `path.resolve(undefined)` inside `register` would throw a `TypeError` and be reported as `OPERATIONAL_ERROR` instead of `ARG_MISSING`.

Duplicate check: no sibling task builds these argument checks. INFRA-TASK-BE-02 owns dispatch only, and its outcome says nothing about per-command argument validation, so this is not a duplicate implementation.

Before (the `register` branch as specified in the BE-02 facade design):

```javascript
} else if (command === 'register') {
  result = register({ featuresRoot: required('features-root'), featureDir: rest[0],
    keywords: (opts.keywords || '').split(',').map(s => s.trim()).filter(Boolean) });
```

After:

```javascript
} else if (command === 'register') {
  const featuresRoot = required('features-root');            // throws ARG_MISSING if absent or empty
  const featureDir = rest[0];
  if (!featureDir) fail('ARG_MISSING', 'A feature directory argument is required for register');
  result = register({ featuresRoot, featureDir,
    keywords: (opts.keywords || '').split(',').map(s => s.trim()).filter(Boolean) });
```

Notes on behaviour:
- `required()` is the existing helper in `main`. It already throws `ARG_MISSING` through `fail`, so the new check uses the same error path.
- Both `fail` calls run inside the existing `try` block. The catch branch therefore emits `{ error: { code: 'ARG_MISSING', message, key, file } }` on stdout and sets exit code 1, with no change to the envelope.
- A missing `--keywords` is not an error. It yields an empty keyword list, which matches the existing `filter(Boolean)` behaviour.
- `parseArgs` skips `--` and treats the first positional as the command. The feature directory is therefore `rest[0]`, which is what the check reads.
- If the live `main` in the file differs from the BE-02 design shown above, adapt the same two changes (the `--features-root` check and the feature-directory check) to the live code. Do not change the dispatch or the output envelope.

Test coverage for these cases is owned by US-05-TASK-TEST-04. The commands below are a direct check of the argument contract.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node src/claude/scripts/feature-split.js register --features-root ./no-such-root; test $? -eq 1
```

```
node src/claude/scripts/feature-split.js register ./no-such-feature-dir; test $? -eq 1
```

```
npm test -- --testPathPattern=feature-split
```