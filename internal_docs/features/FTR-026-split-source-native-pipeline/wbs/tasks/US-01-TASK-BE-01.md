<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Recompute the Gate 1 docs digest from split sources, in-memory
- **Outcome:** pm-phase2.js gains reqIndexPath/specIndexPath local consts (hasReq/hasSpec-detected, falling back to the legacy monolithic paths); the Gate 1 digest re-check recomputes currentDigest from in-memory req-assembler.js/tech-spec-assembler.js subprocess output instead of c.read(file('Requirements.md'))/c.read(file('Tech-Spec.md'))
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-02
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** pm-phase2
- **Commit subject:** recompute Gate 1 docs digest from split sources in-memory

**Implementation notes:**

Replace the `bridge-requirements-tech-spec` activity's existence-detection logic and the digest re-check block (today's `src/claude/workflows/pm-phase2.js` lines 195-232) with inline local constants and an in-memory recomputation. Do NOT delete the bridge activity itself in this task — US-05-TASK-INFRA-01 does that, once US-02/US-03/US-04 no longer need it. For this task, only the digest re-check changes; leave the bridge activity's own file-writing behavior as-is for now (other call sites still read `file('Requirements.md')`/`file('Tech-Spec.md')` until later tasks repoint them).

```js
// New local consts, computed once near the top of c.run()'s body:
const reqDir = `${featureDir}/req`, specDir = `${featureDir}/spec`
const hasReq = c.exists(`${reqDir}/index.md`), hasSpec = c.exists(`${specDir}/index.md`)
const reqIndexPath = hasReq ? `${reqDir}/index.md` : file('Requirements.md')
const specIndexPath = hasSpec ? `${specDir}/index.md` : file('Tech-Spec.md')

// Gate 1 digest re-check — replaces:
//   const currentDigest = c.hash(c.read(file('Requirements.md')) + '\u0000' + c.read(file('Tech-Spec.md')))
// with:
const assembledRequirements = hasReq
  ? c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
  : c.read(file('Requirements.md'))
const assembledTechSpec = hasSpec
  ? c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
  : c.read(file('Tech-Spec.md'))
const currentDigest = c.hash(assembledRequirements + '\u0000' + assembledTechSpec)
// ...the digestMatch comparison below this is unchanged.
```

The bridge activity (still present after this task) keeps writing `file('Requirements.md')`/
`file('Tech-Spec.md')` to disk for the OTHER call sites that haven't been repointed yet (US-02's
semantic validator, US-03's skeleton agent, US-04's per-task prompt) — this task only stops the
Gate 1 digest check itself from depending on that write.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "digest"
```
