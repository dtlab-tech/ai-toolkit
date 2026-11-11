<a id="phase-INFRA"></a>
### INFRA

- **Phase ID:** INFRA
- **Type:** infrastructure
- **Source UC:** —
- **Title:** Shared infrastructure: read-only check-definition and validate-proposal commands in feature-split.js with unit tests
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add check-definition and validate-proposal commands to feature-split

**Context:**

This phase adds the two read-only facade commands that the define-feature agent calls at Phase 3a and in its edit loop. They are built first so that later phases can depend on a tested contract. check-definition is split into a pure evaluation core and its command wiring. validate-proposal is a thin wrapper over the existing FTR-035 editProposal and validateProposal. Unit tests follow each BE task. The phase has no sourceUC, so tasks cite no acceptance criteria.

**Tasks in this phase:**

- `INFRA-TASK-BE-01` — Add parseGrillingRecord and evaluateDefinition to feature-split.js
- `INFRA-TASK-BE-02` — Wire the check-definition command into feature-split.js
- `INFRA-TASK-BE-03` — Add the validate-proposal command to feature-split.js
- `INFRA-TASK-TEST-01` — Unit test checkDefinition evaluation and skip behaviour
- `INFRA-TASK-TEST-02` — Unit test check-definition errors and facade dispatch
- `INFRA-TASK-TEST-03` — Unit test the validate-proposal command

**Depends on phases:** none
