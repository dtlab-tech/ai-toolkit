# Historical snapshot — FTR-018 Validation Report (superseded 2026-09-20)

## Executive Summary

This re-validation confirms that all 16 Acceptance Criteria and 6 Open Questions in feature.md are accurately and completely addressed in both FTR-018-Requirements.md and FTR-018-Tech-Spec.md. All 10 corrected points from the remediation cycle have been verified as correctly reflected in the updated documents. **Zero gaps remain.**

| Document | ACs covered | OQs covered | Gaps found | Status |
|----------|-------------|-------------|-----------|--------|
| FTR-018-Requirements.md | 16/16 | 6/6 resolved | 0 | ✅ Clean |
| FTR-018-Tech-Spec.md | 16/16 | 6/6 resolved | 0 | ✅ Clean |

**Validation Date:** 2026-09-18  
**Validator Method:** Point-by-point cross-reference of all ACs, OQs, and 10 corrected items against feature.md source.

---

## Gaps Found and Resolved

(none)

---

## Verification of 10 Corrected Points

### 1. AC-03 Wording — Dispatch Precondition Logic ✓

**Feature.md (line 291):** "Dispatch is blocked and the agent is not invoked if any of the following **conditions are not met**"

**Requirements.md (AC-03, line 706):** "dispatch is blocked and the agent is not invoked if any of the following **preconditions is NOT satisfied**"

**Requirements.md (BR-05, line 419):** "Pre-dispatch checks must **all** pass before an agent is invoked... If **any** check fails, dispatch is blocked."

**Verification:** Both phrasings are logically equivalent (¬met ≡ NOT satisfied). BR-05 provides additional clarity: "all must pass" = "if any fails, dispatch blocked." ✅ **VERIFIED — Correct and consistent.**

---

### 2. AC-14 Related UC and AC-16 Related UCs ✓

**Feature.md (AC-14, line 302):** Distribution requirement for toolkit installation

**Requirements.md (AC-14, line 717):** "Given the toolkit is installed locally or globally, when the installed payload is inspected, then the executor module and its associated CLI commands are present; test files, fixtures, and temporary directories created during testing are absent from the distributed payload."

**Related UC:** `UC-08` (Run Parallel Execution with N Isolated Worktrees)

**Feature.md (AC-16, line 304):** "all other cross-branch actions remain exclusively under user control"

**Requirements.md (AC-16, line 719):** Related UCs: `All UCs`

**Verification:** AC-14 and AC-16 UC references are now present and correctly specified. AC-14 references UC-08 (parallel execution — Increment 7 includes distribution integration). AC-16 references all UCs because no automatic actions are permitted across the entire executor lifecycle. ✅ **VERIFIED — UC references correct.**

---

### 3. OQ-01 Status — Runtime Bridge Resolved to Percorso C ✓

**Feature.md (OQ-01, line 349):** "Must be answered by a limited, authorized feasibility spike before Gate 1"

**Requirements.md (OQ-01, line 752):** 
```
**RESOLVED (2026-09-18) — Percorso C:** Node.js coordinator uses `spawnSync(claude.exe, 
['--print', '--output-format', 'json', '--json-schema', <schema>, '--model', <model>, 
'--max-budget-usd', <budget>, '--agent', <nativeName>, '--permission-mode', 'auto', 
'--permission-prompts', 'none', <prompt>], {cwd: worktreeDir, encoding: 'utf8', timeout: <ms>}). 
Exit 0 confirmed with structured JSON output and full usage data. 
Full evidence: `FTR-018-Gate1-Review-Actions.md` Point 4.
```

**Requirements.md (Assumption A-08, line 746):** "Runtime bridge spike (Percorso C) completed before Gate 1 (2026-09-18). OQ-01 RESOLVED."

**Tech-Spec.md (Section 3, line 223):** "Runtime Bridge Solution (OQ-01 — RESOLVED via Percorso C)"

**Verification:** OQ-01 is marked as RESOLVED with full implementation details (Percorso C: `spawnSync`, JSON output, agent verification, timeout handling). Completion confirmed pre-Gate 1. ✅ **VERIFIED — OQ-01 fully resolved.**

---

### 4. Tech-Spec Section 3 — Percorso C Bridge Specification ✓

**Requirement:** Complete specification of Percorso C (Node.js + claude.exe subprocess) as the actual implemented bridge, with Percorso A (agent() sandbox) explicitly listed as rejected.

**Tech-Spec.md (Section 3.1, lines 226–233):**
```
**Mechanism:** Node.js coordinator invokes `claude.exe` as a subprocess using `spawnSync` 
(or `spawn` for long-running tasks), in non-interactive `--print` mode, with structured 
JSON output and an explicit JSON schema.

