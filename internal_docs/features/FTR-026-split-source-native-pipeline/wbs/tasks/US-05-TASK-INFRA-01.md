<a id="task-US-05-TASK-INFRA-01"></a>
### US-05-TASK-INFRA-01

- **Task ID:** US-05-TASK-INFRA-01
- **Title:** Remove the now-dead bridge-requirements-tech-spec step
- **Outcome:** pm-phase2.js's bridge-requirements-tech-spec activity (and the automatic file('Requirements.md')/file('Tech-Spec.md') writes it performed) is deleted entirely; no call site in this file depends on an assembled monolithic file existing on disk for a real-split feature
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-02, US-02-TASK-BE-01, US-03-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** refactor
- **Commit scope:** pm-phase2
- **Commit subject:** remove the now-dead bridge-requirements-tech-spec step

**Implementation notes:**

Delete the entire `await c.activity('bridge-requirements-tech-spec', async () => { ... })`
block from `src/claude/workflows/pm-phase2.js` (today's lines 195-212) — confirmed by `grep -rn
"bridge-requirements-tech-spec"` during FTR-026's own Tech-Spec phase that no other file references
this activity name, so removal is safe. By this point, `reqIndexPath`/`specIndexPath`/`hasReq`/
`hasSpec` are already computed as plain local consts (US-01-TASK-BE-01) and every call site that used
to need the bridge's file writes has been repointed (US-01-TASK-BE-02, US-02-TASK-BE-01,
US-03-TASK-BE-01, US-04-TASK-BE-01) — nothing left reads `file('Requirements.md')`/
`file('Tech-Spec.md')` for a real-split feature. A legacy feature (no `req/`/`spec/`) is unaffected:
`hasReq`/`hasSpec` are both false, so `reqIndexPath`/`specIndexPath` already resolve to the
existing monolithic paths without any bridge step ever having been needed.

**Verification commands:**

```
npm test -- tests/integration/workflow-runtime.test.js -t "bridge"
```
