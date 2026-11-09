<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add child normalisation and child name validation
- **Outcome:** feature-split.js has a normaliseChild helper that sets summary equal to purpose and defaults keywords, dependsOn and assigned. It also has a name validation step that uses the slug rule to reject empty or non-string names and duplicate slugs with a FeatureSplitError that names the child.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-BE-03
- **Acceptance criteria:** AC-15, AC-19
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add child normalisation and name validation

**Implementation notes:**

Scope: add two exported helpers to `src/claude/scripts/feature-split.js`. This task does not change `loadConfig`, `isNewFeature`, `validateProposal`, `dependencyOrder` or the facade. Node built-ins only (D-01).

Gaps in the inputs (stated, not invented around):
- The excerpt does not give the exact export name or signature of the slug rule from INFRA-TASK-BE-03. The code below calls it `slug(name)`, which is an assumption. Confirm the name against that task's output before coding. It is expected to throw `FeatureSplitError` `INVALID_NAME` for reserved names, `..`, path separators and empty input.
- The excerpt's inline `slugOf` (used by the current `validateProposal` draft) is the pre-INFRA-BE-03 rule. Do not keep it for name checks here. Use the INFRA-BE-03 `slug` function.
- The excerpt's `normaliseChild` uses `c.summary ?? c.purpose`. The outcome for this task requires `summary` to equal `purpose` in all cases. This task follows the outcome. Flag the difference at review.
- AC-15 and AC-19 text is not in the excerpt. The mapping is taken from the skeleton, not verified against Requirements.

Duplicate check: no sibling task builds normalisation or name validation. US-03-TASK-BE-02 builds ordering, and US-03-TASK-BE-04 builds `validateProposal`. BE-04 should call `validateChildNames` in place of its inline name loop. Do not edit `validateProposal` in this task, because BE-04 is not a dependency.

**1. `normaliseChild`** (replaces the excerpt version):

```javascript
function normaliseChild(c) {
  const purpose = typeof c.purpose === 'string' ? c.purpose : '';
  return {
    name: c.name,
    purpose,
    summary: purpose,                                   // D-11 and this outcome: summary is always the purpose
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    dependsOn: Array.isArray(c.dependsOn) ? c.dependsOn : [],
    assigned: typeof c.assigned === 'string' ? c.assigned : '',
  };
}
```

**2. `validateChildNames`** (new). It runs the name step for every child and names the child in each error. It does not check dependencies, owners or counts.

```javascript
function validateChildNames(children) {
  const names = new Set(), slugs = new Set();
  for (const c of children) {
    const name = c.name;
    if (typeof name !== 'string' || name.trim() === '')
      fail('CHILD_NAME_INVALID', `Child name ${JSON.stringify(name)} is empty or not a string`, { key: String(name) });
    let s;
    try {
      s = slug(name);                                   // INFRA-TASK-BE-03 rule
    } catch (err) {
      fail('CHILD_NAME_INVALID', `Child "${name}" does not yield a valid folder slug: ${err.message}`, { key: name });
    }
    if (names.has(name) || slugs.has(s))
      fail('CHILD_NAME_DUPLICATE', `Child "${name}" duplicates slug "${s}"`, { key: name });
    names.add(name); slugs.add(s);
  }
}
```

Behaviour:
- Empty, whitespace-only or non-string names raise `CHILD_NAME_INVALID`.
- Names that the slug rule rejects raise `CHILD_NAME_INVALID`, and the child name is included.
- Two children that resolve to the same slug (for example `Auth` and `auth`) raise `CHILD_NAME_DUPLICATE`, and the second child's name is included.
- Error codes match the D-12 codes used in the Tech-Spec excerpt.

**3. Exports:** add `normaliseChild` and `validateChildNames` to `module.exports`. Test tasks (US-03-TASK-TEST-01) depend on them.

Length check: this file is a small addition. Do not add other behaviour.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const t=(f)=>{try{f();return 'ok'}catch(e){return e.code}};if(t(()=>m.validateChildNames([{name:''}]))!=='CHILD_NAME_INVALID')process.exit(1);if(t(()=>m.validateChildNames([{name:'Auth'},{name:'auth'}]))!=='CHILD_NAME_DUPLICATE')process.exit(1);const c=m.normaliseChild({name:'Auth',purpose:'Sign-in'});if(c.summary!=='Sign-in'||!Array.isArray(c.keywords)||!Array.isArray(c.dependsOn)||c.assigned!=='')process.exit(1)"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```