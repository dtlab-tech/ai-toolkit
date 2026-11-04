<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Add dependency validation and stable dependency order
- **Outcome:** feature-split.js has a dependencyOrder function that does a stable topological sort by dependsOn with proposal-order tie-break. It rejects unknown siblings and self-references, and it raises a FeatureSplitError on a dependency cycle.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-18
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add stable dependency ordering for proposal children

**Implementation notes:**

This task adds one function, `dependencyOrder(children)`, to `src/claude/scripts/feature-split.js`. It is the only dependency-ordering function in the design. `normaliseChild` (US-03-TASK-BE-01) has already defaulted `dependsOn` to an array, so the function can assume every child has `name` and `dependsOn`. The helper `fail(code, message, extra)` and the `FeatureSplitError` class come from the skeleton task (INFRA-TASK-BE-01). Do not redefine them.

The design's `dependencyOrder` only performs the topological sort. The outcome for this task also requires it to reject unknown siblings and self-references, so those checks move into the function itself. `validateProposal` may keep its own equivalent check; the two must agree on the error code `DEPENDS_ON_INVALID`.

Code to add (replaces the design's `dependencyOrder`):

```javascript
// Stable topological sort. Among children that are ready at the same time,
// proposal order decides (Requirements UC-03 tie-break).
// Rejects unknown siblings and self-references (DEPENDS_ON_INVALID) and cycles (PROPOSAL_CYCLE).
function dependencyOrder(children) {
  const names = new Set(children.map(c => c.name));
  for (const c of children) {
    for (const d of c.dependsOn) {
      if (d === c.name)
        fail('DEPENDS_ON_INVALID', `${c.name} depends on itself`, { key: c.name });
      if (!names.has(d))
        fail('DEPENDS_ON_INVALID', `${c.name} depends on unknown child "${d}"`, { key: c.name });
    }
  }
  const placed = new Set(), order = [], remaining = [...children];
  while (remaining.length) {
    // findIndex returns the first ready child in proposal order, so ties go to proposal order.
    const i = remaining.findIndex(c => c.dependsOn.every(d => placed.has(d)));
    if (i === -1) fail('PROPOSAL_CYCLE', 'Dependencies between children form a cycle');
    const [next] = remaining.splice(i, 1);
    placed.add(next.name);
    order.push(next);
  }
  return order;
}
```

Export it so the verification commands and the later dependency-order tests (US-03-TASK-TEST-02) can call it directly. Add `dependencyOrder` to the `module.exports` object. This is the only change to the export list.

Behaviour to confirm by hand:
- `[A, B(dependsOn A), C]` sorts to `A, B, C`.
- `[C(dependsOn A), B, A]` sorts to `B, A, C`. B is ready at the start and comes first in proposal order; C waits for A.
- `[A(dependsOn B), B(dependsOn A)]` throws `PROPOSAL_CYCLE`.
- A child that depends on itself throws `DEPENDS_ON_INVALID`, not `PROPOSAL_CYCLE`, because the self-reference check runs first.
- An unknown sibling throws `DEPENDS_ON_INVALID`.

No file other than `feature-split.js` is changed. The function writes nothing and has no side effects.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const {dependencyOrder}=require('./src/claude/scripts/feature-split.js'); const n=(name,d=[])=>({name,dependsOn:d}); const out=dependencyOrder([n('C',['A']),n('B'),n('A')]).map(c=>c.name).join(','); if(out!=='B,A,C') throw new Error('got '+out); console.log('order ok:', out)"
```

```
node -e "const {dependencyOrder}=require('./src/claude/scripts/feature-split.js'); const n=(name,d=[])=>({name,dependsOn:d}); try{dependencyOrder([n('A',['B']),n('B',['A'])]); throw new Error('no error')}catch(e){ if(e.code!=='PROPOSAL_CYCLE') throw e; console.log('cycle ok:', e.code)}"
```

```
node -e "const {dependencyOrder}=require('./src/claude/scripts/feature-split.js'); const n=(name,d=[])=>({name,dependsOn:d}); for (const bad of [[n('A',['A'])],[n('A',['Ghost'])]]) { try{dependencyOrder(bad); throw new Error('no error')}catch(e){ if(e.code!=='DEPENDS_ON_INVALID') throw e; } } console.log('invalid deps ok')"
```

```
npm test
```