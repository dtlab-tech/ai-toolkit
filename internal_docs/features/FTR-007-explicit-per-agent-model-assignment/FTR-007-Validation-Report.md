# Validation Report — FTR-007 — Explicit Per-Agent Model Assignment

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-007 — Explicit Per-Agent Model Assignment |
| Date | 2026-07-24 |
| Documents validated | FTR-007-Requirements.md, FTR-007-Tech-Spec.md |
| Source of truth | feature.md |

---

## Feature Decomposition (verifiable claims from feature.md)

| # | Claim | Type | Origin section |
|---|-------|------|----------------|
| C-01 | Add `model:` field to the 15 agents lacking one | Functional | Summary / Core Flow |
| C-02 | 14 named agents get `model: sonnet` | Business rule | Model Mapping |
| C-03 | `review-solution` gets `model: opus` | Business rule | Model Mapping |
| C-04 | 7 named agents already on `model: haiku` are left unchanged | Out of scope | Model Mapping / Out of Scope |
| C-05 | Only the added `model:` line changes per file | Business rule | Core Flow #3, AC-06 |
| C-06 | `grep -L "^model:" .claude/agents/*.md` returns nothing | Verification | Core Flow #4, AC-01 |
| C-07 | Every `model:` value ∈ {haiku, sonnet, opus} | Business rule | Core Flow #5, AC-02 |
| C-08 | `model:` value is a bare alias, not a pinned ID | Business rule | OQ-1 |
| C-09 | Orchestrators get `sonnet`, not `opus`; model does not cascade to subagents | Business rule | OQ-2 |
| C-10 | Harness dispatches each agent on its declared model | Functional | Core Flow #6 |
| C-11 | No prompt-body / other-frontmatter / behavioral edits | Out of scope | Out of Scope |
| C-12 | Edge cases: missing frontmatter, misspelled value, file already has model | Error scenarios | Edge Cases table |
| C-13 | No dependencies; standalone | Assumption | Dependencies |
| C-14 | Docs live in internal_docs/features/ | Convention | Dependencies |

---

## Requirements coverage (against FTR-007-Requirements.md)

| Check | Result |
|-------|--------|
| Every functional behaviour → Use Case | ✅ C-01→UC-01, C-10→UC-03, C-06/C-07→UC-02 |
| Every business rule → Business Rules table | ✅ C-02→BR-04, C-03→BR-05, C-04→BR-06, C-05→BR-07, C-07→BR-02, C-08→BR-03, C-09→BR-08 |
| Every out-of-scope item → Out of Scope section | ✅ §1.2 lists all 6 exclusions incl. the 7 haiku agents (C-04) and prompt-body edits (C-11) |
| Every verification claim → AC | ✅ C-06→AC-01, C-07→AC-02, C-05→AC-06 |
| Every edge case → error flow | ✅ C-12 covered in UC-01/UC-02 error & alternative flows |
| Every functional behaviour → Acceptance Criterion | ✅ AC-01..AC-06 map to UC-01/UC-02 |
| Dependencies/assumptions captured | ✅ §8 (C-13, C-14, registry note) |

**Coverage: 14/14 claims addressed.**

---

## Tech-Spec coverage (against FTR-007-Tech-Spec.md)

| Check | Result |
|-------|--------|
| Every file to edit → File Inventory | ✅ §9 Modified files lists all 15 with per-file change (C-01, C-02, C-03) |
| Model mapping documented | ✅ §8 Configuration reproduces the full 14+1 mapping and the 7 untouched (C-02, C-03, C-04) |
| Verification steps documented | ✅ §10 Testing Strategy maps AC-01..AC-06 to shell commands (C-06, C-07, C-05) |
| Bare-alias contract | ✅ §5 External Integrations + §12 risk (C-08) |
| No new source files | ✅ §9 New files = none (C-11) |
| Implementation order present | ✅ §11, dependency-aware (C-01→C-02/C-03→verify→review) |
| Risks incl. scope-violation & orchestrator tier | ✅ §12 (C-04, C-09) |
| Registry integration note | ✅ §12 (disjoint from FTR-001..005) |
| N/A sections justified | ✅ backend/frontend/db/security marked N/A with rationale (config-only feature) |

**Coverage: all applicable claims addressed.**

---

```
📋 Coverage Report  (prefix: FTR-007)
══════════════════════════════════════════════════════

FTR-007-Requirements.md
────────────────────────
✅ 3/3 use cases cover all functional behaviours (add, verify, dispatch)
✅ 8/8 business rules present (BR-01..BR-08)
✅ 6/6 acceptance criteria present (AC-01..AC-06)
✅ Out-of-scope items all listed; edge cases mapped to error flows

FTR-007-Tech-Spec.md
──────────────────────
✅ 15/15 files-to-edit in File Inventory
✅ Full 14+1 model mapping documented; 7 haiku agents flagged out of scope
✅ 6/6 acceptance criteria mapped to verification commands
✅ Implementation order + risks + bare-alias contract present

══════════════════════════════════════════════════════
Result: ✅ Full coverage — all feature claims addressed in both documents
0 gaps found — no revision required
══════════════════════════════════════════════════════
```

## Notes

- No revision cycles were needed (0 gaps on first pass).
- The feature is configuration-only; backend/frontend/DB/security/API sections of the Tech-Spec are legitimately N/A and are marked as such with rationale rather than omitted.
- Both open questions (OQ-1 bare alias, OQ-2 sonnet for orchestrators) were resolved in feature.md; Requirements §9 carries no open items.
