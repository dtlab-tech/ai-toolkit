<a id="task-US-03-TASK-BE-04"></a>
### US-03-TASK-BE-04

- **Task ID:** US-03-TASK-BE-04
- **Title:** Add validateProposal with source and minChildren checks
- **Dependencies:** US-03-TASK-BE-02, US-01-TASK-BE-03
- **Acceptance criteria:** AC-14, AC-15, AC-16
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add proposal validation with minChildren check

**Implementation notes:**

Add one internal function, `validateProposal(p, { checkMin = true } = {})`, to `src/claude/scripts/feature-split.js`. It is not added to `module.exports`, because the design's export list does not include it. `buildProposal` and `editProposal` are its only callers. The function raises `FeatureSplitError` through the module's `fail` helper and never returns a value on failure.

Dependencies already in the file, which this task calls and does not re-implement:
- `FeatureSplitError` and `fail(code, message, extra)` (INFRA-TASK-BE-01).
- `slugOf(name)`, the folder-slug helper used by the design. It returns `''` for an unusable name.
- `dependencyOrder(children)` (US-03-TASK-BE-02). It throws `PROPOSAL_CYCLE` on a cycle, so cycle detection is delegated to it.
- `meetsMinimum(count, minimum)` (US-01-TASK-BE-03). The design uses an inline `<`, so the minimum check should call `meetsMinimum` to keep one comparison rule (D-05).

Note on overlap: US-03-TASK-BE-01 provides a name-validation step. If that step is exposed as a named helper, call it from the name loop below instead of copying it. If it is only inline code, use the loop below and leave BE-01's step as it is. Either way, this function owns the aggregate check and the single error contract.

Code to add (before `buildProposal`):

```javascript
function validateProposal(p, { checkMin = true } = {}) {
  // AC-14: source must be one of the two checkpoint kinds.
  if (!['definition', 'measured'].includes(p.source))
    fail('PROPOSAL_SOURCE_INVALID', 'source must be "definition" or "measured"');

  // AC-15: child count against minChildren. Skipped in late mode (D-16).
  if (checkMin && !meetsMinimum(p.children.length, p.minChildren))
    fail('TOO_FEW_CHILDREN', `${p.children.length} children; minimum is ${p.minChildren}`);

  // AC-16: names. Each must be a non-empty string that yields a slug, and slugs must be unique.
  const names = new Set(), slugs = new Set();
  for (const c of p.children) {
    if (typeof c.name !== 'string' || !slugOf(c.name))
      fail('CHILD_NAME_INVALID', `Child name ${JSON.stringify(c.name)} does not yield a folder slug`);
    const slug = slugOf(c.name);
    if (names.has(c.name) || slugs.has(slug))
      fail('CHILD_NAME_DUPLICATE', `Two children resolve to slug "${slug}"`);
    names.add(c.name); slugs.add(slug);
  }

  // dependsOn: every reference names another sibling, never the child itself.
  for (const c of p.children) for (const d of c.dependsOn)
    if (!names.has(d) || d === c.name)
      fail('DEPENDS_ON_INVALID', `${c.name} depends on unknown or self child "${d}"`);

  // Owner: null (no owner yet) or the name of a sibling.
  if (p.sharedFoundationOwner !== null && !names.has(p.sharedFoundationOwner))
    fail('OWNER_INVALID', `Shared-foundation owner "${p.sharedFoundationOwner}" is not a child`);

  // Cycles: dependencyOrder throws PROPOSAL_CYCLE.
  dependencyOrder(p.children);
}
```

Behaviour to confirm:
- The function returns `undefined` on success and throws on the first failing rule, in the order above.
- `sharedFoundationOwner` must be `null` or a sibling name. `undefined` is treated as invalid, so callers must set `null` first, as `buildProposal` does.
- `checkMin: false` is used only by the late-mode path in `apply`, which validates a single child with no `minChildren` requirement.
- No file is written and the input is not mutated.

Error messages must name the child or the offending value, so the facade's `{ error: { code, message, key, file } }` output is useful to the caller.

Length is about 45 lines of code. No change to the exports, to `buildProposal`, or to `editProposal` is needed. Their call sites already invoke `validateProposal` as specified.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```