**Rejected alternatives:**
- **Percorso A** (`agent()` in workflow sandbox): rejected — the Claude workflow runtime 
  is an isolated ECMAScript sandbox with no access to `process`, `require()`, `import()`, 
  or file system. All I/O would pass through `agent(haiku)` calls, violating the 
  requirement for LLM-free deterministic operations.
- **Percorso B** (new CLI dispatch mechanism): rejected — would require SDK modifications 
  not available in v2.1.260.
```

**Tech-Spec.md (Section 3.2, lines 236–263):** Complete API contract with spawnSync parameters, output structure, token telemetry.

**Verification:** Percorso C fully specified; Percorso A explicitly rejected with rationale; all API details present. ✅ **VERIFIED — Section 3 complete.**

---

### 5. Plan Parsing — Lossless MD + Digest Over Both Sources ✓

**Requirement:** "Tech Spec §7.1 now specifies lossless MD parsing (outcome, verifications, task-level deps); digest covers both MD+CSV"

**Tech-Spec.md (Section 7.1, lines 624–639):**
```
**Markdown document:** `{PREFIX}-Work-Breakdown.md` (machine-parseable, not informational only)
- Contains: task outcome descriptions, task-level verifications, task-level dependencies 
  (may differ from phase-level CSV)
- **Must be parsed losslessly:** outcome, verifications, and task-level dependencies 
  cannot be discarded
- Parsed sections: `## Phase N — Title`, `### Task {ID}: Title`, outcome bullet, 
  verification checklist, dependency annotations
```

**Tech-Spec.md (Section 7.2, lines 705–707):**
```javascript
// 7. Compute content digest over BOTH sources
// MD is not informational: it contains outcome, verifications, task-level deps
const digest = sha256(csvContent + '\n---\n' + markdownContent) // both files
```

**Tech-Spec.md (Section 7.3, line 752):** "Bind snapshot by content digest (SHA-256 of CSV + MD concatenated)"

**Verification:** Lossless MD parsing clearly required; digest explicitly computed from both CSV and MD concatenated. ✅ **VERIFIED — Both sources required for digest.**

---

### 6. Lock Identity — PID + Start-Time, No Age-Based Recovery, Worktree .git Resolution ✓

**Requirement:** "Lock identity: Tech Spec §8.2 now uses PID+start-time identity, removes age-based recovery, adds .git file resolution for worktrees"

**Tech-Spec.md (Section 8.2, line 790):**
```
`worker_id` encodes the coordinator's PID **and** process start-time (from `/proc/[pid]/stat` 
on Linux or `wmic process` on Windows). The start-time prevents PID recycling attacks: 
if a new process has reused the old PID but has a different start-time, the lock is stale.
```

**Tech-Spec.md (Section 8.2, line 811):**
```
**Age-based recovery is PROHIBITED.** A lock must not be reclaimed based on file 
modification time alone, regardless of how old the lock file is. If the process cannot 
be verified (e.g., different host), the operator must manually remove the lock after 
confirming the previous coordinator is dead.
```

**Tech-Spec.md (Section 8.2.1, lines 822–843):** Complete implementation with worktree .git file resolution:
```javascript
function resolveGitDir(worktreePath) {
  const gitPath = path.join(worktreePath, '.git');
  const stat = fs.statSync(gitPath);
  if (stat.isFile()) {
    // In a worktree: read the gitdir pointer
    const content = fs.readFileSync(gitPath, 'utf8');
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) throw new Error('Invalid .git file format');
    return path.resolve(worktreePath, match[1].trim());
  }
  return gitPath; // Normal repo: .git is a directory
}
```

**Verification:** PID+start-time used; age-based recovery explicitly prohibited; worktree .git resolution documented with code. ✅ **VERIFIED — All three aspects complete.**

---

### 7. Ledger Mapping — Real computeOperationId Signature, Distinct Ledger Identities ✓

**Requirement:** "Tech Spec §6.1 now uses real computeOperationId(prefix, agent, attempt) signature; distinct ledger identities for implementation/rework/review/skip"

**Tech-Spec.md (Section 6.1, lines 550–556):**
```javascript
// From lib/execution-ledger.js:316
function computeOperationId(prefix, agent, attempt) {
  const input = JSON.stringify([prefix, agent, attempt]);
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 32);
}
// The executor must use this exact function (imported from `lib/execution-ledger.js`), 
// not any independent hash calculation.
```

**Tech-Spec.md (Section 6.1, lines 563–568) — Ledger Agent Names:**
```
| Activity | Ledger `agent` parameter | Purpose |
|----------|--------------------------|---------|
| Implementation attempt N | `{task_id}:implementation:{N}` | One entry per implementation dispatch |
| Rework attempt N | `{task_id}:rework:{N}` | Distinct from implementation; preserves full history |
| Review | `{task_id}:review:{N}` | One entry per review agent invocation |
| No-modification skip | `{task_id}:skip` | Recorded via `ledger skip`; no token cost |
```

**Tech-Spec.md (Section 6.1, line 575):** "One token count per activity, not per run: Each `close` call records only the tokens from that specific subprocess invocation."

**Verification:** Real function signature with exact implementation path specified; distinct identities for all four activity types. ✅ **VERIFIED — Signature and identities correct.**

---

### 8. Recovery — Commit-Search-by-Message, Identity/Plan/Content/Branch Verification ✓

**Requirement:** "Recovery: Tech Spec §9.3 resume table + §13.2 now cover commit-search-by-message, identity/plan/content/branch verification, integration-not-registered case"

**Tech-Spec.md (Section 9.3, Resume Evidence Table, line 956):**
```
| Commit created, SHA not in state | Reconcile without new commit or agent invocation | 
(1) Search Git log for commit matching the persisted `commit_message` template 
(`feat({fid}): {task_title}` + `Run: {run_id}` + `Attempt: {N}`); 
(2) verify: correct author identity, plan reference matches stored digest, content matches 
expected files, reachable on feature branch; (3) if all checks pass: register found SHA 
in state, close ledger |
```

**Tech-Spec.md (Section 13.2, lines 1320–1335) — Case B (crash between commit and state write):**
```
1. Search by persisted commit message: `git log --all --grep="Run: {run_id}" 
   --grep="Attempt: {N}" --all-match`
