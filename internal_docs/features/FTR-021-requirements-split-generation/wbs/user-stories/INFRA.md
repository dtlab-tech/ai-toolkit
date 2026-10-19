<a id="phase-INFRA"></a>
### INFRA

- **Phase ID:** INFRA
- **Type:** infrastructure
- **Source UC:** —
- **Title:** Shared self-consistency check module
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** shared req-split structural check infrastructure

**Context:**

This phase builds the one foundational module every other phase depends on:
`req-graph-checks.js`, the 4 pure self-consistency check functions reused by `req-skeleton-check.js`
(US-05) directly, and indirectly by `pm-phase1.js`'s pre-dispatch gate (US-04). Unlike FTR-020's
INFRA phase, there is no assembler-codec module here too — `req-assembler.js` (US-02) has no
shared foundation with these checks (textual reassembly vs. table-reference validation are
unrelated concerns), so it is its own phase instead of living in INFRA.

**Tasks in this phase:**

- `INFRA-TASK-BE-01` — create `req-graph-checks.js` (4 pure self-consistency check functions)
- `INFRA-TASK-TEST-01` — unit tests for `req-graph-checks.js`

**Depends on phases:** none (this is the foundational phase; US-05 depends on it)
