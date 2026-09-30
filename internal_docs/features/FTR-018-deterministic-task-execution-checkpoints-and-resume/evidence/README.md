# FTR-018 — Gate 1 runtime evidence dossier

Reproducible scripts and captured outputs for the two Gate-1 runtime blockers, moved out of
`%TEMP%` into the feature dossier so they survive temp cleanup. Recorded 2026-09-20/21;
audited and supplemented 2026-09-22.

## Contents

- `E-01-agent-provenance/` — exact-verified-agent execution. Retained paid-run outputs
  (`out-alpha/beta/B.json`), inputs (`agents.json`, `nonce.txt`), persisted worktree marker,
  the commands as run (`commands-as-run.sh`, **do not re-run without budget authorization**),
  and `README.md` documenting an **open provenance-binding gap (Case 2)** plus a proposed
  isolated proof that is **not yet executed**.
- `E-02-process-supervision/` — deterministic process-supervision spikes (no LLM):
  tree-kill + registered-worker dedup (`harness-treekill-dedup.js`), and the new
  crash-in-the-registration-window proof (`harness-registration-window.js` +
  `OUTPUT-registration-window.txt`). See its `README.md`.

## Data-handling note

The E-01 JSON outputs were scanned for credential/secret patterns before inclusion; none were
found. They contain only usage/cost/model metadata and ephemeral session/uuid identifiers — no
API keys, tokens, or passwords. No authentication material is stored in this dossier.

## Status summary (updated 2026-09-28)

- **E-02**: tree-kill, registered-worker dedup, and the registration-window hazard/mitigation are
  all verified and reproducible at zero cost. **Qualified for Windows only** (mechanism `taskkill /T`,
  PowerShell start-time / cmdline tag); POSIX `kill(-pgid)` is designed but **not** tested here.
- **E-01**: **provenance binding CLOSED 2026-09-28.** The isolated proof ran once (hard cap $0.03,
  actual $0.01727565, no retry). Isolation was verified **without any LLM** via claude.exe's `--debug`
  ground truth (env-var isolation was disproven). claude.exe declares it loads the userSettings
  `gaia-developer-backend.md` (sha256 `7457e83…`, unchanged before/after; managed dir ENOENT, plugins 0,
  single source); the agent executed with schema-valid output on sonnet. Residual limit: worktree
  persistence was NOT reproduced in this run (Write permission-denied in the isolated temp cwd) — it
  remains proven by the original Test B and is orthogonal to the binding. Gate 1 is re-presented with
  this result and is **not** auto-approved.