2. Verify each candidate commit:
   - **Identity:** `commit.author` matches expected coordinator identity
   - **Plan:** commit trailer `Run: {run_id}` matches current run; `Attempt: {N}` matches attempt
   - **Content:** `git diff {expected_base_sha}..{candidate_sha} -- {task_files}` 
     matches expected task scope
   - **Branch:** `git branch --contains {candidate_sha}` includes `feature/FTR-NNN-slug`
3. If exactly one commit passes all checks: register SHA in state; close ledger
```

**Tech-Spec.md (Section 13.2, lines 1330–1335) — Case C (integration committed but not verified on branch):**
```
1. `git merge-base --is-ancestor {original_sha} {feature_branch_head}` — if fails: 
   commit was not integrated
2. Search for integration commit: `git log {feature_branch} --ancestry-path {original_sha}..HEAD`
3. If integration found: record `integrated_sha`; mark attempt `integrated`
4. If not found: stop with diagnosis; do not auto-merge
```

**Verification:** Full commit-search algorithm documented; all four verification criteria (identity, plan, content, branch) explicitly listed. ✅ **VERIFIED — Recovery complete.**

---

### 9. Durability — Explicit Limits (Filesystem, Network, Windows), Replan with History Preservation, Diagnose Command ✓

**Requirement:** "Durability: Tech Spec §5.1 explicit limits (filesystem, network, Windows); replan with history preservation; diagnose command added (§9.6)"

**Tech-Spec.md (Section 5.1, lines 400–403) — Explicit Limits:**
```
**Explicit limits (not promised by this design):**
- Power loss without filesystem journal flush: on some configurations (e.g., ext4 
  `data=writeback`, network filesystems), a rename may appear to succeed but the data 
  may not reach stable storage before power loss. The executor does NOT add extra 
  `fsync()` calls beyond Node.js defaults; this is an accepted risk on such configurations.
- Concurrent coordinator on a network share: lock file exclusion relies on `open('wx')` 
  being atomic on the underlying filesystem; network filesystems (NFS, SMB) may not 
  provide this guarantee. The executor is designed for local filesystems only.
- Windows atomic replace: `fs.renameSync` on Windows uses `MoveFileEx` with 
  `MOVEFILE_REPLACE_EXISTING`, which is not atomic if the target is on a different volume. 
  The executor requires source and target to be on the same volume (standard for 
  `.git/` temp files).
