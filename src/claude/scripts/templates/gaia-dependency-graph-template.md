<!--
DEPENDENCY GRAPH TEMPLATE — developer-plan/dependency-graph.md

STATUS (as of FTR-025): reference/design-only. No generator currently produces this file — grep
for "dependency-graph"/"dependencyGraph" across lib/ and src/claude/ turns up nothing that writes
it. Kept here, moved and renamed alongside the other six templates, for whenever the
developer-plan/dependency-graph.md concept is actually implemented; do not assume it is wired into
any real pipeline today.

Human-readable companion to developer-plan/plan.json, produced BY THE SAME GENERATOR that writes
plan.json — never hand-authored per feature, and never a place to restate plan.json's own arrays.
This file is pure output: nothing reads it back programmatically (unlike the wbs/ task and phase
templates, there is no parsing contract here — delete this whole comment block in a generated
instance, there is nothing downstream to keep honest).

Structure, in this fixed order: (1) a one-line pointer note, (2) the Mermaid dependency graph —
the ONLY data visualization this file keeps, because a diagram is a genuinely different
representation of plan.json's `readyQueue[].dependsOn`, not the same facts reformatted as another
table, (3) a fixed "Sequence and waves" section that explicitly refuses to reprint
`readyQueue`/`phaseWaves` as Markdown tables, (4) a fixed "Integrity" section. An earlier draft of
this file DID reprint the ready-queue and phase-waves as tables and was reverted after review —
same facts in two places drifts the moment plan.json regenerates and this file doesn't. Do not
reintroduce those tables.

Placeholders:
  {FEATURE}      feature ID, e.g. FTR-020
  {PHASE_ID}     a phase ID from plan.json's phases[].id
  {TASK_ID}      a task ID from plan.json's readyQueue[].id
  {NODE_ID}      {TASK_ID} with every hyphen removed/underscored so it's a legal Mermaid node
                 name (Mermaid node IDs can't contain hyphens) — drop the phase prefix once the
                 node already lives inside that phase's subgraph, drop the literal "TASK", keep
                 it short and unique within the subgraph (e.g. US-02-TASK-BE-01 -> US02_BE01)
  {sourceDigest} plan.json's own sourceDigest value, copied verbatim, including the "sha256:"
                 prefix
-->

# {FEATURE} — Dependency Graph & Implementation Sequence

> Human-readable companion to [`plan.json`](plan.json) — the machine-readable file is
> authoritative; this is a rendered view of the same data, regenerated alongside it, never
> hand-edited independently (same convention as `{PREFIX}-Work-Breakdown.md` being generated
> from the JSON it describes — see `wb-render.js`).

## Dependency graph

<!--
One `subgraph {PHASE_ID}` block per phase, in plan.json's phases[] order, listing that phase's
own taskIds as Mermaid nodes ({NODE_ID}[{TASK_ID}]). Below every subgraph block, one
`{FROM_NODE_ID} --> {TO_NODE_ID}` edge per (task, dependency) pair found by walking every
readyQueue[].dependsOn entry — one edge per dependency, not one edge per task (a task with 3
entries in dependsOn gets 3 edges). Edge order: by readyQueue[].sequence, then by the order the
dependency appears inside that task's own dependsOn array. A task with an empty dependsOn
contributes no edges, only its node.
-->

```mermaid
graph TD
  subgraph {PHASE_ID}
    {NODE_ID}[{TASK_ID}]
  end

  {FROM_NODE_ID} --> {TO_NODE_ID}
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

- **Source digest:** `{sourceDigest}` — computed over every file under `wbs/` (sorted by
  relative path, each length-prefixed before hashing, same technique as
  `lib/task-executor/plan.js`'s own `_computePlanDigest`, extended from "two byte blobs" to
  "every file in a directory"). A re-run of the same computation against the current `wbs/`
  must reproduce this exact value, or this plan is stale and must be regenerated before
  implementation proceeds — mirrors `plan.js`'s existing resume-safety contract, made an
  explicit, reviewable file instead of an internal runtime-only check.
- Per-task and per-phase checksums in `plan.json` let a drift check point at the *specific*
  file that changed, not just "something changed somewhere."
