<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add pm-phase2.js's Requirements/Tech-Spec bridge step
- **Outcome:** pm-phase2.js gains a new c.activity('bridge-requirements-tech-spec', ...) at its own entry, before the existing Gate 1 approval check: if req/ or spec/ exists for this feature, it assembles (same req-assembler.js/tech-spec-assembler.js subprocess calls) and writes {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md; if neither split directory exists, it leaves any pre-existing legacy monolithic files untouched and does nothing
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-05, AC-06
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add pm-phase2.js bridge step assembling Requirements/Tech-Spec from split sources

**Implementation notes:**

Depends on US-01-TASK-BE-01 (not the whole US-01 phase) because this step only needs `pm-phase1.js`
to no longer write the monolithic files for the bridge step's necessity to make sense — it does not
depend on US-01's in-memory/digest changes. Define `reqDir`/`specDir` the same way `pm-phase1.js`
does (`${featureDir}/req`, `${featureDir}/spec`). The new activity: if neither directory exists,
return `{ bridged: false, reason: 'legacy (no split sources)' }` and do nothing further; otherwise
run the same two `c.command(['run-asset', 'scripts/req-assembler.js'/'tech-spec-assembler.js', ...])`
calls `pm-phase1.js` used to make and `c.writeOutput` their stdout to `file('Requirements.md')`/
`file('Tech-Spec.md')`. Place this activity immediately after path resolution, strictly before the
existing Gate 1 approval/digest check — that check re-hashes these same two files, so it must see
the freshly-bridged content, not a stale previous run's copy.

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase2-source.test.js
```

```
node --check src/claude/workflows/pm-phase2.js
```
