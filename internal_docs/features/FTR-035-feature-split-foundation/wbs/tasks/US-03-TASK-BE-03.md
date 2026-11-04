<a id="task-US-03-TASK-BE-03"></a>
### US-03-TASK-BE-03

- **Task ID:** US-03-TASK-BE-03
- **Title:** Add shared-foundation warning check
- **Outcome:** feature-split.js has a foundationWarnings function that returns a BR-03 warning, stating its consequence, when sharedFoundationOwner is not the first child in dependency order. It returns an empty list otherwise and never throws.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-02
- **Acceptance criteria:** AC-17
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add shared-foundation BR-03 warning check

**Implementation notes:**

Add one new function to `src/claude/scripts/feature-split.js`. It goes directly after `dependencyOrder` (added by US-03-TASK-BE-02) and before `validateProposal`. Do not change any other function in this task. `buildProposal` and `editProposal` are later tasks (US-03-TASK-BE-05 and BE-06) and will call this function. This task only adds it.

The Tech-Spec body gives the function as written below. One change is needed to meet the outcome's "never throws" requirement. The design version reads `order[0].name` unguarded, which throws when there are no children. The guard added at the top returns an empty list in that case:

```javascript
// BR-03 (D-10). Returns a warning when the shared-foundation owner is not the
// first child in dependency order. Never throws.
function foundationWarnings(p, order) {
  if (!p || !Array.isArray(order) || order.length === 0) return [];   // nothing to compare against
  if (p.sharedFoundationOwner === order[0].name) return [];
  return [{
    code: 'FOUNDATION_NOT_FIRST',
    message: `BR-03 is broken: the shared foundation is assigned to ${p.sharedFoundationOwner ?? 'no child'}, `
      + `not to the first child in dependency order (${order[0].name}). Children before the owner are built `
      + `without the foundation.`,
  }];
}
```

Behaviour to check:
- Owner equals `order[0].name`: returns `[]`.
- Owner is any other child, or `null`: returns one object with `code: 'FOUNDATION_NOT_FIRST'`. The message names the BR-03 consequence (children before the owner are built without the foundation).
- Empty or missing `order`: returns `[]`, does not throw.

Export handling: the verification below must call the function directly, because `buildProposal` does not exist yet at this point in the sequence. Add `foundationWarnings` to `module.exports`. This conflicts with the D-23 "exports include exactly" list that the test file asserts (see Tests, Change gap-style note in the Tech-Spec). The host must reconcile this at the test task, either by listing `foundationWarnings` in that assertion or by removing the export once the test file uses `buildProposal`.

No other behaviour is added. The file must still pass `node --check`.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const {foundationWarnings:f}=require('./src/claude/scripts/feature-split.js');const o=[{name:'Auth'},{name:'Billing'}];if(f({sharedFoundationOwner:'Auth'},o).length!==0)process.exit(1);const w=f({sharedFoundationOwner:'Billing'},o);if(w.length!==1||w[0].code!=='FOUNDATION_NOT_FIRST'||!/BR-03/.test(w[0].message))process.exit(1);if(f({sharedFoundationOwner:null},o).length!==1)process.exit(1);if(f({sharedFoundationOwner:'Auth'},[]).length!==0)process.exit(1);console.log('foundationWarnings ok')"
```

```
npm test
```