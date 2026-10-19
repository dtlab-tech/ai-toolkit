# FTR-020 — Dependency Graph & Implementation Sequence

> Human-readable companion to [`plan.json`](plan.json) — the machine-readable file is
> authoritative; this is a rendered view of the same data, regenerated alongside it, never
> hand-edited independently (same convention as `{PREFIX}-Work-Breakdown.md` being generated
> from the JSON it describes — see `wb-render.js`).

## Dependency graph

```mermaid
graph TD
  subgraph INFRA
    INFRA_BE01[INFRA-TASK-BE-01]
    INFRA_TEST01[INFRA-TASK-TEST-01]
    INFRA_BE02[INFRA-TASK-BE-02]
    INFRA_TEST02[INFRA-TASK-TEST-02]
  end
  subgraph US-01
    US01_INFRA01[US-01-TASK-INFRA-01]
  end
  subgraph US-02
    US02_BE01[US-02-TASK-BE-01]
    US02_BE02[US-02-TASK-BE-02]
    US02_TEST01[US-02-TASK-TEST-01]
  end
  subgraph US-03
    US03_INFRA01[US-03-TASK-INFRA-01]
  end
  subgraph US-05
    US05_BE01[US-05-TASK-BE-01]
    US05_TEST01[US-05-TASK-TEST-01]
  end
  subgraph US-04
    US04_BE01[US-04-TASK-BE-01]
    US04_BE02[US-04-TASK-BE-02]
    US04_BE03[US-04-TASK-BE-03]
    US04_BE04[US-04-TASK-BE-04]
    US04_TEST01[US-04-TASK-TEST-01]
  end

  INFRA_BE01 --> INFRA_TEST01
  INFRA_BE02 --> INFRA_TEST02
  INFRA_BE01 --> US02_BE01
  INFRA_BE02 --> US02_BE02
  US02_BE01 --> US02_BE02
  US02_BE01 --> US02_TEST01
  US02_BE02 --> US02_TEST01
  INFRA_BE02 --> US05_BE01
  US05_BE01 --> US05_TEST01
  US01_INFRA01 --> US04_BE01
  INFRA_BE02 --> US04_BE01
  INFRA_BE01 --> US04_BE02
  US04_BE01 --> US04_BE02
  US03_INFRA01 --> US04_BE03
  US04_BE02 --> US04_BE03
  US02_BE02 --> US04_BE04
  US05_BE01 --> US04_BE04
  US04_BE03 --> US04_BE04
  US04_BE04 --> US04_TEST01
```

## Sequence and waves

The dispatch order (`readyQueue`), the per-task dependencies (`dependsOn`), and the phase
waves (`phaseWaves`) are **not repeated here** — they already exist as structured data in
[`plan.json`](plan.json) and reprinting them as a Markdown table would just be the same facts
in a second place, free to drift the moment `plan.json` is regenerated and this file isn't.
Read them straight from there; the Mermaid diagram above is the only rendering kept in this
file, because it's a genuinely different representation (visual graph) rather than the same
rows reformatted.

## Integrity

- **Source digest:** `sha256:83faa4e68c8d4a1f5ed4d1bdef2605ee5934541e779ccdb42f2a7d988a2cbb7e` —
  computed over every file under `wbs/` (sorted by relative path, each length-prefixed before
  hashing, same technique as `lib/task-executor/plan.js`'s own `_computePlanDigest`, extended
  from "two byte blobs" to "every file in a directory"). A re-run of the same computation
  against the current `wbs/` must reproduce this exact value, or this plan is stale and must be
  regenerated before implementation proceeds — mirrors `plan.js`'s existing resume-safety
  contract, made an explicit, reviewable file instead of an internal runtime-only check.
- Per-task and per-phase checksums in `plan.json` let a drift check point at the *specific*
  file that changed, not just "something changed somewhere."
