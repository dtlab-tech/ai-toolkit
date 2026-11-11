# Validation Report — FTR-036

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-036-Requirements.md | 6 | 0 | ⚠️ Gaps remain |
| FTR-036-Tech-Spec.md | 1 | 0 | ⚠️ Gaps remain |

### Coverage (Phase 4 counts)
- Requirements: 8/8 feature.md functional behaviours have a Use Case in UC-01 to UC-03; 4/4 feature.md business rules (BR-01 to BR-04) present; 3/3 out-of-scope items listed in Section 1.2. Six defects remain (see below).
- Tech-Spec: 4/4 new or modified components named in feature.md are in the File Inventory (Section 9). External integrations are documented in Sections 2.1 and 8; Section 5 has no feature-wide prose, so no finding. Two claims need component detail (see below).

## Gaps found and resolved
### Requirements
- (none resolved in this pass)

### Tech-Spec
- (none resolved in this pass)

## Remaining gaps
### Requirements
- [OPEN] UC-01 skipped path: Main flow step 6, Alternative flows, Postconditions and Section 6.2 step 3 say a skipped feature continues to Phase 4 and is registered. Tech-Spec Sections 2.3 and 12 say stop and write nothing. Align the Requirements with the stop behaviour and state it in AC-03.
- [OPEN] UC-01 Preconditions: check-definition is described as already available from FTR-035. It is an FTR-036 deliverable (Section 1.2; Tech-Spec Section 2.1). Name FTR-036 as the delivering feature.
- [OPEN] Section 4.2 grilling-record row: arrays only, otherwise RECORD_INVALID. This contradicts AC-04. Add the null-means-unevaluated exception stated in Tech-Spec Section 6.
- [OPEN] Section 1.2 scope and UC-02: validate-proposal is added by Tech-Spec but not named in scope. Add it or record why it is not needed.
- [OPEN] UC-03 step 3, Preconditions, BR-12 and Section 4.2: 'exact FTR-ID match' on folder name cannot match slugged folder names. Define the match as name equal to ID or starting with ID-, with epic.md required.
- [OPEN] UC-03 step 8, error flow, BR-12 and AC-15: the child feature.md cannot be checked before apply allocates the ID. Define the duplicate test by slug against epic.md rows and folders ending in -slug.

### Tech-Spec
- [OPEN] Section 12, 'Partial apply failure': reject after a failed apply is assumed to need no further write. apply moves the parent to epic and rolls back only when it can, so the registry and folders may remain partly applied. Define the state after reject and the cleanup action.

## Pending component detail (needsComponentDetail)
- check-definition validation of flows[].name and flows[].reason (string types, one-line reason), component feature-split.js.md.
- register derivation of the Summary as the first sentence of the feature's Summary section for standalone and parent registrations, component feature-split.js.md.

## Observations on feature.md (not findings; for the host's awareness)
- feature.md does not state the skipped-path outcome; its Core Flow only says the check is skipped.
- feature.md D-07 does not record the late-child refinement (Requirements Section 8; Tech-Spec Section 2.3).
- feature.md D-08 does not record the parent registration refinement before apply (Requirements BR-09 and Section 8; Tech-Spec Section 2.3).
- feature.md D-03 does not record the null unevaluated marker (Tech-Spec Section 6).

## Validation date
2026-11-09