---
description: "Define Feature — reads existing repo context, then grills only on the real gaps and writes feature.md in docs/features/FTR-XXX-slug/. Usage: /define-feature [source reference]"
disable-model-invocation: true
---

Spawn the `define-feature` agent, passing through whatever the user provided as a source reference (a backlog entry, ticket path, spec path, or free-text description). If the user gave nothing, pass an empty source.

```
subagent_type: define-feature
prompt: |
  Start the feature definition session.
  Source reference (may be empty): {{user arguments verbatim}}
```

The agent runs Phase 0 (context ingestion) first — it reads AGENTS.md, the source reference, existing feature docs, and the relevant code, then pre-fills a draft and grills ONLY on the genuine gaps. Do not add instructions telling it to skip discovery.
