# Work Breakdown — Installer Bash Allowlist

## Document Info

| Field | Value |
|-------|-------|
| Feature | FTR-012 — Installer Bash Allowlist |
| Version | 1.0 |
| Date | 2026-07-30 |
| Status | Draft |
| Source: Requirements | FTR-012-Requirements.md |
| Source: Tech-Spec | FTR-012-Tech-Spec.md |

---

## 1. Summary

| Metric | Value |
|--------|-------|
| Total User Stories | 5 |
| Total Tasks | 17 |
| Domain distribution | BE: 9, INFRA: 4, TEST: 4 |
| Complexity | S: 8, M: 7, L: 2 |
| Estimated total (Human) | 22.5h |
| Estimated total (Agent) | 95min |
| Implementation phases | 6 (1 INFRA + 5 User Stories) |

---

## 2. Shared Infrastructure Tasks

| ID | Task | Domain | Required by | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|-------------|------------|-----------|-----------|-------------|
| INFRA-T01 | Define CANONICAL_ALLOW and CANONICAL_ASK arrays | INFRA | US-01, US-02, US-03, US-04, US-05 | S | 30min | 5min | Add two constant arrays to bin/cli.js with the fixed lists from AC-11 and AC-12. Ensure exact command formatting (Bash(cmd:*)) and ordering. |
| INFRA-T02 | Implement normalizeSettings() helper function | INFRA | US-01, US-02, US-03, US-04, US-05 | M | 1.5h | 10min | Create utility function that ensures settings.local.json has the expected shape (permissions.Bash.allow and .ask arrays). Handles missing or malformed structure. |
| INFRA-T03 | Implement deduplication and merge logic | INFRA | US-01, US-02, US-03, US-04, US-05 | M | 2h | 12min | Create mergeArrays() and applyAskBeatsAllow() helpers for union, dedup, and priority. Test with simple unit test fixtures. |
| INFRA-T04 | Implement file I/O wrapper with error handling | INFRA | US-01, US-02, US-03, US-04, US-05 | M | 1.5h | 10min | Create readSettings() and writeSettings() functions that wrap fs operations, handle missing files, parse/stringify JSON, catch errors, and log warnings. |

---

## 3. User Stories

### US-01: Fresh Installation with Allowlist Opt-In

| Field | Value |
|-------|-------|
| Derived from | UC-01 |
| Actor | Developer / Installer User |
| Priority | Must |
| Acceptance Criteria | AC-01, AC-08 |

**Description:**
As a developer installing the AI Toolkit for the first time, I want the installer to offer me an opt-in prompt to create a Bash permission allowlist, so that pm-phase3 worker agents can run safe read-only commands without stalling the pipeline on confirmation prompts.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-01-T01 | Implement mergeAllowlist() core function | BE | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04 | L | 4h | 25min | Implement the main mergeAllowlist(destDir) function in bin/cli.js. Handle fresh install case (no existing settings.local.json). Create file with canonical lists. Return { status: 'written' }. |
| US-01-T02 | Add merge-allowlist CLI entry point | BE | US-01-T01 | M | 1h | 8min | Add argv handler in bin/cli.js main() that captures 'merge-allowlist <dest>', calls mergeAllowlist(), checks exit code, and logs result to stdout/stderr. |
| US-01-T03 | Export mergeAllowlist via require.main guard | INFRA | US-01-T02 | S | 20min | 3min | Add mergeAllowlist to the module.exports block in the else branch of require.main === module guard. Ensure it's exported alongside existing functions. |
| US-01-T04 | Create basic test fixtures for fresh install | TEST | US-01-T03 | M | 1.5h | 10min | Set up Jest test file tests/cli/mergeAllowlist.test.js with beforeEach/afterEach tmpDir cleanup. Create test case verifying fresh install creates file with canonical lists. |
| US-01-T05 | Verify fresh install test passes | TEST | US-01-T04 | S | 30min | 5min | Run 'npm test -- mergeAllowlist.test.js' and verify test passes. Check that output JSON contains exactly canonical allow and ask arrays. |

