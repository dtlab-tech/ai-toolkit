<a id="task-INFRA-TASK-BE-03"></a>
### INFRA-TASK-BE-03

- **Task ID:** INFRA-TASK-BE-03
- **Title:** Add the validate-proposal command to feature-split.js
- **Outcome:** feature-split.js exposes a read-only validate-proposal command, registered in COMMANDS and exported. It takes the proposal and an edit on stdin and wraps editProposal and validateProposal. It returns the revised proposal, the violations and the foundation warnings as one JSON line, and writes nothing to disk.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add validate-proposal command to feature-split

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. Everything needed is already in the file. Checked facts from the current code:

- `editProposal(proposal, op)` (around line 258) works on a deep copy. On success it returns `{ proposal, warnings }`, where `warnings` is already `foundationWarnings(next, dependencyOrder(next.children))`. On any refusal it throws a `FeatureSplitError` (`EDIT_UNKNOWN`, `EDIT_FIELD_INVALID`, `EDIT_VALUE_INVALID`, `CHILD_NOT_FOUND`, `REORDER_NOT_PERMUTATION`, or a violation from `validateProposal`, such as `DEPENDS_ON_INVALID`, `OWNER_INVALID`, `TOO_FEW_CHILDREN`, or a cycle). The caller's proposal is left unchanged on refusal.
- `validateProposal(p, { checkMin = true })` (around line 223) returns nothing and throws on violation.
- `foundationWarnings(p, order)` (around line 197) returns an array of `{ code, message }`. It does not throw.
- `assertProposalShape(p, { late })` (around line 757) checks the proposal shape.
- `COMMANDS` (line 1149) currently maps only `apply` and `register`. `main()` (line 1158) dispatches on it and prints the payload as one JSON line.
- `runApply` and `runRegister` read stdin through the `readStdin` argument. The new command should do the same.

**Decision to confirm before coding:** the outcome does not fix the stdin key names. This plan uses `{ "proposal": {...}, "edit": {...} }`. The `edit` object is passed unchanged to `editProposal`.

**Merge with BE-02 first.** The file as it stands has no `check-definition` entry. If BE-02 has landed, add `validate-proposal` to its `COMMANDS` map and do not replace the map. Also extend the unknown-command message so it lists all four commands, not just `apply or register`.

**Behaviour:**

1. Read stdin and parse it as JSON. Invalid JSON, a non-object payload, or a missing `proposal` raises `INVALID_PROPOSAL` and exits 1.
2. Call `assertProposalShape(proposal)`. A shape error propagates as exit 1, not as a violation.
3. Call `editProposal(proposal, edit)`.
   - On success, return the revised proposal, `violations: []`, and the returned `warnings`.
   - On a `FeatureSplitError` from `editProposal`, return the original proposal unchanged, `violations: [{ code, key, message }]`, and the foundation warnings of the original proposal. Exit 0. A refused edit is a normal answer for the user to correct, not a tool failure.
   - Any other error is re-thrown, so `main()` reports it as an error.
4. Perform no `fs` write and no `fs` read other than stdin. The command takes no `--features-root`.

Sketch (to adapt to the file's own helpers):

```javascript
function runValidateProposal(args, readStdin) {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    fail('INVALID_PROPOSAL', 'The payload on stdin is not valid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.proposal)
    fail('INVALID_PROPOSAL', 'The payload must be an object with "proposal" and "edit"');
  const { proposal, edit } = payload;
  assertProposalShape(proposal);
  try {
    const { proposal: revised, warnings } = editProposal(proposal, edit);
    return { proposal: revised, violations: [], foundationWarnings: warnings };
  } catch (err) {
    if (!(err instanceof FeatureSplitError)) throw err;
    return {
      proposal,
      violations: [{ code: err.code, key: err.key ?? null, message: err.message }],
      foundationWarnings: foundationWarnings(proposal, dependencyOrder(proposal.children)),
    };
  }
}

const COMMANDS = { apply: runApply, register: runRegister, /* 'check-definition': from BE-02, */ 'validate-proposal': runValidateProposal };

module.exports.runValidateProposal = runValidateProposal;
```

Do not add `validateProposal` as a separate call. `editProposal` already calls it on the edited copy, so a second call would only duplicate the work. Do not change `editProposal`, `validateProposal`, or any FTR-035 contract.

Duplicate check: BE-01 provides `evaluateDefinition` and BE-02 provides `check-definition`. Neither builds validate-proposal, so this task is not a duplicate. Its unit tests belong to INFRA-TASK-TEST-03.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); if(typeof m.runValidateProposal!=='function') process.exit(1)"
```

```
npx jest tests/scripts/feature-split.test.js
```

```
npm test
```