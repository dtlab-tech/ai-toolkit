<a id="task-US-04-TASK-BE-12"></a>
### US-04-TASK-BE-12

- **Task ID:** US-04-TASK-BE-12
- **Title:** Connect facade apply command to proposal stdin
- **Outcome:** The facade apply command requires --features-root and --parent, reads the proposal JSON from stdin (invalid JSON gives INVALID_PROPOSAL) and calls apply. It prints the single result object on exit 0, or the error object on exit 1.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-11, INFRA-TASK-BE-02
- **Acceptance criteria:** AC-36
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** connect apply command to facade

**Implementation notes:**

This task modifies the `apply` branch of `main(argv)` in `src/claude/scripts/feature-split.js`. That branch is part of the facade built by INFRA-TASK-BE-02, which already dispatches `apply` and `register` and owns the single-JSON stdout and exit contract. Only the `apply` branch changes. The `register` branch, the success write, and the error write stay as they are. This is a refinement of existing code, not a second implementation of the same outcome.

The design's current `apply` branch has a gap. It parses stdin inside the outer `try`, so a `JSON.parse` `SyntaxError` falls through to the catch-all and is reported as `OPERATIONAL_ERROR`. AC-36 needs `INVALID_PROPOSAL`. Required-argument checks should also run before stdin is read, so a missing flag reports `ARG_MISSING` without consuming input.

Before (current design, `main`):

```javascript
if (command === 'apply') {
  const proposal = JSON.parse(fs.readFileSync(0, 'utf8'));
  result = apply({ featuresRoot: required('features-root'), parentId: required('parent'), proposal });
```

After:

```javascript
if (command === 'apply') {
  const featuresRoot = required('features-root');   // ARG_MISSING before stdin is read
  const parentId = required('parent');
  let proposal;
  try {
    proposal = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    fail('INVALID_PROPOSAL', 'The proposal on stdin is not valid JSON');   // covers empty stdin too
  }
  result = apply({ featuresRoot, parentId, proposal });
```

Behaviour rules for this change:
- Only the JSON parse step produces `INVALID_PROPOSAL`. Shape problems in a parsed object (for example a bad `source` or too few children) keep the codes that `apply` and `validateProposal` already raise. This task does not re-validate the shape.
- Empty stdin gives `''`, which fails `JSON.parse`, so it also yields `INVALID_PROPOSAL`.
- The success path is unchanged: `process.stdout.write(JSON.stringify(result) + '\n')` with `process.exitCode = 0`.
- The error path is unchanged: a `FeatureSplitError` or any other error prints one `{ error: { code, message, key, file } }` object (with `OPERATIONAL_ERROR` for non-library errors) and sets `process.exitCode = 1`.
- No file is touched by the facade before `apply` runs. A parse failure happens before `apply` is called, so nothing is moved.

Scope check: the design excerpt and this task's skeleton entry fully specify the change. Nothing here needs to be invented. Full branch-level tests for stdout and exit codes belong to US-04-TASK-TEST-06, not to this task.

**Verification commands:**

```
npm test
```

```
node --check src/claude/scripts/feature-split.js
```

```
printf '{' | node src/claude/scripts/feature-split.js apply --features-root . --parent FTR-001; echo "exit=$?"
```