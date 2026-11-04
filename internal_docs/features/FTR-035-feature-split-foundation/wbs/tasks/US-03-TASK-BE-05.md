<a id="task-US-03-TASK-BE-05"></a>
### US-03-TASK-BE-05

- **Task ID:** US-03-TASK-BE-05
- **Title:** Add and export buildProposal
- **Outcome:** feature-split.js exports buildProposal, which returns { proposal, warnings } in the D-08 shape with minChildren from the config. It defaults the owner to the first child in dependency order, keeps caller-supplied keywords, and writes no file.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-03, US-03-TASK-BE-04
- **Acceptance criteria:** AC-14, AC-19, AC-20
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add buildProposal

**Implementation notes:**

This task adds one function to `src/claude/scripts/feature-split.js` and exports it. It does not change any other function. The helpers it needs come from earlier tasks: `normaliseChild` (US-03-TASK-BE-01), `dependencyOrder` (BE-02), `foundationWarnings` and `validateProposal` (BE-03 and BE-04). Place the function after `validateProposal` and before `editProposal`, which is US-03-TASK-BE-06.

The function, as given in the Tech-Spec design:

```javascript
function buildProposal({ source, children, sharedFoundationOwner, foundationNote = '', config }) {
  const list = children.map(normaliseChild);
  const proposal = {
    source, children: list,
    sharedFoundationOwner: null, foundationNote, minChildren: config.minChildren,
  };
  validateProposal(proposal);                       // first pass: owner is null, so it is skipped
  const order = dependencyOrder(list);
  proposal.sharedFoundationOwner = sharedFoundationOwner === undefined ? order[0].name : sharedFoundationOwner;
  validateProposal(proposal);                       // second pass: checks the owner
  return { proposal, warnings: foundationWarnings(proposal, order) };
}
```

Behaviour the code must keep:
- `minChildren` comes from the `config` argument (the object returned by `loadConfig`). The function does not read the config file itself.
- Keywords are kept because `normaliseChild` copies `keywords` through. The function never replaces them.
- The owner defaults to `order[0].name`, the first child in dependency order. Only an `undefined` owner triggers the default. An explicit `null` is kept as `null`, and that produces a `FOUNDATION_NOT_FIRST` warning that says "no child".
- The function calls no `fs` method. Nothing is written.
- Export it: add `buildProposal` to the `module.exports` object. Keep the existing names.

Open point, not decided by the excerpt: if `children` is empty and `config.minChildren` is 0, `dependencyOrder` returns `[]`, and `order[0].name` in the owner default throws a `TypeError` rather than a `FeatureSplitError`. The implementer should stop and raise this at review. Do not invent an error code for it here.

Acceptance criteria AC-14, AC-19 and AC-20 are not quoted in the excerpt. The mapping from these IDs to this function is taken from the component's Addresses column and has not been checked against Requirements.

Sanity check against sample data: with children `[Billing (dependsOn Auth), Auth]`, dependency order is `[Auth, Billing]`, so the owner defaults to `Auth` and there are no warnings.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const l=require('./src/claude/scripts/feature-split.js');const r=l.buildProposal({source:'definition',children:[{name:'Billing',dependsOn:['Auth'],keywords:['billing']},{name:'Auth',keywords:['auth']}],config:{minChildren:2},foundationNote:'x'});if(r.proposal.sharedFoundationOwner!=='Auth'||r.warnings.length!==0||r.proposal.children[1].keywords[0]!=='billing'||r.proposal.minChildren!==2)process.exit(1);console.log('ok')"
```

```
npm test
```