---

### US-02: Merge Allowlist into Existing Settings

| Field | Value |
|-------|-------|
| Derived from | UC-02 |
| Actor | Developer / Installer User |
| Priority | Must |
| Acceptance Criteria | AC-02, AC-05 |

**Description:**
As a developer with an existing settings.local.json file containing custom permission rules, I want the installer to merge the canonical allowlist with my existing rules without dropping any of my custom entries.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-02-T01 | Handle existing settings.local.json merge path | BE | INFRA-T01, INFRA-T02, INFRA-T03, INFRA-T04, US-01-T01 | M | 2h | 12min | Extend mergeAllowlist() to read existing file, parse JSON, fuse canonical lists with existing allow/ask, deduplicate, and write back. Return { status: 'merged', preserved: N }. Preserve non-Bash sections. |
| US-02-T02 | Implement malformed JSON recovery | BE | US-02-T01 | M | 1.5h | 10min | Wrap JSON.parse in try/catch in mergeAllowlist(). On error, log warning "settings.local.json is not valid JSON; resetting to default", reset to canonical lists, and return { status: 'reset', reason: 'malformed' }. |
| US-02-T03 | Create test fixture for merge with user rules | TEST | US-02-T01, US-02-T02 | M | 1.5h | 10min | Add test case in mergeAllowlist.test.js verifying that existing allow/ask + canonical lists = union with no user rules dropped. Verify no duplicates. |
| US-02-T04 | Create test fixture for malformed JSON recovery | TEST | US-02-T02 | M | 1h | 8min | Add test case writing invalid JSON to settings.local.json, calling mergeAllowlist(), verifying file is reset to canonical, function logs warning, and returns 'reset' status. |

---

### US-03: Ask-Beats-Allow Conflict Resolution

| Field | Value |
|-------|-------|
| Derived from | UC-03 |
| Actor | mergeAllowlist function |
| Priority | Must |
| Acceptance Criteria | AC-03, AC-04 |

**Description:**
As the merge algorithm, I need to enforce ask-beats-allow priority so that if a command appears in both the allow list and the ask list, it is removed from allow and appears only in ask, ensuring dangerous commands are never auto-approved.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-03-T01 | Implement ask-beats-allow priority logic in mergeAllowlist() | BE | US-02-T01, US-02-T02 | L | 3h | 15min | After merging allow and ask arrays, apply applyAskBeatsAllow() to remove from allow any command that exists in ask. Verify both directions: existing-allow + canonical-ask, and existing-ask + canonical-allow. |
| US-03-T02 | Create test cases for ask-beats-allow conflicts | TEST | US-03-T01 | M | 1.5h | 10min | Add two test cases: (1) command in existing allow + canonical ask → must be in ask only; (2) command in existing ask + canonical allow → must stay in ask only. Verify no duplicates in result. |

---

### US-04: Reinstall with Idempotent Merge

| Field | Value |
|-------|-------|
| Derived from | UC-04 |
| Actor | Developer / Installer User |
| Priority | Must |
| Acceptance Criteria | AC-09 |

**Description:**
As a developer reinstalling the AI Toolkit with the same version, I want the merge operation to be idempotent so that running the installer twice produces the same result with no duplicate entries.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-04-T01 | Verify mergeAllowlist() idempotency property | TEST | US-03-T02 | M | 1.5h | 10min | Add test case calling mergeAllowlist(destDir) twice with same input. Verify that running it twice produces identical output to running it once. Verify second run returns 'merged' status (not error). No duplicate entries introduced. |

---

### US-05: .gitignore Creation and Idempotent Update

| Field | Value |
|-------|-------|
| Derived from | UC-05 |
| Actor | install-toolkit Agent |
| Priority | Must |
| Acceptance Criteria | AC-06, AC-07 |

**Description:**
As the installer, I need to ensure that after writing settings.local.json, the .gitignore file is updated to include the line `.claude/settings.local.json` so that the local settings file is not accidentally committed to the repository.

#### Tasks

