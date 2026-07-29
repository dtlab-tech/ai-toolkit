# Validation Report — FTR-011

## Summary

| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-011-Requirements.md | 0 | 0 | ✅ Clean |
| FTR-011-Tech-Spec.md    | 0 | 0 | ✅ Clean |

## Validation details

### Functional behaviours (8 claims)
All functional behaviours from `feature.md` are covered:
- Installer writes manifest after install — **UC-01** (step 4), **UC-02** (step 4)
- Installer reads previous manifest on reinstall — **UC-02** (step 2a), **UC-04** main flow
- Installer computes orphaned files — **UC-02** (step 2c), **UC-06** main flow
- Installer moves orphans to trash — **UC-02** (step 2h), **UC-07** main flow
- Installer prompts per orphan in interactive mode — **UC-02** (step 2f), **AC-08**
- Installer auto-moves with `--force` — **UC-02** (step 2g), **UC-03**, **AC-09**
- Installer skips missing orphan files silently — **UC-02** error flow, **AC-04**
- First install has no prune step — **UC-01** step 7

### API endpoints and functions (4 claims)
All new functions are fully specified:
- `readManifest(destRoot)` — **Section 3.2** (Tech-Spec), **UC-04** (Requirements), **AC-14..16**
- `writeManifest(destRoot, fileList)` — **Section 3.2** (Tech-Spec), **UC-05** (Requirements), **AC-17**
- `computeOrphans(oldFiles, newFiles)` — **Section 3.2** (Tech-Spec), **UC-06** (Requirements), **AC-18..20**
- `moveToTrash(destRoot, relativePath)` — **Section 3.2** (Tech-Spec), **UC-07** (Requirements), **AC-11**, **AC-03**

### Data model (3 claims)
Manifest schema fully defined:
- Structure (version, installedAt, files) — **Requirements Section 4.1**, **Tech-Spec Section 3.1**
- All paths use forward slashes — **BR-04** (Requirements), **Constraints** (Tech-Spec Section 3.1)
- Paths are destination-relative — **Section 4.1** (Requirements), **Section 3.1** (Tech-Spec)

### Business rules (5 claims)
All business rules documented:
- Only toolkit-placed files are candidates for removal — **BR-02** (Requirements)
- Settings files never appear in manifest — **BR-03** (Requirements), **AC-13**
- Trash folder never appears in manifest — **BR-06** (Requirements), **AC-12**
- Corrupt manifest treated as empty — **BR-07** (Requirements), **AC-07**, **UC-04**
- Cross-device move fallback: copy + delete — **Section 8 Dependencies** (Requirements), **Section 3.2** (Tech-Spec)

### Security and safety (2 claims)
Safety constraints fully enforced:
- No hard deletion — **Out of scope** (Requirements Section 1.2)
- Only old manifest files are orphan candidates — **BR-02** (Requirements)

### Testing and CI (6 claims)
All test requirements specified:
- Unit tests for `readManifest()` — **AC-14..16**, **Section 4.1** (Tech-Spec)
- Unit tests for `writeManifest()` — **AC-17**, **Section 4.1** (Tech-Spec)
- Unit tests for `computeOrphans()` — **AC-18..20**, **Section 4.1** (Tech-Spec)
- Unit tests for `moveToTrash()` — **AC-03**, **AC-04**, **AC-11**, **Section 4.1** (Tech-Spec)
- Agent name == filename check — **AC-22**, **UC-08**, **Section 4.2** (Tech-Spec)
- All existing tests pass — **AC-25**, **Section 4.3** (Tech-Spec)

### Out-of-scope validation (9 items)
All out-of-scope items are correctly absent from both documents:
- Hard deletion via `fs.unlinkSync` — ✓ Not mentioned; safe-to-trash only
- Auto-cleanup of trash folder — ✓ Explicitly deferred (Deferred section, feature.md)
- Changes to `settings.json` / `settings.local.json` — ✓ NEVER_COPY rule applies
- Pruning of `install-toolkit/` directory — ✓ Already excluded by NEVER_COPY
- Pruning non-toolkit files — ✓ Only old manifest entries are candidates
- End-to-end subprocess tests — ✓ Unit tests only (AC-21, Tech-Spec Section 4.1)
- Tracking trash movements in manifest — ✓ Trash excluded from `files` array
- Skill name field check (AC-23) — ✓ Marked deferred (MVP vs Deferred section)
- Orphan references check (AC-24) — ✓ Marked deferred (MVP vs Deferred section)

### File inventory cross-reference
Both documents agree on implementation scope:

**New files (4 test files):**
- `tests/cli/readManifest.test.js` — **File Inventory** (Tech-Spec Section 9)
- `tests/cli/computeOrphans.test.js` — **File Inventory** (Tech-Spec Section 9)
- `tests/cli/moveToTrash.test.js` — **File Inventory** (Tech-Spec Section 9)
- `tests/cli/writeManifest.test.js` — **File Inventory** (Tech-Spec Section 9)

**Modified files (2 files):**
- `bin/cli.js` — add functions, integrate prune phase, update exports
- `tests/frontmatter/agents.test.js` — add agent name-check assertion

### Implementation order
Tech-Spec Section 10 provides a clear 5-step sequential order:
1. Implement pure functions in `bin/cli.js`
2. Write unit tests for new functions
3. Integrate prune phase into `runInstall()`
4. Add agent name-check test
5. Run full test suite and verify

Each step has clear dependencies documented.

### Acceptance criteria alignment
**Tech-Spec Section 12 (Acceptance Criteria Alignment)** provides a complete cross-reference table mapping all 25 acceptance criteria from the feature to implementation artifacts, with coverage status for each:
- AC-01..13: Core manifest, prune, and safety requirements — all mapped
- AC-14..21: Pure function unit tests — all mapped
- AC-22: Agent name check — mapped to new test
- AC-23..24: Deferred items — correctly noted as "not included in MVP"
- AC-25: Existing tests — mapped to test suite run

## Gaps found and resolved
(none)

## Remaining gaps
(none)

## Validation methodology

This validation checked:
1. **8 functional behaviours** from feature.md against Requirements use cases and acceptance criteria — 100% covered
2. **4 API functions** against Tech-Spec pure function signatures and Requirements acceptance criteria — 100% covered
3. **3 data model claims** against manifest schema sections — 100% covered
4. **5 business rules** against Requirements Business Rules table — 100% covered
5. **6 test types** against Acceptance Criteria and Tech-Spec testing strategy — 100% covered
6. **9 out-of-scope items** verified absent from both documents — 100% verified
7. **File inventory** cross-checked between both documents — consistent
8. **Implementation order** verified with clear dependency documentation — complete
9. **Acceptance criteria alignment** verified via explicit cross-reference table — complete

## Validation date
2026-07-29

## Status
✅ **PASSED** — All feature claims are fully addressed in both Requirements and Tech-Spec documents. No gaps detected. Documents are ready for implementation handoff.
