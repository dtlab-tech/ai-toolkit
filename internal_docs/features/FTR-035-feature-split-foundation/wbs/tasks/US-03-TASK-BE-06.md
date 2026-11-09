<a id="task-US-03-TASK-BE-06"></a>
### US-03-TASK-BE-06

- **Task ID:** US-03-TASK-BE-06
- **Title:** Add and export editProposal
- **Outcome:** feature-split.js exports editProposal, which applies rename, set, reorder, owner, add, remove and merge edits to a copy and re-validates it. A refused edit leaves the caller's proposal unchanged, and a moved owner returns a warning without being refused. A merged child's purpose and summary are the merged children's purposes joined with ' / ', and its Keywords are their union. A remove never rewrites dependsOn: if a sibling still depends on the removed child, the edit is refused. Purpose, summary and keywords are editable, and no file is written.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-05
- **Acceptance criteria:** AC-15, AC-16, AC-17, AC-19, AC-20
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add editProposal

**Implementation notes:**

Target file: `src/claude/scripts/feature-split.js`. This file already contains the helpers from earlier tasks (`slugOf`, `normaliseChild`, `dependencyOrder`, `foundationWarnings`, `validateProposal`, `buildProposal`). Add `editProposal` after `buildProposal` and add it to `module.exports`. No sibling task builds an edit function, so there is no duplicate implementation.

Behaviour, from the Tech-Spec excerpt (D-09, D-10):
- Work on a deep copy, so a refused edit cannot change the caller's object. Any thrown `FeatureSplitError` leaves the caller's proposal untouched.
- Re-run `validateProposal(next)` after every edit. This includes the `minChildren` check (D-09), so removing a child below the minimum is refused.
- A moved owner (including `owner: null`) is not refused. It is reported through `foundationWarnings`, which carries the BR-03 message (D-10).
- Editable fields for `set` are `purpose`, `summary`, `keywords`, `assigned` and `dependsOn`. Any other field raises `EDIT_FIELD_INVALID`.
- Nothing calls `fs`. The edit does not call `isNewFeature` or any measure path (D-09).

Signature and algorithm:

```javascript
// op.type: rename | set | reorder | owner | add | remove | merge
// returns { proposal, warnings }; throws FeatureSplitError on refusal
function editProposal(proposal, op) {
  if (!op || typeof op !== 'object') fail('EDIT_UNKNOWN', 'An edit must be an object with a type');
  const next = JSON.parse(JSON.stringify(proposal));           // work on a copy only
  const byName = (n) => {
    const c = next.children.find(x => x.name === n);
    if (!c) fail('CHILD_NOT_FOUND', `No child named "${n}"`);
    return c;
  };
  const relink = (from, to) => {                               // rewrite references to a renamed or merged child
    for (const c of next.children)
      c.dependsOn = [...new Set(c.dependsOn.map(d => d === from ? to : d))].filter(d => d !== c.name);
    if (next.sharedFoundationOwner === from) next.sharedFoundationOwner = to;
  };
  switch (op.type) {
    case 'rename':
      byName(op.from).name = op.to;
      relink(op.from, op.to);
      break;
    case 'set': {
      if (!['purpose', 'summary', 'keywords', 'assigned', 'dependsOn'].includes(op.field))
        fail('EDIT_FIELD_INVALID', `Field ${op.field} cannot be edited`);
      const isList = op.field === 'keywords' || op.field === 'dependsOn';
      if (isList ? !Array.isArray(op.value) : typeof op.value !== 'string')
        fail('EDIT_VALUE_INVALID', `${op.field} must be ${isList ? 'an array' : 'a string'}`);
      byName(op.name)[op.field] = op.value;
      break;
    }
    case 'reorder': {                                          // must be a permutation of the current children
      const names = Array.isArray(op.names) ? op.names : [];
      const have = next.children.map(c => c.name).sort();
      const want = [...names].sort();
      if (want.length !== have.length || want.some((n, i) => n !== have[i]))
        fail('REORDER_NOT_PERMUTATION', 'reorder must list every child exactly once');
      next.children = names.map(byName);
      break;
    }
    case 'owner':
      next.sharedFoundationOwner = op.name ?? null;            // null is allowed; validated below
      break;
    case 'add':
      next.children.push(normaliseChild(op.child));
      break;
    case 'remove':
      next.children = next.children.filter(c => c.name !== op.name);
      // dependsOn is never rewritten on removal (Gate 1 decision): a sibling that still names the
      // removed child makes validateProposal refuse the edit, and the caller must edit dependsOn first.
      if (next.sharedFoundationOwner === op.name) next.sharedFoundationOwner = null;
      break;
    case 'merge': {
      const group = op.names.map(byName);
      const joined = group.map(c => c.purpose).filter(Boolean).join(' / ');   // Gate 1 decision: purposes joined with ' / '
      const merged = {
        name: op.into, purpose: joined, summary: joined,                         // summary is the one-line purpose (D-11)
        keywords: [...new Set(group.flatMap(c => c.keywords))],
        dependsOn: [...new Set(group.flatMap(c => c.dependsOn))].filter(d => !op.names.includes(d)),
        assigned: group.map(c => c.assigned).filter(Boolean).join('; '),
      };
      const at = next.children.findIndex(c => op.names.includes(c.name));  // first merged child keeps the slot
      next.children = next.children.filter(c => !op.names.includes(c.name));
      next.children.splice(at, 0, merged);
      for (const n of op.names) if (n !== op.into) relink(n, op.into);
      break;
    }
    default:
      fail('EDIT_UNKNOWN', `Unknown edit ${op.type}`);
  }
  validateProposal(next);                                      // names, dependsOn, owner, cycles, minChildren (D-09)
  return {
    proposal: next,
    warnings: next.children.length
      ? foundationWarnings(next, dependencyOrder(next.children))
      : [],                                                    // guard: foundationWarnings needs a first child
  };
}
```

Deviations from the excerpt's draft code, and why:
1. **`reorder` permutation check added.** The draft maps `op.names` without checking it. Omitting a child would silently drop it. The excerpt requires `reorder` to be a permutation, so the check is required.
2. **`set` value type check added.** Without it, a non-array `dependsOn` would throw a `TypeError` instead of a `FeatureSplitError`.
3. **Empty-children guard added.** `minChildren` may be 0, so `foundationWarnings` must not read `order[0]` from an empty list.

Refusal and warning rules to check while implementing:
- `remove` of a child that is the owner sets the owner to `null`. This is a warning, not a refusal.
- `remove` that leaves fewer than `minChildren` children is refused by `validateProposal` with `TOO_FEW_CHILDREN`.
- `rename` to an existing slug is refused with `CHILD_NAME_DUPLICATE`.
- A `dependsOn` cycle created by any edit is refused with `PROPOSAL_CYCLE`.

Length note: this task is one function plus its export. No estimate concern.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');if(typeof m.editProposal!=='function')process.exit(1)"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const p=m.buildProposal({source:'definition',children:[{name:'A'},{name:'B'}],config:{minChildren:2}}).proposal;try{m.editProposal(p,{type:'reorder',names:['A']});process.exit(1)}catch(e){if(e.code!=='REORDER_NOT_PERMUTATION')process.exit(1)}"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```