| ID | Task | Domain | Dependencies | Complexity | Human Est. | Agent Est. | Description |
|----|------|--------|--------------|------------|-----------|-----------|-------------|
| US-05-T01 | Implement updateGitignore() helper function | BE | US-01-T01 | M | 1.5h | 10min | Create updateGitignore(destDir) function that reads .gitignore (or creates if missing), checks for existing `.claude/settings.local.json` entry, and appends if not found. Idempotent. |
| US-05-T02 | Call updateGitignore() from install-toolkit agent | INFRA | US-05-T01 | S | 30min | 5min | In install-toolkit.md Step 6, after calling 'node bin/cli.js merge-allowlist <dest>', invoke updateGitignore() logic or equivalent. Record status in Step 7 report. |
| US-05-T03 | Create test cases for .gitignore idempotency | TEST | US-05-T01 | M | 1.5h | 10min | Add test cases: (1) .gitignore does not exist → create with entry; (2) .gitignore exists without entry → append; (3) .gitignore already has entry → no duplicate. Verify three scenarios pass. |

---

## 4. Dependency Graph

### Implementation Phases

Phases are organized as **vertical slices**: each phase delivers a complete, committable task group. Within a phase, tasks execute in dependency order (INFRA/BE → TEST); independent tasks within the same layer may run in parallel.

#### Phase 1 — Shared Infrastructure (no dependencies)

| Task ID | Task | Domain |
|---------|------|--------|
| INFRA-T01 | Define CANONICAL_ALLOW and CANONICAL_ASK arrays | INFRA |
| INFRA-T02 | Implement normalizeSettings() helper function | INFRA |
| INFRA-T03 | Implement deduplication and merge logic | INFRA |
| INFRA-T04 | Implement file I/O wrapper with error handling | INFRA |

#### Phase 2 — US-01: Fresh Installation with Allowlist Opt-In (depends on Phase 1)

| Task ID | Task | Domain |
|---------|------|--------|
| US-01-T01 | Implement mergeAllowlist() core function | BE |
| US-01-T02 | Add merge-allowlist CLI entry point | BE |
| US-01-T03 | Export mergeAllowlist via require.main guard | INFRA |
| US-01-T04 | Create basic test fixtures for fresh install | TEST |
| US-01-T05 | Verify fresh install test passes | TEST |

#### Phase 3 — US-02: Merge Allowlist into Existing Settings (depends on Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-02-T01 | Handle existing settings.local.json merge path | BE |
| US-02-T02 | Implement malformed JSON recovery | BE |
| US-02-T03 | Create test fixture for merge with user rules | TEST |
| US-02-T04 | Create test fixture for malformed JSON recovery | TEST |

#### Phase 4 — US-03: Ask-Beats-Allow Conflict Resolution (depends on Phase 3)

| Task ID | Task | Domain |
|---------|------|--------|
| US-03-T01 | Implement ask-beats-allow priority logic in mergeAllowlist() | BE |
| US-03-T02 | Create test cases for ask-beats-allow conflicts | TEST |

#### Phase 5 — US-04: Reinstall with Idempotent Merge (depends on Phase 4)

| Task ID | Task | Domain |
|---------|------|--------|
| US-04-T01 | Verify mergeAllowlist() idempotency property | TEST |

#### Phase 6 — US-05: .gitignore Creation and Idempotent Update (depends on Phase 2)

| Task ID | Task | Domain |
|---------|------|--------|
| US-05-T01 | Implement updateGitignore() helper function | BE |
| US-05-T02 | Call updateGitignore() from install-toolkit agent | INFRA |
| US-05-T03 | Create test cases for .gitignore idempotency | TEST |

### Critical Path

The longest dependency chain determining minimum implementation time:

```
INFRA-T01 → INFRA-T02 → INFRA-T03 → INFRA-T04 
  → US-01-T01 → US-01-T02 → US-01-T03 → US-01-T04 → US-01-T05 
  → US-02-T01 → US-02-T02 → US-02-T03 → US-02-T04 
  → US-03-T01 → US-03-T02 
  → US-04-T01
```

