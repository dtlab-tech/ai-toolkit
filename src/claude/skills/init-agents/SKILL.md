---
description: "Init AGENTS.md — analyzes the current project and generates the AGENTS.md convention file required by all developer agents. Usage: /init-agents [path-to-project-root]"
argument-hint: "[path-to-project-root]"
disable-model-invocation: true
---

Spawn the `init-agents-md` agent with the arguments provided by the user:

```
subagent_type: init-agents-md
prompt: [path-to-project-root]
```

Pass the exact arguments the user typed after `/init-agents` as the prompt to the agent. If no path was provided, pass the current working directory. Do not add anything else.
