<a id="task-US-02-TASK-INFRA-01"></a>
### US-02-TASK-INFRA-01

- **Task ID:** US-02-TASK-INFRA-01
- **Title:** Create the /assemble-docs command
- **Outcome:** src/claude/commands/assemble-docs.md exists, mirroring check-docs.md/feature-status.md's shape: locates the feature folder from $ARGUMENTS, extracts the prefix, determines 'which' from the second argument (default all), runs node .claude/scripts/assemble-docs.js <feature-dir> <prefix> <which> via Bash, and reports exactly what was written or surfaces the script's error verbatim
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add /assemble-docs command wrapping assemble-docs.js

**Implementation notes:**

Thin wrapper, no logic of its own beyond argument parsing and reporting — `allowed-tools: Bash,
Glob, Read`, same shape as `check-docs.md`. State explicitly in the command body that this is a
read-only rendering action that never affects Gate 1/Gate 2, approvals, or any digest, so a user
invoking it has no doubt about its safety at any point in the pipeline.

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/asset-catalog.test.js
```