Estimated critical path duration: ~13–14 hours (human developer), ~60 minutes (AI agent).

---

## 5. Domain Summary

| Domain | Tasks | S | M | L | Human Total | Agent Total |
|--------|-------|---|---|---|------------|------------|
| BE | 9 | 0 | 4 | 2 | 12h | 60min |
| INFRA | 4 | 1 | 2 | 0 | 4.5h | 23min |
| TEST | 4 | 4 | 0 | 0 | 6h | 12min |
| **Total** | **17** | **8** | **7** | **2** | **22.5h** | **95min** |

---

## 6. Traceability Matrix

| UC | US | Tasks | ACs Covered |
|----|----|----|-------------|
| UC-01 | US-01 | US-01-T01, US-01-T02, US-01-T03, US-01-T04, US-01-T05 | AC-01, AC-08 |
| UC-02 | US-02 | US-02-T01, US-02-T02, US-02-T03, US-02-T04 | AC-02, AC-05 |
| UC-03 | US-03 | US-03-T01, US-03-T02 | AC-03, AC-04 |
| UC-04 | US-04 | US-04-T01 | AC-09 |
| UC-05 | US-05 | US-05-T01, US-05-T02, US-05-T03 | AC-06, AC-07 |

**Additional coverage (shared infrastructure and reference documentation):**
- AC-09, AC-10: Unit test determinism and pass rate — covered by all TEST tasks
- AC-11, AC-12: Canonical command lists — verified in INFRA-T01, referenced in all phases
- AC-13: Documentation in reference.md — will be added in post-implementation documentation phase (not in this work breakdown)
- AC-14: install-toolkit Step 7 report — covered in US-05-T02 (report integration)

---

## 7. Open Points & Risks

| # | Item | Impact on Work Breakdown | Suggested Resolution |
|---|------|--------------------------|---------------------|
| 1 | `git checkout` placement (ask vs allow in future) | Low for MVP; future decision point | Document in reference.md that git checkout is only in main loop (implement-feature Step 5), not in pm-phase3 worker agents. Mark as future consideration if pm-phase3 gains branch-management steps. Decision does not affect this work breakdown. |
| 2 | Stack detection from AGENTS.md (deferred) | Out of scope for this feature | Canonical lists are combined (.NET + npm + base read-only). Unused entries are harmless. Future iteration (OPT-item) can add stack-specific detection. No action for this breakdown. |
| 3 | Auto-upgrade allowlist on reinstall without user confirmation | Out of scope for this feature | Current design re-offers opt-in prompt on every install run. Merge is idempotent — duplicate entries are deduped. No action for this breakdown. This is a design choice, not a risk. |
| 4 | Test framework verification (Jest 29.7.0+) | Dependency on npm environment | Verify AGENTS.md lists Jest ^29.7.0 as test runner. All test tasks assume Jest is available. No blocking issue. |

---

## 8. Implementation Notes

### Step-by-step process for developer

1. **Phase 1 (INFRA)**: Implement helper functions and constants in bin/cli.js. Export via require.main guard.
2. **Phase 2 (US-01)**: Implement mergeAllowlist() core for fresh install case. Write and run basic test. Verify 'node bin/cli.js merge-allowlist <tmp>' works.
3. **Phase 3 (US-02)**: Extend mergeAllowlist() to handle existing files, merge, and malformed JSON. Add corresponding tests.
4. **Phase 4 (US-03)**: Implement ask-beats-allow priority logic. Add conflict resolution tests.
5. **Phase 5 (US-04)**: Add idempotency test to verify all prior phases work correctly when run twice.
6. **Phase 6 (US-05)**: Implement updateGitignore() helper. Integrate into install-toolkit.md Step 6. Test .gitignore scenarios.
7. **Final verification**: Run `npm test` to verify all tests pass. No existing tests broken.

### For AI agent execution

All tasks are single-domain (BE, INFRA, or TEST) and can be executed independently by developer agents once their dependencies are met. Tasks within the same phase (except TEST) may execute in parallel if dependency graph allows.

---
