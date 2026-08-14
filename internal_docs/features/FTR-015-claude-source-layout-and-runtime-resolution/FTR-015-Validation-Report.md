# Validation Report — FTR-015 (Revision 6)

**Validation date:** 2026-08-13
**Revision history:** R1 (2 structural gaps); R2 (10 user corrections); R3 (7 further corrections); R4 (5 further corrections); R5 (5 further corrections); R6 (2 targeted corrections — this document)

---

## Summary

| Document | Corrections applied this revision | Remaining gaps |
|----------|----------------------------------|---------------|
| FTR-015-Requirements.md | 2 targeted corrections (UC-06 Step 8, AC-25, AC-31) | None |
| FTR-015-Tech-Spec.md | 2 targeted corrections (§3.5 list-assets "Use in am-phase1.js", §3.6 am-phase1 migration detail, regression test added) | None |

---

## Corrections applied in this revision

### Correction R6-1 — am-phase1.js integration uses `agent()`, not `spawnSync`

**Problem:** §3.5 "Use in am-phase1.js" and §3.6 am-phase1 migration detail described the
workflow spawning `list-assets` via `spawnSync` and reading its stdout buffer directly. The
workflow runtime does not expose `spawnSync`, `require`, or `child_process`. This was not
implementable as written.

**Resolution applied:**
- Tech-Spec §3.5 list-assets "Use in am-phase1.js": Replaced `spawnSync` example with the
  correct `agent()`-based flow: am-phase1.js does NOT spawn `list-assets` directly; the
  Discovery agent's prompt instructs the agent to run the command, parse the JSON array, and
  return the structured DISCOVERY_SCHEMA. `spawnSync`, `require`, `child_process`, `path`,
  and `__dirname` are absent from am-phase1.js.
- Tech-Spec §3.6 am-phase1 migration detail: Replaced "spawns the command and reads its stdout
  buffer" description with the correct agent()-based flow; retained the `list-assets` command
  as definitive (only the invocation mechanism changes).
- Tech-Spec §10 Regression Tests: Added `tests/regression/am-phase1-static.test.js` — four
  static analysis assertions verifying am-phase1.js does not contain `spawnSync`, `require`,
  `child_process`, hardcoded `.claude/agents` scan, and does include the `list-assets` command
  in the Discovery agent prompt.
- Requirements UC-06 Step 8: Updated am-phase1 bullet to describe the agent()-based integration
  (Discovery agent prompt updated; DISCOVERY_SCHEMA returned; no `spawnSync` in workflow).
- Requirements AC-25: Updated to describe the `agent()` invocation: "am-phase1.js uses
  `agent()` with a prompt instructing the Discovery agent to run `ai-toolkit list-assets...`".

### Correction R6-2 — AC-31: reads explicitly covered, not just writes

**Problem:** AC-31 stated the real home directory would not be "modified" or "untouched". The
Tech-Spec requirement is stronger: when `--home` is provided, `os.homedir()` must not be
consulted at all — neither read nor written.

**Resolution applied:**
- Requirements AC-31: Updated to "given `--home <tmpdir>` is passed, `os.homedir()` is neither
  read nor written — the real home directory is not consulted at any point".

---

## Open items

None. All items from prior revisions remain resolved or accepted.

---

## Alignment matrix — critical contracts (revision 6, delta only)

Rows updated in this revision are marked ↕; all other rows carry forward from revision 5 (all ✅).

| Contract | Requirements | Tech-Spec | Status |
|----------|-------------|-----------|--------|
| **Single strategy for am-phase1 (implementable)** ↕ | UC-06 Step 8: `agent()` call; Discovery agent prompt updated to use `list-assets`; no `spawnSync`/`child_process` in am-phase1.js; AC-25 | §3.5: "Use in am-phase1.js" section uses `agent()` flow; §3.6 migration detail updated; §10 regression test added | ✅ |
| **E2E: real home neither read nor written** ↕ | AC-31: "neither read nor written — not consulted at any point" | §10 E2E test: `--home <tmpHome>` on ALL cases; isolation test proves real home not read | ✅ |

All other contracts from the R5 alignment matrix remain ✅ and are unchanged.

---

## Coverage verification

All 23 original ACs + 12 new ACs (AC-24..AC-35): ✅ all documented

All 18 business rules (BR-01..BR-18): ✅ all documented

All prior open items: ✅ resolved or accepted

No scope changes beyond the two targeted corrections.

---

## Sign-off

**Validation Status:** APPROVED — no open items; all corrections applied and consistent

**Gate 1 recommendation:** Documents are complete, internally coherent, and all blocking
corrections are resolved. Gate 1 may proceed.

**Documents validated (revision 6):**
- `FTR-015-Requirements.md`
- `FTR-015-Tech-Spec.md`
