<a id="phase-INFRA"></a>
### INFRA

- **Phase ID:** INFRA
- **Type:** infrastructure
- **Source UC:** —
- **Title:** Shared infrastructure setup: default configuration file, feature-split.js skeleton with FeatureSplitError and facade contract, slug rule, registry read and temp-and-rename write helpers, staging leftover scan
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** feature-split shared infrastructure

**Context:**

This phase lays down the shared base that every later feature-split phase (loader, isNewFeature, proposal, apply, register) builds on. It creates the default configuration file, the feature-split.js skeleton with FeatureSplitError and the one-JSON-object facade contract, and the low-level helpers: slug rule, registry read, temp-and-rename write and staging leftover scan. The helpers are independent of each other and depend only on the skeleton.

**Tasks in this phase:**

- `INFRA-TASK-INFRA-01` — Create toolkit default feature-split configuration file
- `INFRA-TASK-BE-01` — Create feature-split.js skeleton with FeatureSplitError class
- `INFRA-TASK-BE-02` — Add facade entry point with single-JSON stdout and exit contract
- `INFRA-TASK-BE-03` — Add folder slug rule function
- `INFRA-TASK-BE-04` — Add registry read and entry parse helper
- `INFRA-TASK-BE-05` — Add registry temp-and-rename write helper
- `INFRA-TASK-BE-06` — Add first-sentence summary helper
- `INFRA-TASK-BE-07` — Add staging leftover scan helper
- `INFRA-TASK-TEST-01` — Add tests for infrastructure helpers and facade contract

**Depends on phases:** none
