# Validation Report — FTR-037

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-037-Requirements.md | 6 | 0 | ⚠️ Open |
| FTR-037-Tech-Spec.md | 1 | 0 | ⚠️ Open |

## Gaps found and resolved
### Requirements
(none resolved in this pass)

### Tech-Spec
(none resolved in this pass)

## Remaining gaps (if any)
### Requirements
- Open grouping rule and depth-0 component mapping: Section 9 OQ 1 and 2, BR-10, BR-11, AC-10, AC-14, AC-15 remain open; feature.md D-07 and D-08 define neither; Tech-Spec T-6 and T-7 are not recorded.
- Unavailable case U < minChildren (Tech-Spec T-6 step 2) is absent from UC-01, UC-02, BR-03 and Section 4.2, and conflicts with UC-01 step 5 and AC-03.
- UC-01 precondition 'The feature folder exists' conflicts with BR-12 (a folder that does not exist yet is new).
- No AC for Keywords derivation (D-09, BR-13, T-8) or child Summary (T-6 step 5).
- No AC for feature.md D-06 (prompt and apply in the main loop only, never in the workflow).
- Stale open-question text in UC-01, UC-02 and UC-03 postconditions that BR-08, AC-05, AC-16, Section 8 and T-4/T-5 already resolve.

### Tech-Spec
- T-2 keeps the union-of-subtables option (A) as a pending working definition, contradicting feature.md D-01 and Requirements BR-05 and AC-07 (single component table); it also says the Requirements must change, contrary to Requirements Section 8.

## Validation date
2026-11-11