```

**Tech-Spec.md (Section 9.5, lines 1021–1070) — `replan` Command with History Preservation:**
```
**Behavior:**
1. Require `--abandon` flag (no automatic abandonment)
2. Mark current run as `abandoned` in state file (history preserved; no data deleted)
3. Write an `abandonment_record` into the state file...
4. Preserve ALL worktree commits, branches, and files — nothing is deleted
5. Release lock
...
**History preservation:** The abandoned state file remains at `.git/executor-state-{run_id}.json`. 
It can be inspected via `status --run-id {run_id}`. The new run creates a NEW state file 
with a new `run_id`; it does NOT overwrite the abandoned run's state.
```

**Tech-Spec.md (Section 9.6, lines 1072–1108) — `diagnose` Command (read-only):**
```
**Purpose:** Produce a diagnostic report of the current executor state, identifying 
anomalies, inconsistencies between state and Git, and required manual actions

**Signature:**
```
ai-toolkit executor diagnose [--run-id <uuid>] [--verbose]
```

**Behavior (read-only — no state mutations):**
1. Read state file
2. For each task/attempt:
   - Cross-check `commit_info.original_sha` against Git reachability
   - Verify ledger entry status matches state
   - Detect open entries with no corresponding state update
   - Detect `integrated` commits not reachable on feature branch
3. Check lock: is it held? By a live process?
4. Report all anomalies with structured descriptions and suggested recovery actions
```

**Verification:** All three durability aspects present: explicit limits documented; replan preserves history; diagnose command fully specified. ✅ **VERIFIED — Durability complete.**

---

### 10. Bootstrap — Spike Completed Pre-Gate 1, pm-phase3 Delivery, No Self-Execution, Production After Gate 2 ✓

**Requirement:** "Bootstrap: Tech Spec §14 and §17 Increment 1 now confirm spike completed pre-Gate 1, pm-phase3 bootstrap, no self-execution, production after Gate 2"

**Tech-Spec.md (Section 14, lines 1344–1376) — Bootstrap Sequence:**
```
**Solution: FTR-018 is delivered via the existing `pm-phase3` path; the new executor 
becomes available only after FTR-018 is complete.**

**Gate sequence:**
- **Pre-Gate 1:** Runtime bridge spike (Percorso C) runs in a temporary isolated environment. 
  No production code. Spike COMPLETED 2026-09-18; OQ-01 RESOLVED.
- **Gate 1:** Documentation approval (Requirements + Tech Spec + Validation Report). 
  Production implementation blocked before this gate.
- **Gate 2:** Work Breakdown approval. Implementation blocked before this gate.
- **Post-Gate 2:** Implementation begins via `pm-phase3` (existing); produces executor modules.
- **Post-FTR-018:** New executor replaces `pm-phase3` for subsequent features.

**Constraints:**
- The new executor is NOT available during FTR-018 delivery. No self-execution or bootstrapping.
- No automatic push, merge, release, or gate approval is introduced by the executor itself.
- The spike (Increment 1) ran pre-Gate 1 in a temporary environment — not a production deliverable.
```

**Tech-Spec.md (Section 17, Increment 1, lines 1505–1534):**
```
**Status: COMPLETED 2026-09-18 (pre-Gate 1). OQ-01 RESOLVED. See Gate1-Review-Actions.md 
Point 4 for full evidence.**

**Tasks (all completed):**

