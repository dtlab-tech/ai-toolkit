---
description: "Implement Feature — starts the full feature delivery pipeline (requirements → tech-spec → approval → work breakdown → implementation → review → PR). Usage: /implement-feature <path-to-feature.md> [--force]"
---

Spawn the `project-manager` agent with the arguments provided by the user:

```
subagent_type: project-manager
prompt: <path-to-feature.md> [--force]
```

Pass the exact arguments the user typed after `/implement-feature` as the prompt to the agent. Do not add anything else.
