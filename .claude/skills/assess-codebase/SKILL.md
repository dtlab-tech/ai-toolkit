---
description: "Assess Codebase — starts the full codebase assessment pipeline (parallel assessment → findings consolidation → intervention documents → approval gate → remediation → review → PR). Usage: /assess-codebase [path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
argument-hint: "[path] [--scope=architecture,security,quality,concurrency,devops] [--force]"
disable-model-invocation: true
---

Spawn the `assessment-manager` agent with the arguments provided by the user:

```
subagent_type: assessment-manager
prompt: <path> [--scope=...] [--force]
```

If no path is provided, use `.` (current working directory).

Pass the exact arguments the user typed after `/assess-codebase` as the prompt to the agent. Do not add anything else.
