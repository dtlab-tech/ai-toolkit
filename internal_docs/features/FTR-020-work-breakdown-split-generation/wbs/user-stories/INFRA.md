<a id="phase-INFRA"></a>
### INFRA

- **Phase ID:** INFRA
- **Type:** infrastructure
- **Source UC:** —
- **Title:** Shared graph-check extraction and directory-format assembler
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** shared wbs-split infrastructure

**Context:**

This phase builds the two foundational modules every other phase depends on:
`wb-graph-checks.js` (the 11 structural checks, reusable both inside `wb-validate.js` and in
`pm-phase2.js`'s pre-dispatch gate — see US-02/US-04) and `wbs-assembler.js` (the directory/legacy
loader plus task/phase detail parse+render functions, used by `wb-validate.js` and `wb-render.js`
— see US-02/US-05). Nothing here touches `wb-validate.js` or `wb-render.js` themselves yet; that
wiring happens once these two modules exist and are unit-tested, so a failure in the wiring step
can never be confused with a failure in the extracted logic itself.

**Tasks in this phase:**

- `INFRA-TASK-BE-01` — extract 11 skeleton-answerable checks into `wb-graph-checks.js`
- `INFRA-TASK-TEST-01` — unit tests for `wb-graph-checks.js`
- `INFRA-TASK-BE-02` — create `wbs-assembler.js` (loader + task/phase detail codec)
- `INFRA-TASK-TEST-02` — unit tests for `wbs-assembler.js`

**Depends on phases:** none (this is the foundational phase; everything else depends on it)