1.1 **Record baseline state** ✓
1.2 **Runtime bridge spike — Percorso C** ✓
1.3 **Close OQ-01** ✓
1.4 **Gate 1 prerequisite:** Spike runs pre-Gate 1 (not deferred). OQ-01 must be 
RESOLVED before Gate 1 approval. ✓ Completed.
```

**Verification:** Spike completion confirmed pre-Gate 1 (2026-09-18); pm-phase3 used for FTR-018 delivery; no self-execution; executor available only post-FTR-018. ✅ **VERIFIED — Bootstrap documented.**

---

## Complete Acceptance Criteria Coverage

All 16 ACs verified present in both documents:

| AC # | Feature.md claim | Requirements.md | Tech-Spec.md | Status |
|------|------------------|-----------------|--------------|--------|
| AC-01 | Per-task dispatch, no agent-type grouping | UC-03, BR-01, AC-01 | Section 4.1, 11.1, 12.1 | ✅ |
| AC-02 | Stable deterministic ordering, invalid input rejected | UC-01, BR-03, AC-02 | Section 7.2 | ✅ |
| AC-03 | Pre-dispatch checks (ledger, lock, agent) | UC-03, BR-05, AC-03 | Section 3.2, 11.1 | ✅ |
| AC-04 | Ledger backward compat, null tokens | BR-07, BR-19, AC-04 | Section 6.1, 6.3 | ✅ |
| AC-05 | Checkpoint sequence with validation | BR-10, BR-11, AC-05 | Section 5.3, 13.1 | ✅ |
| AC-06 | Sequential execution (maxConcurrency=1) | UC-07, AC-06 | Section 11.1–11.2 | ✅ |
| AC-07 | Parallel execution (N worktrees, serial integration) | UC-08, AC-07 | Section 12.1–12.2 | ✅ |
| AC-08 | Lock prevents duplicate coordinators | UC-02, BR-04, AC-08 | Section 8.1–8.2 | ✅ |
| AC-09 | Resume idempotent, no re-invocation | UC-06, BR-13, AC-09 | Section 9.3, 13.2 | ✅ |
| AC-10 | Fault injection at boundaries | UC-09, AC-10 | Section 15.3 | ✅ |
| AC-11 | Recovery with preservation, stale-lock confirmed-inactivity | UC-06, BR-12–14, AC-11 | Section 8.2, 13.2 | ✅ |
| AC-12 | Startup detection (corruption, plan change, foreign mods) | UC-06, BR-15–16, AC-12 | Section 9.3, 9.6 | ✅ |
| AC-13 | Tests use real executor, temp repo, stub workers | UC-09, AC-13 | Section 15.1–15.4 | ✅ |
| AC-14 | Distribution without test files | AC-14 | Section 16.1–16.3 | ✅ |
| AC-15 | E2E with real feature and runtime | UC-09, AC-15 | Section 15.3, 17.9 | ✅ |
| AC-16 | No automatic push/merge/release; user control | BR-17, AC-16 | Section 14, 9, 16 | ✅ |

---

## Complete Open Questions Coverage

All 6 OQs resolved:

| OQ # | Feature.md question | Status | Requirements Evidence | Tech-Spec Evidence |
|------|---------------------|--------|----------------------|-------------------|
| OQ-01 | Runtime bridge mechanism | **RESOLVED** | Line 752 (Percorso C); Assumption A-08 | Section 3.1–3.6 (full API) |
| OQ-02 | State schema and durability | **RESOLVED** | Feature requirement | Section 5.1–5.4 (schema, atomic writes, limits) |
| OQ-03 | Ledger lifecycle mapping | **RESOLVED** | Feature requirement | Section 6.1–6.3 (computeOperationId, no migration) |
| OQ-04 | Plan parsing and snapshot binding | **RESOLVED** | Feature requirement | Section 7.1–7.3 (lossless, digest, binding) |
| OQ-05 | Lock and state file position | **RESOLVED** | Feature requirement | Section 8.1–8.4 (location, stale-lock, worktree resolution) |
| OQ-06 | CLI commands and configuration | **RESOLVED** | Section 6 (4 commands, config, exit codes) | Section 9.1–9.7, 10 (all commands, full contract) |

---

## Remaining Gaps

(none)

---

## Summary Table

| Dimension | Count | Status |
|-----------|-------|--------|
| Acceptance Criteria (ACs) | 16 | ✅ All covered |
| Open Questions (OQs) | 6 | ✅ All resolved |
| Use Cases (UCs) | 9 | ✅ All documented |
| Business Rules (BRs) | 22 | ✅ All specified |
| Implementation Increments | 9 | ✅ All detailed |
| Out-of-Scope Items | 8 | ✅ All verified excluded |
| Corrected Points | 10 | ✅ All verified accurate |

---

## Validation Conclusion

**STATUS: ✅ VALIDATION PASSED — ZERO GAPS**

All 16 Acceptance Criteria and 6 Open Questions in feature.md are accurately and completely addressed in both FTR-018-Requirements.md and FTR-018-Tech-Spec.md. All 10 corrected items from the remediation cycle have been verified as correctly reflected with specific evidence in the documents.

The documents are **ready for downstream consumption**, including:
- Gate 1 stakeholder review
- Development handoff to implementation agents
- Validation by FTR-019 architectural review

**Validation Date:** 2026-09-18
