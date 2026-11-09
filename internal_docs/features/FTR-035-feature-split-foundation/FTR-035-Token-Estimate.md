# Token Estimate — FTR-035 (measured actuals)

Regenerated on 2026-11-09 from the measured evidence: the worker evidence of the documentation workflows (7 runs recorded in `FTR-035-token-ledger.json`) and the evidence of the task executor runs (`.git/ai-toolkit/execution/evidence/<runId>/`). Costs are the `costUSD` the Claude CLI reported for each call (list price); EUR uses the 0.92 rate of `docs/token-pricing.json`. This replaces the earlier table, which held only the last pm-phase2 invocation as an estimate.

## Totals

| Scope | Calls | Input tokens | Output tokens | Cache read | Cache write | Cost USD | Cost EUR | Agent time |
|---|---|---|---|---|---|---|---|---|
| Documentation (pm-phase1 + pm-phase2) | 141 | 2,869,603 | 805,314 | 1,543,020 | 3,575,699 | $4.988 | €4.589 | 1 h 12 min |
| Implementation — developer agents (executor) | 70 | 121,702 | 519,259 | 30,892,586 | 3,258,842 | $0.988 | €0.909 | 5 h 50 min |
| Implementation — phase reviews (executor) | 5 | 105,552 | 14,216 | 0 | 125,584 | $0.466 | €0.428 | 2 min |
| **Total measured** | 216 | 3,096,857 | 1,338,789 | 32,435,606 | 6,960,125 | $6.442 | €5.926 | 7 h 4 min |

## Documentation

| Scope | Calls | Input tokens | Output tokens | Cache read | Cache write | Cost USD | Cost EUR | Agent time |
|---|---|---|---|---|---|---|---|---|
| pm-phase1 | 48 | 241,068 | 437,290 | 1,046,717 | 787,002 | $0.352 | €0.323 | 37 min |
| pm-phase2 | 93 | 2,628,535 | 368,024 | 496,303 | 2,788,697 | $4.636 | €4.265 | 35 min |

By agent:

| Scope | Calls | Input tokens | Output tokens | Cache read | Cache write | Cost USD | Cost EUR | Agent time |
|---|---|---|---|---|---|---|---|---|
| planner.validate-work-breakdown | 28 | 1,009,576 | 22,990 | 70,980 | 1,074,471 | $3.018 | €2.777 | 5 min |
| planner.work-breakdown-phase | 7 | 318,686 | 18,677 | 26,677 | 330,152 | $1.045 | €0.962 | 2 min |
| planner.work-breakdown-task | 57 | 1,265,440 | 325,132 | 398,646 | 1,345,759 | $0.461 | €0.424 | 27 min |
| planner.tech-spec-component | 20 | 68,961 | 166,926 | 265,065 | 218,258 | $0.120 | €0.111 | 14 min |
| planner.work-breakdown | 1 | 34,833 | 1,225 | 0 | 38,315 | $0.111 | €0.102 | 0 min |
| planner.requirements-use-case | 16 | 57,615 | 73,757 | 207,191 | 163,277 | $0.065 | €0.060 | 7 min |
| planner.tech-spec | 3 | 12,352 | 66,863 | 362,997 | 167,771 | $0.059 | €0.055 | 6 min |
| planner.validate-feature-docs | 3 | 84,294 | 59,128 | 115,545 | 115,197 | $0.054 | €0.049 | 4 min |
| planner.requirements | 3 | 13,327 | 65,635 | 69,476 | 69,803 | $0.044 | €0.040 | 5 min |
| planner.validate-tech-spec-component-detail | 3 | 4,519 | 4,981 | 26,443 | 52,696 | $0.010 | €0.009 | 1 min |

About 60% of the documentation cost is the Sonnet semantic validation of the Work Breakdown (`validate-work-breakdown`), run once per phase on each of 4 re-runs.

## Implementation by executor run

| Run | Status | Dev calls | Dev USD | Review calls | Review USD | From | To |
|---|---|---|---|---|---|---|---|
| a912f1dd | paused | 4 | $0.059 | 0 | $0.000 | 2026-11-05T11:38 | 2026-11-05T12:25 |
| 2fabd074 | paused | 7 | $0.082 | 1 | $0.080 | 2026-11-05T12:40 | 2026-11-05T13:33 |
| dbcb2bce | superseded | 14 | $0.165 | 2 | $0.117 | 2026-11-05T14:56 | 2026-11-05T16:45 |
| 54a9bbf2 | paused | 17 | $0.250 | 0 | $0.000 | 2026-11-06T10:55 | 2026-11-06T13:04 |
| 1db58fce | blocked | 25 | $0.412 | 2 | $0.269 | 2026-11-06T13:39 | 2026-11-06T17:34 |
| 33afd057 | running | 1 | $0.007 | 0 | $0.000 | 2026-11-06T17:44 | 2026-11-06T17:48 |
| 8221a68f | blocked | 2 | $0.012 | 0 | $0.000 | 2026-11-09T11:35 | 2026-11-09T11:37 |

2 further runs made no agent call (restarts that only carried tasks forward or re-ran verifications).

## Implementation by phase

| Phase | Dev calls | Dev USD | Review calls | Review USD |
|---|---|---|---|---|
| INFRA | 10 | $0.131 | 1 | $0.080 |
| US-01 | 7 | $0.086 | 1 | $0.071 |
| US-02 | 3 | $0.027 | 1 | $0.046 |
| US-03 | 14 | $0.191 | 0 | $0.000 |
| US-04 | 23 | $0.403 | 1 | $0.185 |
| US-05 | 7 | $0.094 | 1 | $0.084 |
| US-06 | 6 | $0.057 | 0 | $0.000 |

## Attempts per task

55 tasks received at least one developer call, counted over every run: 44 with one call, 8 with two, 2 with three, 1 with four. Eleven tasks needed more than one call. Known causes: a verification command with a quoting bug (INFRA-TASK-BE-03), an unstable unrelated test or a too short timeout (US-03-TASK-BE-03, US-03-TASK-TEST-03), a wrong expected value in the verification command (US-04-TASK-BE-02), and a verification command written in bash-tagged code fences that the executor cannot parse (US-06-TASK-TEST-01, four calls). The other retries were not examined.

## Phase reviews

| Run | Closing task | Attempt | Verdict |
|---|---|---|---|
| 2fabd074 | INFRA-TASK-TEST-01 | 1 | PASS |
| dbcb2bce | US-01-TASK-TEST-03 | 1 | PASS |
| dbcb2bce | US-02-TASK-TEST-02 | 1 | PASS |
| 1db58fce | US-04-TASK-TEST-06 | 1 | PASS |
| 1db58fce | US-05-TASK-TEST-04 | 1 | PASS |

Only 5 of the 7 phases got a Sonnet phase review (INFRA, US-01, US-02, US-04, US-05), all PASS with no blocking finding. US-03 was closed by the already-satisfied check after a restart, and the closing task of US-06 was blocked by the malformed verification command, so neither was reviewed per phase. A whole-branch review closed that gap.

## Not included in these totals

- The model-comparison experiments on the A and B copies of the repository (no evidence was recorded).
- This conversation's own usage, and the two whole-branch Sonnet reviews run as subagents (99,868 and 86,976 tokens reported, no cost recorded).
- pm-phase1 attempts made while fixing the toolkit, which are recorded under FTR-034, and the documentation of FTR-034, FTR-036 and FTR-037.
- Hand work: verification of tasks and commits made outside the executor.
