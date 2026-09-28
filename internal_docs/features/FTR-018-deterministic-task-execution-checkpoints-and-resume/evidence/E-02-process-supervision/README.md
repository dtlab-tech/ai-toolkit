# E-02 — Asynchronous process supervision (evidence)

All scripts here are deterministic and use only fake Node workers — **no LLM, zero cost**.
Containment: kills are always by explicit PID (`taskkill /PID <pid> /T /F`), never by image name.

## Scripts and what they prove

| Script | Proves | Status |
|---|---|---|
| `worker.js` | Fake worker that spawns a grandchild and idles (subject under test). | fixture |
| `harness-treekill-dedup.js` | (1) tree-kill via `taskkill /PID <worker> /T /F` terminates worker + grandchild; naive `child.kill('SIGTERM')` is environment-dependent (not guaranteed by the Windows API). (2) Resume dedup: with a worker **already registered** in `task.lock` (`worker_id = host:pid:startTime`), resume refuses replacement while the PID is alive and start-time matches, and allows it only after confirmed termination. | verified (reproduced 2026-09-22) |
| `naive3x.js` | Repeats the naive-SIGTERM case 3× to show the outcome is environment-dependent — motivating the mandatory explicit tree-kill. | verified |
| `harness-registration-window.js` + `OUTPUT-registration-window.txt` | **Crash-in-the-registration-window** (the gap identified 2026-09-22): coordinator crashes AFTER spawning a worker but BEFORE durable registration. Shows that a naive **lock-only** resume double-dispatches (2 live workers = hazard), while **intent-first + reconcile-by-tag** finds the live orphan and refuses the duplicate. | verified (new, 2026-09-22) |

## Registration-window result (from `OUTPUT-registration-window.txt`)

- Setup: intent written, worker spawned, coordinator "crash" → `lock present: false`, worker not yet self-registered.
- Resume A (naive, lock-only): `live tagged workers: 2 <-- DUPLICATE = HAZARD`.
- Resume B (intent-first + tag reconcile): `live tagged workers: 1` → `DO NOT dispatch duplicate` → `would dispatch duplicate? false`.
- Final: `live tagged workers: 0` (fully contained).

## Design consequence for FTR-018

Durable `task.lock` alone is insufficient during the spawn→registration window. The executor must
(a) persist a dispatch **intent** (with a unique task tag) **before** spawning, (b) tag the worker so
it is discoverable by that tag even before it self-registers, and (c) on resume, **reconcile by tag**
before dispatching — never treat "no lock" as "no worker". Windows discovery uses
`Get-CimInstance Win32_Process` command-line matching; POSIX would use the process group / a pgid tag.
