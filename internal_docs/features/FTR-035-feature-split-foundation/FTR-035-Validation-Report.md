# Validation Report — FTR-035

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-035-Requirements.md | 12 | 0 | ⚠️ Gaps open |
| FTR-035-Tech-Spec.md    | 2  | 0 | ⚠️ Gaps open |

## Gaps found and resolved
### Requirements
(none resolved in this pass)

### Tech-Spec
(none resolved in this pass)

## Remaining gaps
### Requirements
1. UC-01 E4 vs Section 4.2 / AC-05 / A-02: E4 still says the malformed-override case is not decided. Make E4 match AC-05 and remove the open question.
2. UC-01 / UC-02 open points still listed although covered: loadConfig project-root parameter form (A-01, AC-07), FeatureSplitError key for file-level errors (AC-05), unreadable feature folder (AC-13). Record as decided or confirm at Gate 1.
3. UC-03 merge: no rule for how a merged child combines purposes and keywords (D-09 permits merge). Add a rule and an AC.
4. UC-03 dependsOn: no rule for rewriting dependsOn on reorder or removal, or for a dependsOn entry naming a removed child. Cycle and unknown-name refusal at build and edit time (Tech-Spec Flow C) is not recorded in Requirements. Add rules and ACs.
5. UC-04 step 2 / A1 vs precondition: step 2 routes 'epic.md present' to late mode, so a parent with both feature.md and epic.md is ambiguous. State the both-files-present refusal with an error code and an AC.
6. UC-04 preconditions: the parent registry-status checks (initial split: Status defined; late child: Status epic; Tech-Spec Flow D step 3) are missing. Add them with error flows and ACs.
7. UC-04 scope: the refusal for a parent that is in progress or approved (out of scope in feature.md) has no UC-04 error flow or AC. Add it.
8. UC-04 pre-check: the STAGING_LEFTOVER refusal for leftover .split-staging-* and REGISTRY.md.tmp-* files (Tech-Spec Flow D step 0) is missing. Add it with an AC.
9. UC-04 Section 9 Q1: generated req/ and spec/ in the parent folder are unresolved (D-14 requires only epic.md). The Tech-Spec interim refusal is not in Requirements. Gate 1 must decide remove, move or refuse, with an AC.
10. BR-03 direct vs transitive dependency: Requirements (UC-03 step 10, UC-04 step 5) checks only owner-is-first; Tech-Spec Flow C also warns when a later child does not depend on the owner through a chain. Decide and record in BR-03, UC-03 and UC-04.
11. UC-05 feature ID source (folder name or Feature ID section) is undecided. Decide and add an AC.
12. UC-05 Keywords missing or empty is undecided; the missing or unreadable feature.md outcome is still open (Tech-Spec decides FEATURE_INVALID, with no Requirements AC). Decide and add ACs.
13. UC-06 open cases (a) no registry entry, (b) Parent: without Depends on:, (c) Status epic without epic.md, (d) unreadable REGISTRY.md have no decision or AC. Gate 1 must decide each, with an AC.

### Tech-Spec
1. Section 1 and Section 12 cite Requirements text inaccurately: UC-04 step 4 / E2 do not refuse BR-03 (step 5 records a warning); UC-04 precondition / E3 do not refuse a parent holding epic.md (E3 covers only late runs with more than one child); AC-25 is ID assignment, not the epic Detail target (AC-30 / BR-12). Correct these references.
2. Flow E returns REGISTRY_STATUS for existing entries with status completed or epic, which conflicts with UC-05 alternative flow and D-21. Align with the Gate 1 decision on Requirements Section 9 Q2.

## Notes (not findings)
- feature.md (Open Questions) states 'None', but Requirements Section 9 and the open points above are unresolved. Requirements A-10 requires feature.md to be updated at Gate 1.
- The late-child dependency rule (D-16, BR-07, AC-34: empty dependsOn places the child last and depends on the previous last child) is missing from Tech-Spec Flow D step 7. It is routed to component drill-down (needsComponentDetail), not counted as a finding.

## Validation date
2026-11-03

## Additional findings (deterministic + component-detail drill-down)
- Tech-Spec: components/feature-split.js.md does not document the late-child position rule the claim requires. Late mode always places the child last (Change, line 12; apply(), `order: i + 1` / `${rows.length + 1}`). A non-empty dependsOn only sets the dependency IDs (`lateDeps`). It does not set the child's position. The file also never cites BR-07, which the claim names.
