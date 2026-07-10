# Procedure: Process Log

The Project Manager maintains `{PREFIX}-process-log.txt` in the same directory as `feature.md`.

## Rules

- **Create or append** at the start of every run — never overwrite previous runs
- **Log every significant event** with an ISO timestamp
- **Token tracking**: after every agent call, extract `subagent_tokens` and `duration_ms` from the `<usage>` block. Log immediately and accumulate in an internal token ledger keyed by `agent-name + scope`

## Format

```
════════════════════════════════════════════════════════
RUN STARTED — 2026-06-12T09:01:23
Feature: FTR-001 — [Feature Title]
════════════════════════════════════════════════════════
[2026-06-12T09:01:23] Discovery complete — N agents found, prefix: FTR-001
[2026-06-12T09:01:24] State: FTR-001-Requirements.md (fresh), FTR-001-Tech-Spec.md (missing)
[2026-06-12T09:01:25] Agent START: generate-tech-spec (FTR-001)
[2026-06-12T09:03:41] Agent DONE:  generate-tech-spec (FTR-001) — tokens: 21330, duration: 3m 28s
[2026-06-12T09:03:42] Agent START: validate-feature-docs (FTR-001)
[2026-06-12T09:05:10] Agent DONE:  validate-feature-docs (FTR-001) — tokens: 9210, duration: 1m 54s
[2026-06-12T09:05:11] APPROVAL REQUESTED
[2026-06-12T09:06:02] APPROVAL GRANTED by user
[2026-06-12T09:08:15] RUN COMPLETE
════════════════════════════════════════════════════════
```
