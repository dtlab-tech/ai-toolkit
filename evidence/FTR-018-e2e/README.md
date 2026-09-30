# FTR-018 real-runtime E2E evidence (US-09-TASK-TEST-02)

Authorized under `FTR-018-Approvals.md` Approval History cycles 7 and 8 (2026-09-30). Real,
paid `claude.exe` calls against the actual runtime bridge (Percorso C), run against an isolated,
throwaway single-task fixture repo — never this project's own repository, never the fake CLI
fixture used by every other test in this feature.

## Outcome: PARTIAL

Two real dispatch attempts were made, both via `lib/task-executor/index.js`'s real
`dispatchTaskAttempt`, against a deliberately trivial single-task fixture (create one file
exporting one function returning a fixed string). Neither attempt completed the task — both hit
`budget_exhausted` before finishing. Closed as partial evidence per explicit user decision after
the second attempt; no further real calls were made.

See `run-manifest.json` for the full structured record (authorization history, both attempts'
observed cost/duration/turns, and the findings below).

## What this evidence does and does not prove

**Proves (real, observed):**
- The runtime bridge itself works end-to-end: `spawnClaudeAgent` really spawns `claude.exe`,
  resolves `--agent gaia-developer-backend`, feeds the prompt via stdin, captures a real
  structured JSON result (`is_error`, `terminal_reason`, `total_cost_usd`, `modelUsage`, etc.),
  and `dispatchTaskAttempt` persists the attempt (`processIdentity` tag, ledger entry with real
  observed cost) before and after the real subprocess call, exactly as designed.
- `--max-budget-usd` is a real, respected flag (the run really did stop early because of it) —
  but it is **not a precise hard cap**: see the overshoot finding below.

**Does not prove:** a full real dispatch -> verify -> review -> checkpoint -> commit -> integrate
cycle. Both attempts were cut off during the agent's own tool-use turns, before the fixture file
was ever written, so `runVerifications`/`runReview`/checkpoint/commit were never reached in this
run. `real-persisted-task-state.json` shows both attempts still at stage `'dispatching'` — this
is the real, honest, persisted state; nothing was fabricated to look more complete than it is.

## Key findings

1. **`--max-budget-usd` overshoot.** Attempt 1 (`flag $0.03`) spent **$0.069205** (~2.3x the
   flag). Attempt 2 (`flag $0.08`) spent **$0.086434** (a much smaller absolute overshoot,
   ~$0.006). The budget check appears to run between turns, not preemptively mid-turn — a single
   expensive turn already in flight can push real spend past the flag before it's enforced.
2. **Real per-dispatch cost floor for `gaia-developer-backend`.** Both attempts show a large
   (~26-27k token) cache-creation cost on every fresh session, essentially independent of the
   task's own triviality — this is the dominant cost driver, not the (trivial) task itself.
   Anyone budgeting real dispatches of this specific agent should expect a floor well above the
   $0.03-0.08 flags tested here.
3. **Ledger integrity held.** Each attempt's own ledger entry (opened before spawn, per this
   feature's persist-before-invoke discipline) recorded the real observed cost/duration — never
   a default or invented value, consistent with this whole feature's ledger-integrity principle.

## Total real cost observed

$0.069205 + $0.086434 = **$0.155639**, within the cycle-8 replacement cap ($0.20) and within the
one-additional-call limit the user authorized for that cycle.
