---
description: "Install Toolkit — copies all agents, skills, commands, and procedures from this toolkit into a destination project. Usage: /install-toolkit [path-to-destination] [--force] — defaults to current working directory"
---

Spawn the `install-toolkit` agent with the arguments provided by the user:

```
subagent_type: install-toolkit
prompt: <path-to-destination> [--force]
```

If the user provided no path, pass the current working directory as the destination. Pass any `--force` flag as-is. Do not add anything else.
