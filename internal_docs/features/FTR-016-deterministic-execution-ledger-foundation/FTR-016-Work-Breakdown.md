# Work Breakdown — FTR-016

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-016 |
| Schema | v2 |
| Generated | 2026-09-02T22:00:33.007Z |

## Summary
| Metric | Value |
|--------|-------|
| Total tasks | 40 |
| Total phases | 12 |
| Within target (≤15 min) | 40 |
| Above target (16–20 min) | 0 |
| Warning (21–30 min) | 0 |
| Split required (>30 min) | 0 |
| Domain distribution | BE: 26, FE: 0, DB: 0, DevOps: 0, INFRA: 0, TEST: 14 |

## Infrastructure Phase (INFRA)

### Commit
feat(FTR-016): add execution-ledger shared primitives and CLI dispatcher

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| INFRA-TASK-BE-01 | Create lib/execution-ledger.js skeleton with public API surface | lib/execution-ledger.js exists with CommonJS exports (open, close, fail, skip, computeOperationId) and internal I/O and lock helper stubs; uses NodeJS built-ins only (fs, path, os, crypto); loads without side effects | BE | 10 | — | 3 cmd — [details](#task-INFRA-TASK-BE-01) |
| INFRA-TASK-BE-02 | Implement computeOperationId with a 128-bit tuple hash | computeOperationId(prefix, agent, attempt) derives a 128-bit hash of the [prefix, agent, attempt] tuple; distinct for agent keys that collapse under naive slugging (a:b, a/b, a-b); identical for repeated identical tuples | BE | 10 | INFRA-TASK-BE-01 | 2 cmd — [details](#task-INFRA-TASK-BE-02) |
| INFRA-TASK-BE-03 | Implement atomic _readLedger, _writeLedger, and _backupCorruptFile primitives | _writeLedger writes via temp file in the same directory, fsync, then atomic rename (Windows and POSIX); _readLedger parses the JSON array; _backupCorruptFile copies unreadable content to a recoverable sidecar; a killed write never leaves a truncated ledger | BE | 14 | INFRA-TASK-BE-01 | 3 cmd — [details](#task-INFRA-TASK-BE-03) |
| INFRA-TASK-BE-04 | Implement _acquireLock and _releaseLock with O_EXCL owner token | _acquireLock creates the lock with O_EXCL, writes owner {pid, startedAt, nonce} and fsyncs; retries with backoff up to a total deadline; _releaseLock unlinks only when the nonce still matches (ABA-safe) | BE | 15 | INFRA-TASK-BE-01 | 3 cmd — [details](#task-INFRA-TASK-BE-04) |
| INFRA-TASK-BE-05 | Implement _isLockStale for well-formed and orphan lock branches | _isLockStale(content, stat) returns live reclaimable wait; well-formed locks are reclaimable when age exceeds 30s AND the owner is not alive; orphan locks (no recoverable PID) are reclaimable only once file-mtime age exceeds the orphan threshold; younger malformed locks are waited on | BE | 15 | INFRA-TASK-BE-04 | 4 cmd — [details](#task-INFRA-TASK-BE-05) |
| INFRA-TASK-BE-11 | Implement shellQuotePosix argument-escaping helper | bin/cli.js exports shellQuotePosix, which wraps an argument in single quotes, escapes embedded single quotes, and throws on NUL or newline so a path containing spaces or metacharacters is passed as one argv element and never word-split by the shell | BE | 9 | INFRA-TASK-BE-01 | 3 cmd — [details](#task-INFRA-TASK-BE-11) |
| INFRA-TASK-BE-13 | Implement parseLedgerArgs CLI argument validator | bin/cli.js exports parseLedgerArgs, which validates the shared ledger flags and throws a validation error on a malformed --prefix, an empty --agent, a non-integer --attempt, or a --tokens value that is not an integer >= 1; a well-formed argument vector returns a parsed object with the coerced integer fields | BE | 10 | INFRA-TASK-BE-01 | 4 cmd — [details](#task-INFRA-TASK-BE-13) |
| INFRA-TASK-BE-12 | Add handleLedgerCommand dispatcher wiring bin/cli.js to the module | bin/cli.js requires lib/execution-ledger.js and adds handleLedgerCommand, which parses the shared flags via parseLedgerArgs and routes to per-subcommand handlers; the dispatcher exists with no operation logic duplicated in bin/cli.js | BE | 12 | INFRA-TASK-BE-01, INFRA-TASK-BE-11, INFRA-TASK-BE-13 | 3 cmd — [details](#task-INFRA-TASK-BE-12) |
| INFRA-TASK-TEST-01 | Scaffold tests/lib/execution-ledger.test.js module test file | tests/lib/execution-ledger.test.js exists with Jest describe blocks organized by concern (open, close, fail, skip, locking, legacy compatibility, concurrency) ready for per-user-story test tasks to populate | TEST | 8 | INFRA-TASK-BE-01 | 2 cmd — [details](#task-INFRA-TASK-TEST-01) |
| INFRA-TASK-TEST-02 | Scaffold tests/cli/ledger-cli.test.js CLI test file | tests/cli/ledger-cli.test.js exists with Jest describe blocks organized by concern (subcommand dispatch, argument validation, features-root resolution, fail-closed behavior, installer propagation) ready for per-user-story test tasks to populate | TEST | 8 | INFRA-TASK-BE-01 | 2 cmd — [details](#task-INFRA-TASK-TEST-02) |

## User Story Phases

### US-01: Record a Tracked Activity Execution

### Commit
feat(FTR-016): implement US-01 record activity execution via ledger open

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-01-TASK-BE-01 | Implement open() module operation with JavaScript ISO timestamps | open(dir, prefix, agent, phase, model, attempt) acquires the lock, reads the ledger, computes operation_id, and appends an entry with status running and an ISO-8601 UTC started_at generated by JavaScript (no Bash date, no LLM); writes atomically | BE | 14 | INFRA-TASK-BE-02, INFRA-TASK-BE-03, INFRA-TASK-BE-04 | 2 cmd — [details](#task-US-01-TASK-BE-01) |
| US-01-TASK-BE-02 | Wire ai-toolkit ledger open CLI subcommand with fail-closed result | bin/cli.js adds the open subcommand handler that calls module open, prints a structured JSON result deterministically, and exits non-zero iff the state was not persisted so a lock, corruption, or I/O failure makes the caller hard-stop rather than start the activity | BE | 13 | INFRA-TASK-BE-12, US-01-TASK-BE-01 | 3 cmd — [details](#task-US-01-TASK-BE-02) |
| US-01-TASK-TEST-01 | Write open create, timestamp, and open-failure hard-stop tests | Tests verify that open creates a single running entry with a JS ISO started_at, prints deterministic JSON, and that an open failure (lock or corruption) exits non-zero so the workflow hard-stops without starting the activity | TEST | 12 | US-01-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02 | 2 cmd — [details](#task-US-01-TASK-TEST-01) |
| US-01-TASK-BE-03 | Migrate pm-phase1.js to the ledger CLI facade preserving the tracked-activity set | pm-phase1.js removes inline LLM ledger prompts and calls ai-toolkit ledger open then close for each tracked activity (generate-requirements, generate-tech-spec, validate-feature-docs cycles); the tracked-activity set and phase keys are unchanged from today; every write goes through the facade | BE | 13 | US-01-TASK-BE-02 | 5 cmd — [details](#task-US-01-TASK-BE-03) |

### US-02: Complete a Tracked Activity Successfully

### Commit
feat(FTR-016): implement US-02 complete activity via ledger close

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-02-TASK-BE-01 | Implement close() module operation with resume-safe token preservation | close(dir, prefix, agent, tokens, attempt) finds the entry by operation_id or an unambiguous agent fallback and sets status done with completed_at; when --tokens is omitted (null) an existing positive phase_delta_tokens is preserved and null never overwrites it | BE | 14 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-02-TASK-BE-01) |
| US-02-TASK-BE-02 | Wire ai-toolkit ledger close CLI subcommand with --tokens validation | bin/cli.js adds the close subcommand handler that rejects --tokens of 0, negative, or non-integer with a non-zero validation error and writes nothing; the module never persists phase_delta_tokens of 0; omitting --tokens records null | BE | 12 | INFRA-TASK-BE-12, US-02-TASK-BE-01 | 3 cmd — [details](#task-US-02-TASK-BE-02) |
| US-02-TASK-TEST-01 | Write close token-preservation and never-opened rejection tests | Tests verify that omitting --tokens preserves an existing positive value, that --tokens 0 or negative is rejected and writes nothing, and that close for an operation_id that was never opened fails non-zero rather than silently creating or closing an entry | TEST | 12 | US-02-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02 | 2 cmd — [details](#task-US-02-TASK-TEST-01) |
| US-02-TASK-BE-03 | Migrate pm-phase2.js to the ledger CLI facade | pm-phase2.js removes LLM-based ledger writes and calls ai-toolkit ledger open then close for the work-breakdown generation, validation, and rendering activities; token measurements are passed to close; every write goes through the facade | BE | 12 | US-02-TASK-BE-02 | 5 cmd — [details](#task-US-02-TASK-BE-03) |

### US-03: Record Activity Failure

### Commit
feat(FTR-016): implement US-03 record activity failure via ledger fail

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-03-TASK-BE-01 | Implement fail() module operation with clear never-opened rejection | fail(dir, prefix, agent, error, attempt) finds the entry by operation_id or an unambiguous agent fallback and sets status failed with completed_at and an optional sanitized error field; invoked for an operation_id that was never opened it fails clearly with a non-zero structured error rather than creating or closing an entry | BE | 12 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-03-TASK-BE-01) |
| US-03-TASK-BE-02 | Wire ai-toolkit ledger fail CLI subcommand with fail-closed result | bin/cli.js adds the fail subcommand handler that calls module fail, prints a structured JSON result, and exits non-zero when the terminal state was not persisted so no error is swallowed or downgraded to best-effort | BE | 11 | INFRA-TASK-BE-12, US-03-TASK-BE-01 | 2 cmd — [details](#task-US-03-TASK-BE-02) |
| US-03-TASK-TEST-01 | Write fail with-and-without-error and never-opened tests | Tests verify that fail marks an open entry failed with completed_at, that an optional sanitized error field is stored when supplied, and that fail for a never-opened operation exits non-zero without creating an entry | TEST | 11 | US-03-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02 | 1 cmd — [details](#task-US-03-TASK-TEST-01) |
| US-03-TASK-BE-03 | Migrate pm-phase3.js to the ledger CLI facade with terminal fail-closed | pm-phase3.js removes inline LLM ledger writes and calls ai-toolkit ledger open, close, and fail for its tracked activities; when a close, fail, or skip result is non-zero the workflow hard-stops reporting the terminal state was not persisted; no facade error is swallowed or downgraded | BE | 14 | US-03-TASK-BE-02, US-01-TASK-BE-02, US-02-TASK-BE-02 | 5 cmd — [details](#task-US-03-TASK-BE-03) |
| US-03-TASK-BE-04 | Add null-compatibility to pm-phase3.js token recovery | pm-phase3.js token-recovery logic treats null, 0, and not_available token values as data unavailable and never turns them into an observable real zero; it also guards against resume clobber from cached agents returning zero | BE | 9 | US-03-TASK-BE-03 | 3 cmd — [details](#task-US-03-TASK-BE-04) |

### US-04: Record Activity Skip

### Commit
feat(FTR-016): implement US-04 record activity skip via ledger skip

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-04-TASK-BE-01 | Implement skip() module operation with create-or-update semantics | skip(dir, prefix, agent, phase, model, attempt) with no existing entry atomically creates a terminal skipped entry with started_at equal to completed_at, the supplied --phase and --model, and phase_delta_tokens null; with exactly one match it updates in place preserving started_at; with an ambiguous agent fallback it fails non-zero | BE | 13 | US-01-TASK-BE-01 | 2 cmd — [details](#task-US-04-TASK-BE-01) |
| US-04-TASK-BE-02 | Wire ai-toolkit ledger skip CLI subcommand with fail-closed result | bin/cli.js adds the skip subcommand handler that calls module skip, prints a structured JSON result, and exits non-zero when the terminal state was not persisted so the workflow hard-stops on an ambiguous or failed skip | BE | 11 | INFRA-TASK-BE-12, US-04-TASK-BE-01 | 2 cmd — [details](#task-US-04-TASK-BE-02) |
| US-04-TASK-TEST-01 | Write skip create, update-in-place, and ambiguous-fallback tests | Tests verify that skip creates a terminal entry when none exists, updates in place when exactly one match exists preserving started_at, and fails non-zero when an agent fallback matches multiple entries | TEST | 11 | US-04-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02 | 1 cmd — [details](#task-US-04-TASK-TEST-01) |
| US-04-TASK-BE-03 | Remove dead cli.js ledger bodies and confirm the module is the sole writer | bin/cli.js no longer defines appendLedgerEntry or updateLedgerEntry bodies and delegates every ledger write to lib/execution-ledger.js; no pm-phase workflow writes ledger JSON directly; the full test suite and coverage gate pass | BE | 12 | US-01-TASK-BE-02, US-02-TASK-BE-02, US-03-TASK-BE-02, US-04-TASK-BE-02, US-01-TASK-BE-03, US-02-TASK-BE-03, US-03-TASK-BE-03 | 5 cmd — [details](#task-US-04-TASK-BE-03) |

### US-05: Record Feature Definition Activity

### Commit
feat(FTR-016): implement US-05 feature definition via resolved features root

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-05-TASK-BE-01 | Implement resolveFeaturesRoot and the AGENTS.md convention grammar parser | bin/cli.js exports resolveFeaturesRoot(cwd) with ordered precedence (explicit flag, then AGENTS.md features_root convention, then a single existing default), gathering all candidates before deciding and throwing on ambiguous or multiply-declared roots; the grammar parser ignores commented-out lines and strips inline comments deterministically | BE | 13 | INFRA-TASK-BE-13 | 3 cmd — [details](#task-US-05-TASK-BE-01) |
| US-05-TASK-BE-02 | Add the ai-toolkit resolve-features-root invocable command | bin/cli.js adds a resolve-features-root subcommand that on success prints only the resolved absolute path to stdout with exit 0, and on a missing, invalid, ambiguous, or multiply-declared root exits non-zero with diagnostics on stderr and nothing on stdout | BE | 10 | US-05-TASK-BE-01 | 3 cmd — [details](#task-US-05-TASK-BE-02) |
| US-05-TASK-BE-03 | Migrate define-feature.md to resolve-features-root and the ledger facade with null tokens | define-feature.md invokes ai-toolkit resolve-features-root once, captures the stdout path, and reuses that exact value for feature.md and ledger --dir so the define-feature:define entry is written in the same feature directory the pipeline later uses; it calls ai-toolkit ledger open and close omitting --tokens so phase_delta_tokens is recorded as null | BE | 12 | US-05-TASK-BE-02 | 3 cmd — [details](#task-US-05-TASK-BE-03) |
| US-05-TASK-TEST-01 | Write resolve-features-root resolution, grammar, and CLI-contract tests | Tests verify the resolve-features-root output contract (stdout-only resolved path on success; stderr diagnostics with empty stdout on missing, invalid, ambiguous, or multiply-declared roots) and the AGENTS.md grammar parser (commented-out lines ignored, inline comments stripped), fully exercising the deterministic resolution behaviour | TEST | 8 | US-05-TASK-BE-02, INFRA-TASK-TEST-02 | 1 cmd — [details](#task-US-05-TASK-TEST-01) |
| US-05-TASK-TEST-02 | Write installer/packaging propagation tests for ledger assets | Tests verify the installer propagates pm-phase*.js and the migrated define-feature.md through the catalog/manifest with no manually synced dual copies, so the ledger CLI assets reach a destination project via packaging alone | TEST | 6 | US-05-TASK-BE-03 | 1 cmd — [details](#task-US-05-TASK-TEST-02) |

### US-06: Handle Corrupt Ledger File

### Commit
feat(FTR-016): implement US-06 corrupt ledger fail-closed handling

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-06-TASK-BE-01 | Implement fail-closed corrupt-ledger handling in the module | When a write opens a malformed ledger the module backs up the corrupt content to a recoverable sidecar, does not overwrite the original, and fails closed with diagnostics; a fresh ledger is created only by an explicit recovery action, never silently | BE | 12 | INFRA-TASK-BE-03 | 2 cmd — [details](#task-US-06-TASK-BE-01) |
| US-06-TASK-TEST-01 | Write malformed-ledger backup and fail-closed tests | Tests create a malformed JSON ledger and verify the corrupt content is backed up to a sidecar, the original is never overwritten, the operation exits non-zero, and no fresh empty ledger is silently created | TEST | 10 | US-06-TASK-BE-01, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-06-TASK-TEST-01) |

### US-07: Resume Execution After Interruption

### Commit
feat(FTR-016): implement US-07 idempotent resume on stable operation_id

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-07-TASK-TEST-01 | Write resume idempotency and duplicate-prevention tests | Tests verify that re-opening the same operation_id produces no duplicate entry, the original started_at is preserved, a positive phase_delta_tokens survives a close with --tokens omitted, and exactly one entry remains after a resume | TEST | 11 | US-01-TASK-BE-01, US-02-TASK-BE-01, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-07-TASK-TEST-01) |

### US-08: Execute a Rework of an Activity

### Commit
feat(FTR-016): implement US-08 rework yields a distinct operation_id

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-08-TASK-TEST-01 | Write new-attempt distinct-operation_id and determinism tests | Tests verify that incrementing the attempt yields an operation_id distinct from the original while both entries remain correlatable by the same agent key and the original attempt is untouched, and that the three colliding agent slugs (a:b, a/b, a-b) produce three distinct ids while an identical tuple is deterministic across calls | TEST | 11 | US-01-TASK-BE-01, INFRA-TASK-BE-02, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-08-TASK-TEST-01) |

### US-09: Concurrently Update Ledger from Multiple Agents

### Commit
feat(FTR-016): implement US-09 concurrent updates via lock serialization

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-09-TASK-TEST-01 | Write concurrent-update lock-serialization tests | Tests simulate two processes updating the same ledger concurrently and verify access is serialized by the cross-process lock, both updates are present with no lost update, and both entries carry correct data | TEST | 12 | US-02-TASK-BE-01, INFRA-TASK-BE-04, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-09-TASK-TEST-01) |

### US-10: Recover from Stale Lock

### Commit
feat(FTR-016): implement US-10 stale and orphan lock recovery

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-10-TASK-TEST-01 | Write stale-lock and orphan-lock recovery tests with ABA guards | Tests verify a live lock triggers timeout and retry, a stale lock (age over 30s AND owner not alive) is safely reclaimed, an orphan lock with no recoverable PID is reclaimed once file-mtime age exceeds the threshold via a guarded content and stat ABA check, a younger malformed lock is waited on rather than force-deleted, and the ledger is never blocked permanently or corrupted | TEST | 13 | INFRA-TASK-BE-05, US-01-TASK-BE-01, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-10-TASK-TEST-01) |

### US-11: Verify CLI facade success and reader compatibility

### Commit
feat(FTR-016): implement US-11 facade reader legacy and null compatibility

### Tasks
| ID | Title | Outcome | Domain | Est. (min) | Dependencies | Verification |
|---|---|---|---|---|---|---|
| US-11-TASK-BE-01 | Add null-compatibility to implement-feature/SKILL.md readers | implement-feature/SKILL.md actuals and cost-calculation steps treat null, 0, and not_available token values as data unavailable and never render them as an observable real zero consumption, preventing resume clobber and legacy misinterpretation | BE | 10 | — | 2 cmd — [details](#task-US-11-TASK-BE-01) |
| US-11-TASK-TEST-01 | Write legacy-field preservation and FTR-014 fixture compatibility tests | Tests verify that entries carrying unknown or legacy fields and lacking operation_id are updated in place via the unambiguous agent fallback with unknown fields preserved verbatim and no operation_id added, and that a real FTR-014 ledger fixture parses and updates without data loss or auto-migration of unrelated legacy values | TEST | 12 | US-02-TASK-BE-01, INFRA-TASK-TEST-01 | 1 cmd — [details](#task-US-11-TASK-TEST-01) |

## Task Details

> Authoritative per-task detail. Every field is rendered integrally so this document, together with the dispatch CSV, is a complete deliverable requiring no separate JSON. Verification commands are preserved **verbatim** in fenced code blocks — operators such as `||`, shell pipes `|`, and regex alternations (`grep -E 'a|b|c'`) survive byte-for-byte. Each command is an independent fenced block.

<a id="task-INFRA-TASK-BE-01"></a>
### INFRA-TASK-BE-01

- **Task ID:** INFRA-TASK-BE-01
- **Title:** Create lib/execution-ledger.js skeleton with public API surface
- **Outcome:** lib/execution-ledger.js exists with CommonJS exports (open, close, fail, skip, computeOperationId) and internal I/O and lock helper stubs; uses NodeJS built-ins only (fs, path, os, crypto); loads without side effects
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** scaffold lib/execution-ledger.js public API surface

**Verification commands:**

```
test -f lib/execution-ledger.js
```

```
node --check lib/execution-ledger.js
```

```
node -e "const m=require('./lib/execution-ledger'); if(!['open','close','fail','skip','computeOperationId'].every(k=>typeof m[k]==='function')){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Implement computeOperationId with a 128-bit tuple hash
- **Outcome:** computeOperationId(prefix, agent, attempt) derives a 128-bit hash of the [prefix, agent, attempt] tuple; distinct for agent keys that collapse under naive slugging (a:b, a/b, a-b); identical for repeated identical tuples
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** implement 128-bit collision-resistant operation_id

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const {computeOperationId:c}=require('./lib/execution-ledger'); const a=c('P','a:b',1),b=c('P','a/b',1),d=c('P','a-b',1); if(a===b||a===d||b===d){process.exit(1)} if(c('P','a:b',1)!==a){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-03"></a>
### INFRA-TASK-BE-03

- **Task ID:** INFRA-TASK-BE-03
- **Title:** Implement atomic _readLedger, _writeLedger, and _backupCorruptFile primitives
- **Outcome:** _writeLedger writes via temp file in the same directory, fsync, then atomic rename (Windows and POSIX); _readLedger parses the JSON array; _backupCorruptFile copies unreadable content to a recoverable sidecar; a killed write never leaves a truncated ledger
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add atomic temp+fsync+rename ledger I/O primitives

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const f=path.join(d,'x.json'); m._writeLedger(f,[{a:1}]); if(JSON.stringify(m._readLedger(f).entries)!==JSON.stringify([{a:1}])){process.exit(1)}"
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const f=path.join(d,'y.json'); fs.writeFileSync(f,'{bad'); m._backupCorruptFile(f); if(fs.readFileSync(f,'utf8')!=='{bad'){process.exit(1)} if(!fs.readdirSync(d).some(n=>n!=='y.json')){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-04"></a>
### INFRA-TASK-BE-04

- **Task ID:** INFRA-TASK-BE-04
- **Title:** Implement _acquireLock and _releaseLock with O_EXCL owner token
- **Outcome:** _acquireLock creates the lock with O_EXCL, writes owner {pid, startedAt, nonce} and fsyncs; retries with backoff up to a total deadline; _releaseLock unlinks only when the nonce still matches (ABA-safe)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 38000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add O_EXCL lock with owner token and ABA-safe release

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const m=require('./lib/execution-ledger'); if(typeof m._acquireLock!=='function'||typeof m._releaseLock!=='function'){process.exit(1)}"
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const lk=path.join(d,'x.lock'); const h=m._acquireLock(lk); let second=false; try{m._acquireLock(lk,{deadlineMs:200})}catch(e){second=true} if(!second){process.exit(1)} m._releaseLock(lk,h); const h2=m._acquireLock(lk); if(!h2){process.exit(1)} m._releaseLock(lk,h2)"
```

<a id="task-INFRA-TASK-BE-05"></a>
### INFRA-TASK-BE-05

- **Task ID:** INFRA-TASK-BE-05
- **Title:** Implement _isLockStale for well-formed and orphan lock branches
- **Outcome:** _isLockStale(content, stat) returns live|reclaimable|wait; well-formed locks are reclaimable when age exceeds 30s AND the owner is not alive; orphan locks (no recoverable PID) are reclaimable only once file-mtime age exceeds the orphan threshold; younger malformed locks are waited on
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-04
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 40000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add stale and orphan lock classification

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const m=require('./lib/execution-ledger'); const live=m._isLockStale(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),nonce:'n'}),{mtimeMs:Date.now()}); if(live!=='live'){process.exit(1)}"
```

```
node -e "const m=require('./lib/execution-ledger'); const old=new Date(Date.now()-60000).toISOString(); const r=m._isLockStale(JSON.stringify({pid:999999,startedAt:old,nonce:'n'}),{mtimeMs:Date.now()-60000}); if(r!=='reclaimable'){process.exit(1)}"
```

```
node -e "const m=require('./lib/execution-ledger'); const r=m._isLockStale('garbage',{mtimeMs:Date.now()}); if(r!=='wait'){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-11"></a>
### INFRA-TASK-BE-11

- **Task ID:** INFRA-TASK-BE-11
- **Title:** Implement shellQuotePosix argument-escaping helper
- **Outcome:** bin/cli.js exports shellQuotePosix, which wraps an argument in single quotes, escapes embedded single quotes, and throws on NUL or newline so a path containing spaces or metacharacters is passed as one argv element and never word-split by the shell
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** AC-17
- **Estimate — agent minutes:** 9
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add POSIX shell quoting helper

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const c=require('./bin/cli.js'); if(typeof c.shellQuotePosix!=='function'){process.exit(1)} const q=c.shellQuotePosix('a b/c d'); if(q.indexOf('a b/c d')===-1){process.exit(1)}"
```

```
node -e "const c=require('./bin/cli.js'); let t=false; try{c.shellQuotePosix('a\nb')}catch(e){t=true} if(!t){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-13"></a>
### INFRA-TASK-BE-13

- **Task ID:** INFRA-TASK-BE-13
- **Title:** Implement parseLedgerArgs CLI argument validator
- **Outcome:** bin/cli.js exports parseLedgerArgs, which validates the shared ledger flags and throws a validation error on a malformed --prefix, an empty --agent, a non-integer --attempt, or a --tokens value that is not an integer >= 1; a well-formed argument vector returns a parsed object with the coerced integer fields
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger CLI argument validator

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const c=require('./bin/cli.js'); if(typeof c.parseLedgerArgs!=='function'){process.exit(1)} const ok=c.parseLedgerArgs(['--prefix','FTR-1','--agent','a','--attempt','1','--tokens','5']); if(!ok||ok.tokens!==5||ok.attempt!==1){process.exit(1)}"
```

```
node -e "const c=require('./bin/cli.js'); let t=false; try{c.parseLedgerArgs(['--prefix','FTR-1','--agent','a','--attempt','x'])}catch(e){t=true} if(!t){process.exit(1)}"
```

```
node -e "const c=require('./bin/cli.js'); let t=false; try{c.parseLedgerArgs(['--prefix','FTR-1','--agent','a','--tokens','0'])}catch(e){t=true} if(!t){process.exit(1)}"
```

<a id="task-INFRA-TASK-BE-12"></a>
### INFRA-TASK-BE-12

- **Task ID:** INFRA-TASK-BE-12
- **Title:** Add handleLedgerCommand dispatcher wiring bin/cli.js to the module
- **Outcome:** bin/cli.js requires lib/execution-ledger.js and adds handleLedgerCommand, which parses the shared flags via parseLedgerArgs and routes to per-subcommand handlers; the dispatcher exists with no operation logic duplicated in bin/cli.js
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-BE-11, INFRA-TASK-BE-13
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger CLI dispatcher wired to the module

**Verification commands:**

```
node --check bin/cli.js
```

```
grep -q "require(.*execution-ledger" bin/cli.js
```

```
grep -q 'handleLedgerCommand' bin/cli.js
```

<a id="task-INFRA-TASK-TEST-01"></a>
### INFRA-TASK-TEST-01

- **Task ID:** INFRA-TASK-TEST-01
- **Title:** Scaffold tests/lib/execution-ledger.test.js module test file
- **Outcome:** tests/lib/execution-ledger.test.js exists with Jest describe blocks organized by concern (open, close, fail, skip, locking, legacy compatibility, concurrency) ready for per-user-story test tasks to populate
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** scaffold module test file for execution-ledger

**Verification commands:**

```
test -f tests/lib/execution-ledger.test.js
```

```
node --check tests/lib/execution-ledger.test.js
```

<a id="task-INFRA-TASK-TEST-02"></a>
### INFRA-TASK-TEST-02

- **Task ID:** INFRA-TASK-TEST-02
- **Title:** Scaffold tests/cli/ledger-cli.test.js CLI test file
- **Outcome:** tests/cli/ledger-cli.test.js exists with Jest describe blocks organized by concern (subcommand dispatch, argument validation, features-root resolution, fail-closed behavior, installer propagation) ready for per-user-story test tasks to populate
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** scaffold CLI test file for ledger subcommands

**Verification commands:**

```
test -f tests/cli/ledger-cli.test.js
```

```
node --check tests/cli/ledger-cli.test.js
```

<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Implement open() module operation with JavaScript ISO timestamps
- **Outcome:** open(dir, prefix, agent, phase, model, attempt) acquires the lock, reads the ledger, computes operation_id, and appends an entry with status running and an ISO-8601 UTC started_at generated by JavaScript (no Bash date, no LLM); writes atomically
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02, INFRA-TASK-BE-03, INFRA-TASK-BE-04
- **Acceptance criteria:** AC-13
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add open() operation with JS-generated ISO timestamps

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); m.open(d,'FTR-999','a:b','phase1','haiku',1); const e=JSON.parse(fs.readFileSync(path.join(d,'FTR-999-token-ledger.json'),'utf8')); if(e.length!==1||e[0].status!=='running'||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(e[0].started_at)){process.exit(1)}"
```

<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Wire ai-toolkit ledger open CLI subcommand with fail-closed result
- **Outcome:** bin/cli.js adds the open subcommand handler that calls module open, prints a structured JSON result deterministically, and exits non-zero iff the state was not persisted so a lock, corruption, or I/O failure makes the caller hard-stop rather than start the activity
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-12, US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-19
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger open subcommand with fail-closed exit contract

**Verification commands:**

```
node --check bin/cli.js
```

```
grep -q 'open' bin/cli.js
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const r=cp.spawnSync('node',['bin/cli.js','ledger','open','--dir',d,'--prefix','FTR-999','--agent','smoke','--phase','p','--model','haiku','--attempt','1'],{encoding:'utf8'}); if(r.status!==0){process.exit(1)} JSON.parse(r.stdout)"
```

<a id="task-US-01-TASK-TEST-01"></a>
### US-01-TASK-TEST-01

- **Task ID:** US-01-TASK-TEST-01
- **Title:** Write open create, timestamp, and open-failure hard-stop tests
- **Outcome:** Tests verify that open creates a single running entry with a JS ISO started_at, prints deterministic JSON, and that an open failure (lock or corruption) exits non-zero so the workflow hard-stops without starting the activity
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add open create, timestamp, and fail-closed tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='open.*create|timestamp'
```

```
npm test -- --testPathPattern=ledger-cli.test.js --testNamePattern='open.*fail|open.*hard.*stop'
```

<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Migrate pm-phase1.js to the ledger CLI facade preserving the tracked-activity set
- **Outcome:** pm-phase1.js removes inline LLM ledger prompts and calls ai-toolkit ledger open then close for each tracked activity (generate-requirements, generate-tech-spec, validate-feature-docs cycles); the tracked-activity set and phase keys are unchanged from today; every write goes through the facade
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-04, AC-05
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** migrate pm-phase1 to the ledger CLI facade

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```

```
! grep -q 'appendLedgerEntry' src/claude/workflows/pm-phase1.js
```

```
! grep -q 'updateLedgerEntry' src/claude/workflows/pm-phase1.js
```

```
grep -q 'ai-toolkit ledger open' src/claude/workflows/pm-phase1.js
```

```
grep -q 'ai-toolkit ledger close' src/claude/workflows/pm-phase1.js
```

<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Implement close() module operation with resume-safe token preservation
- **Outcome:** close(dir, prefix, agent, tokens, attempt) finds the entry by operation_id or an unambiguous agent fallback and sets status done with completed_at; when --tokens is omitted (null) an existing positive phase_delta_tokens is preserved and null never overwrites it
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add close() with resume-safe token preservation

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); m.open(d,'FTR-999','a','p','haiku',1); const f=path.join(d,'FTR-999-token-ledger.json'); let e=JSON.parse(fs.readFileSync(f,'utf8')); e[0].phase_delta_tokens=1234; m._writeLedger(f,e); m.close(d,'FTR-999','a',null,1); e=JSON.parse(fs.readFileSync(f,'utf8')); if(e[0].phase_delta_tokens!==1234||e[0].status!=='done'){process.exit(1)}"
```

<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire ai-toolkit ledger close CLI subcommand with --tokens validation
- **Outcome:** bin/cli.js adds the close subcommand handler that rejects --tokens of 0, negative, or non-integer with a non-zero validation error and writes nothing; the module never persists phase_delta_tokens of 0; omitting --tokens records null
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-12, US-02-TASK-BE-01
- **Acceptance criteria:** AC-24
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger close subcommand with --tokens validation

**Verification commands:**

```
node --check bin/cli.js
```

```
grep -q 'close' bin/cli.js
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const r=cp.spawnSync('node',['bin/cli.js','ledger','close','--dir',d,'--prefix','FTR-999','--agent','a','--tokens','0','--attempt','1'],{encoding:'utf8'}); if(r.status===0){process.exit(1)}"
```

<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Write close token-preservation and never-opened rejection tests
- **Outcome:** Tests verify that omitting --tokens preserves an existing positive value, that --tokens 0 or negative is rejected and writes nothing, and that close for an operation_id that was never opened fails non-zero rather than silently creating or closing an entry
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add close token-preservation and rejection tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='close.*token|preserve|close.*nonexistent'
```

```
npm test -- --testPathPattern=ledger-cli.test.js --testNamePattern='tokens.*zero|tokens.*negative'
```

<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Migrate pm-phase2.js to the ledger CLI facade
- **Outcome:** pm-phase2.js removes LLM-based ledger writes and calls ai-toolkit ledger open then close for the work-breakdown generation, validation, and rendering activities; token measurements are passed to close; every write goes through the facade
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-02
- **Acceptance criteria:** AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** migrate pm-phase2 to the ledger CLI facade

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```

```
! grep -q 'appendLedgerEntry' src/claude/workflows/pm-phase2.js
```

```
! grep -q 'updateLedgerEntry' src/claude/workflows/pm-phase2.js
```

```
grep -q 'ai-toolkit ledger open' src/claude/workflows/pm-phase2.js
```

```
grep -q 'ai-toolkit ledger close' src/claude/workflows/pm-phase2.js
```

<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Implement fail() module operation with clear never-opened rejection
- **Outcome:** fail(dir, prefix, agent, error, attempt) finds the entry by operation_id or an unambiguous agent fallback and sets status failed with completed_at and an optional sanitized error field; invoked for an operation_id that was never opened it fails clearly with a non-zero structured error rather than creating or closing an entry
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-21
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add fail() with clear never-opened rejection

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); let threw=false; try{m.fail(d,'FTR-999','never-opened','boom',1)}catch(e){threw=true} const f=path.join(d,'FTR-999-token-ledger.json'); const existed=fs.existsSync(f) && JSON.parse(fs.readFileSync(f,'utf8')).length>0; if(!threw&&existed){process.exit(1)}"
```

<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Wire ai-toolkit ledger fail CLI subcommand with fail-closed result
- **Outcome:** bin/cli.js adds the fail subcommand handler that calls module fail, prints a structured JSON result, and exits non-zero when the terminal state was not persisted so no error is swallowed or downgraded to best-effort
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-12, US-03-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger fail subcommand with fail-closed exit contract

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); cp.spawnSync('node',['bin/cli.js','ledger','open','--dir',d,'--prefix','FTR-999','--agent','a','--phase','p','--model','haiku','--attempt','1']); const r=cp.spawnSync('node',['bin/cli.js','ledger','fail','--dir',d,'--prefix','FTR-999','--agent','a','--error','boom','--attempt','1'],{encoding:'utf8'}); if(r.status!==0){process.exit(1)} const e=JSON.parse(fs.readFileSync(path.join(d,'FTR-999-token-ledger.json'),'utf8')); if(e[0].status!=='failed'){process.exit(1)}"
```

<a id="task-US-03-TASK-TEST-01"></a>
### US-03-TASK-TEST-01

- **Task ID:** US-03-TASK-TEST-01
- **Title:** Write fail with-and-without-error and never-opened tests
- **Outcome:** Tests verify that fail marks an open entry failed with completed_at, that an optional sanitized error field is stored when supplied, and that fail for a never-opened operation exits non-zero without creating an entry
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-03-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add fail operation tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='fail.*error|fail.*nonexistent|fail.*never'
```

<a id="task-US-03-TASK-BE-03"></a>
### US-03-TASK-BE-03

- **Task ID:** US-03-TASK-BE-03
- **Title:** Migrate pm-phase3.js to the ledger CLI facade with terminal fail-closed
- **Outcome:** pm-phase3.js removes inline LLM ledger writes and calls ai-toolkit ledger open, close, and fail for its tracked activities; when a close, fail, or skip result is non-zero the workflow hard-stops reporting the terminal state was not persisted; no facade error is swallowed or downgraded
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-02, US-01-TASK-BE-02, US-02-TASK-BE-02
- **Acceptance criteria:** AC-04, AC-20
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 34000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** migrate pm-phase3 to the ledger CLI facade with fail-closed

**Verification commands:**

```
node --check src/claude/workflows/pm-phase3.js
```

```
! grep -q 'appendLedgerEntry' src/claude/workflows/pm-phase3.js
```

```
! grep -q 'updateLedgerEntry' src/claude/workflows/pm-phase3.js
```

```
grep -q 'ai-toolkit ledger' src/claude/workflows/pm-phase3.js
```

```
grep -Eq 'status|exit.*code|hard.*stop' src/claude/workflows/pm-phase3.js
```

<a id="task-US-03-TASK-BE-04"></a>
### US-03-TASK-BE-04

- **Task ID:** US-03-TASK-BE-04
- **Title:** Add null-compatibility to pm-phase3.js token recovery
- **Outcome:** pm-phase3.js token-recovery logic treats null, 0, and not_available token values as data unavailable and never turns them into an observable real zero; it also guards against resume clobber from cached agents returning zero
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-03
- **Acceptance criteria:** AC-18
- **Estimate — agent minutes:** 9
- **Estimate — tokens:** 22000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** fix
- **Commit scope:** —
- **Commit subject:** treat null/0/not_available tokens as unavailable in pm-phase3

**Verification commands:**

```
node --check src/claude/workflows/pm-phase3.js
```

```
grep -Eq 'null.*unavailable|data.*unavailable|not_available' src/claude/workflows/pm-phase3.js
```

```
! grep -q 'tokens || 0' src/claude/workflows/pm-phase3.js
```

<a id="task-US-04-TASK-BE-01"></a>
### US-04-TASK-BE-01

- **Task ID:** US-04-TASK-BE-01
- **Title:** Implement skip() module operation with create-or-update semantics
- **Outcome:** skip(dir, prefix, agent, phase, model, attempt) with no existing entry atomically creates a terminal skipped entry with started_at equal to completed_at, the supplied --phase and --model, and phase_delta_tokens null; with exactly one match it updates in place preserving started_at; with an ambiguous agent fallback it fails non-zero
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-23
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add skip() with atomic create-or-update semantics

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); m.skip(d,'FTR-999','a','p','haiku',1); const e=JSON.parse(fs.readFileSync(path.join(d,'FTR-999-token-ledger.json'),'utf8')); if(e.length!==1||e[0].status!=='skipped'||e[0].started_at!==e[0].completed_at||e[0].phase_delta_tokens!==null){process.exit(1)}"
```

<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Wire ai-toolkit ledger skip CLI subcommand with fail-closed result
- **Outcome:** bin/cli.js adds the skip subcommand handler that calls module skip, prints a structured JSON result, and exits non-zero when the terminal state was not persisted so the workflow hard-stops on an ambiguous or failed skip
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-12, US-04-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add ledger skip subcommand with fail-closed exit contract

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const r=cp.spawnSync('node',['bin/cli.js','ledger','skip','--dir',d,'--prefix','FTR-999','--agent','a','--phase','p','--model','haiku','--attempt','1'],{encoding:'utf8'}); if(r.status!==0){process.exit(1)} const e=JSON.parse(fs.readFileSync(path.join(d,'FTR-999-token-ledger.json'),'utf8')); if(e[0].status!=='skipped'){process.exit(1)}"
```

<a id="task-US-04-TASK-TEST-01"></a>
### US-04-TASK-TEST-01

- **Task ID:** US-04-TASK-TEST-01
- **Title:** Write skip create, update-in-place, and ambiguous-fallback tests
- **Outcome:** Tests verify that skip creates a terminal entry when none exists, updates in place when exactly one match exists preserving started_at, and fails non-zero when an agent fallback matches multiple entries
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-04-TASK-BE-02, INFRA-TASK-TEST-01, INFRA-TASK-TEST-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add skip create/update/ambiguous tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='skip.*create|skip.*update|skip.*ambiguous'
```

<a id="task-US-04-TASK-BE-03"></a>
### US-04-TASK-BE-03

- **Task ID:** US-04-TASK-BE-03
- **Title:** Remove dead cli.js ledger bodies and confirm the module is the sole writer
- **Outcome:** bin/cli.js no longer defines appendLedgerEntry or updateLedgerEntry bodies and delegates every ledger write to lib/execution-ledger.js; no pm-phase workflow writes ledger JSON directly; the full test suite and coverage gate pass
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02, US-02-TASK-BE-02, US-03-TASK-BE-02, US-04-TASK-BE-02, US-01-TASK-BE-03, US-02-TASK-BE-03, US-03-TASK-BE-03
- **Acceptance criteria:** AC-01, AC-02, AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** remove dead cli.js ledger bodies; module is sole writer

**Verification commands:**

```
! grep -q 'function appendLedgerEntry' bin/cli.js
```

```
! grep -q 'function updateLedgerEntry' bin/cli.js
```

```
grep -q "require(.*execution-ledger" bin/cli.js
```

```
npm test
```

```
npm run test:coverage
```

<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Implement resolveFeaturesRoot and the AGENTS.md convention grammar parser
- **Outcome:** bin/cli.js exports resolveFeaturesRoot(cwd) with ordered precedence (explicit flag, then AGENTS.md features_root convention, then a single existing default), gathering all candidates before deciding and throwing on ambiguous or multiply-declared roots; the grammar parser ignores commented-out lines and strips inline comments deterministically
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-13
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add deterministic features-root resolution and grammar

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const c=require('./bin/cli.js'); if(typeof c.resolveFeaturesRoot!=='function'){process.exit(1)} const d=fs.mkdtempSync(path.join(os.tmpdir(),'agm-')); fs.mkdirSync(path.join(d,'docs')); fs.writeFileSync(path.join(d,'AGENTS.md'),'<!-- features_root: docs/OLD -->\nfeatures_root: docs # inline\n'); if(path.basename(c.resolveFeaturesRoot(d))!=='docs'){process.exit(1)}"
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const c=require('./bin/cli.js'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'agm-')); fs.writeFileSync(path.join(d,'AGENTS.md'),'features_root: a\nfeatures_root: b\n'); let t=false; try{c.resolveFeaturesRoot(d)}catch(e){t=true} if(!t){process.exit(1)}"
```

<a id="task-US-05-TASK-BE-02"></a>
### US-05-TASK-BE-02

- **Task ID:** US-05-TASK-BE-02
- **Title:** Add the ai-toolkit resolve-features-root invocable command
- **Outcome:** bin/cli.js adds a resolve-features-root subcommand that on success prints only the resolved absolute path to stdout with exit 0, and on a missing, invalid, ambiguous, or multiply-declared root exits non-zero with diagnostics on stderr and nothing on stdout
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01
- **Acceptance criteria:** AC-27
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add resolve-features-root invocable command

**Verification commands:**

```
node --check bin/cli.js
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'agm-')); fs.mkdirSync(path.join(d,'docs')); fs.writeFileSync(path.join(d,'AGENTS.md'),'features_root: docs\n'); const r=cp.spawnSync('node',[path.resolve('bin/cli.js'),'resolve-features-root'],{cwd:d,encoding:'utf8'}); if(r.status!==0){process.exit(1)} if(r.stdout.trim()!==path.join(d,'docs')){process.exit(1)} if(r.stderr.trim()!==''){process.exit(1)}"
```

```
node -e "const cp=require('child_process'),os=require('os'),fs=require('fs'),path=require('path'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'agm-')); fs.writeFileSync(path.join(d,'AGENTS.md'),'features_root: a\nfeatures_root: b\n'); const r=cp.spawnSync('node',[path.resolve('bin/cli.js'),'resolve-features-root'],{cwd:d,encoding:'utf8'}); if(r.status===0){process.exit(1)} if(r.stdout.trim()!==''){process.exit(1)} if(r.stderr.trim()===''){process.exit(1)}"
```

<a id="task-US-05-TASK-BE-03"></a>
### US-05-TASK-BE-03

- **Task ID:** US-05-TASK-BE-03
- **Title:** Migrate define-feature.md to resolve-features-root and the ledger facade with null tokens
- **Outcome:** define-feature.md invokes ai-toolkit resolve-features-root once, captures the stdout path, and reuses that exact value for feature.md and ledger --dir so the define-feature:define entry is written in the same feature directory the pipeline later uses; it calls ai-toolkit ledger open and close omitting --tokens so phase_delta_tokens is recorded as null
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-02
- **Acceptance criteria:** AC-14, AC-15
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** refactor
- **Commit scope:** —
- **Commit subject:** migrate define-feature to resolve-features-root and ledger facade

**Verification commands:**

```
grep -q 'ai-toolkit resolve-features-root' src/claude/agents/define-feature.md
```

```
grep -q 'ai-toolkit ledger open' src/claude/agents/define-feature.md
```

```
grep -q 'ai-toolkit ledger close' src/claude/agents/define-feature.md
```

<a id="task-US-05-TASK-TEST-01"></a>
### US-05-TASK-TEST-01

- **Task ID:** US-05-TASK-TEST-01
- **Title:** Write resolve-features-root resolution, grammar, and CLI-contract tests
- **Outcome:** Tests verify the resolve-features-root output contract (stdout-only resolved path on success; stderr diagnostics with empty stdout on missing, invalid, ambiguous, or multiply-declared roots) and the AGENTS.md grammar parser (commented-out lines ignored, inline comments stripped), fully exercising the deterministic resolution behaviour
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-02, INFRA-TASK-TEST-02
- **Acceptance criteria:** AC-27
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add resolve-features-root resolution and grammar tests

**Verification commands:**

```
npm test -- --testPathPattern=ledger-cli.test.js --testNamePattern='resolve.*features.*root|ambiguous|grammar'
```

<a id="task-US-05-TASK-TEST-02"></a>
### US-05-TASK-TEST-02

- **Task ID:** US-05-TASK-TEST-02
- **Title:** Write installer/packaging propagation tests for ledger assets
- **Outcome:** Tests verify the installer propagates pm-phase*.js and the migrated define-feature.md through the catalog/manifest with no manually synced dual copies, so the ledger CLI assets reach a destination project via packaging alone
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-05-TASK-BE-03
- **Acceptance criteria:** AC-22
- **Estimate — agent minutes:** 6
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add installer propagation tests for ledger assets

**Verification commands:**

```
npm test -- --testNamePattern='installer|propagat|packaging'
```

<a id="task-US-06-TASK-BE-01"></a>
### US-06-TASK-BE-01

- **Task ID:** US-06-TASK-BE-01
- **Title:** Implement fail-closed corrupt-ledger handling in the module
- **Outcome:** When a write opens a malformed ledger the module backs up the corrupt content to a recoverable sidecar, does not overwrite the original, and fails closed with diagnostics; a fresh ledger is created only by an explicit recovery action, never silently
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-03
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add fail-closed corrupt-ledger backup handling

**Verification commands:**

```
node --check lib/execution-ledger.js
```

```
node -e "const os=require('os'),fs=require('fs'),path=require('path'); const m=require('./lib/execution-ledger'); const d=fs.mkdtempSync(path.join(os.tmpdir(),'led-')); const f=path.join(d,'FTR-999-token-ledger.json'); fs.writeFileSync(f,'{not valid json'); let threw=false; try{m.open(d,'FTR-999','a','p','haiku',1)}catch(e){threw=true} if(!threw){process.exit(1)} if(fs.readFileSync(f,'utf8')!=='{not valid json'){process.exit(1)} if(!fs.readdirSync(d).some(n=>n.indexOf('backup')!==-1)){process.exit(1)}"
```

<a id="task-US-06-TASK-TEST-01"></a>
### US-06-TASK-TEST-01

- **Task ID:** US-06-TASK-TEST-01
- **Title:** Write malformed-ledger backup and fail-closed tests
- **Outcome:** Tests create a malformed JSON ledger and verify the corrupt content is backed up to a sidecar, the original is never overwritten, the operation exits non-zero, and no fresh empty ledger is silently created
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-06-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add malformed-ledger backup and fail-closed tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='malformed|corrupt|backup|fail.*closed'
```

<a id="task-US-07-TASK-TEST-01"></a>
### US-07-TASK-TEST-01

- **Task ID:** US-07-TASK-TEST-01
- **Title:** Write resume idempotency and duplicate-prevention tests
- **Outcome:** Tests verify that re-opening the same operation_id produces no duplicate entry, the original started_at is preserved, a positive phase_delta_tokens survives a close with --tokens omitted, and exactly one entry remains after a resume
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, US-02-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 27000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add resume idempotency and duplicate-prevention tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='resume|idempotent|no.*duplicate|preserve.*token'
```

<a id="task-US-08-TASK-TEST-01"></a>
### US-08-TASK-TEST-01

- **Task ID:** US-08-TASK-TEST-01
- **Title:** Write new-attempt distinct-operation_id and determinism tests
- **Outcome:** Tests verify that incrementing the attempt yields an operation_id distinct from the original while both entries remain correlatable by the same agent key and the original attempt is untouched, and that the three colliding agent slugs (a:b, a/b, a-b) produce three distinct ids while an identical tuple is deterministic across calls
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-01-TASK-BE-01, INFRA-TASK-BE-02, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-25
- **Estimate — agent minutes:** 11
- **Estimate — tokens:** 27000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add rework attempt distinctness and determinism tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='rework|attempt|distinct|collision|deterministic'
```

<a id="task-US-09-TASK-TEST-01"></a>
### US-09-TASK-TEST-01

- **Task ID:** US-09-TASK-TEST-01
- **Title:** Write concurrent-update lock-serialization tests
- **Outcome:** Tests simulate two processes updating the same ledger concurrently and verify access is serialized by the cross-process lock, both updates are present with no lost update, and both entries carry correct data
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, INFRA-TASK-BE-04, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add concurrent-write serialization tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='concurrent|no.*lost.*update|lock.*serial'
```

<a id="task-US-10-TASK-TEST-01"></a>
### US-10-TASK-TEST-01

- **Task ID:** US-10-TASK-TEST-01
- **Title:** Write stale-lock and orphan-lock recovery tests with ABA guards
- **Outcome:** Tests verify a live lock triggers timeout and retry, a stale lock (age over 30s AND owner not alive) is safely reclaimed, an orphan lock with no recoverable PID is reclaimed once file-mtime age exceeds the threshold via a guarded content and stat ABA check, a younger malformed lock is waited on rather than force-deleted, and the ledger is never blocked permanently or corrupted
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** INFRA-TASK-BE-05, US-01-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-08, AC-26
- **Estimate — agent minutes:** 13
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add stale-lock and orphan-lock recovery tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='stale.*lock|orphan|reclaim|ABA|blocked'
```

<a id="task-US-11-TASK-BE-01"></a>
### US-11-TASK-BE-01

- **Task ID:** US-11-TASK-BE-01
- **Title:** Add null-compatibility to implement-feature/SKILL.md readers
- **Outcome:** implement-feature/SKILL.md actuals and cost-calculation steps treat null, 0, and not_available token values as data unavailable and never render them as an observable real zero consumption, preventing resume clobber and legacy misinterpretation
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-18
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** fix
- **Commit scope:** —
- **Commit subject:** treat null/0/not_available tokens as unavailable in actuals reader

**Verification commands:**

```
grep -Eq 'null.*unavailable|data.*unavailable|not_available' src/claude/skills/implement-feature/SKILL.md
```

```
! grep -q 'tokens || 0' src/claude/skills/implement-feature/SKILL.md
```

<a id="task-US-11-TASK-TEST-01"></a>
### US-11-TASK-TEST-01

- **Task ID:** US-11-TASK-TEST-01
- **Title:** Write legacy-field preservation and FTR-014 fixture compatibility tests
- **Outcome:** Tests verify that entries carrying unknown or legacy fields and lacking operation_id are updated in place via the unambiguous agent fallback with unknown fields preserved verbatim and no operation_id added, and that a real FTR-014 ledger fixture parses and updates without data loss or auto-migration of unrelated legacy values
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01, INFRA-TASK-TEST-01
- **Acceptance criteria:** AC-12, AC-16
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** Atomic task with a single verifiable output; no grouping required.
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add legacy-field and FTR-014 fixture compatibility tests

**Verification commands:**

```
npm test -- --testPathPattern=execution-ledger.test.js --testNamePattern='legacy|FTR-014|unknown.*field|preserve.*verbatim'
```

## Statistics

| Domain | Count | Target | Above | Warning | Split |
|--------|-------|--------|-------|---------|-------|
| BE | 26 | 26 | 0 | 0 | 0 |
| FE | 0 | 0 | 0 | 0 | 0 |
| DB | 0 | 0 | 0 | 0 | 0 |
| DevOps | 0 | 0 | 0 | 0 | 0 |
| INFRA | 0 | 0 | 0 | 0 | 0 |
| TEST | 14 | 14 | 0 | 0 | 0 |
| **Total** | **40** | **40** | **0** | **0** | **0** |
