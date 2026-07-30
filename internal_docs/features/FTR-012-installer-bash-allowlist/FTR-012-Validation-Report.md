# Validation Report — FTR-012

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-012-Requirements.md | 0 | 0 | ✅ Clean |
| FTR-012-Tech-Spec.md    | 0 | 0 | ✅ Clean |

## Gaps found and resolved
(none)

## Remaining gaps (if any)
(none)

## Validation notes

### FTR-012-Requirements.md
- **Use Cases (UC-01 through UC-05):** All five primary flows (fresh install, merge with existing, ask-beats-allow priority, reinstall idempotency, gitignore handling) are fully specified with preconditions, triggers, main flows, alternative flows, and postconditions.
- **Business Rules (BR-01 through BR-09):** All nine rules covering ask-beats-allow priority, deduplication, user rule preservation, malformed JSON handling, idempotency, opt-in behavior, failure semantics, and command classification are present.
- **Acceptance Criteria (AC-01 through AC-14):** All fourteen acceptance criteria are mapped to feature.md requirements and provide clear Given/When/Then formulations for testing.
- **UI Requirements (Section 6):** Opt-in prompt text and all Step 7 status line variants are documented.
- **Data Requirements (Section 4):** `.claude/settings.local.json` structure, canonical lists, validation rules, and command format specifications are complete.
- **Non-Functional Requirements (Section 5):** Determinism, idempotency, performance, safety, code quality, testability, and consistency requirements are all addressed.

### FTR-012-Tech-Spec.md
- **Architecture (Section 2):** System context, component diagram, and three sequence diagrams (happy path, merge path, malformed JSON) comprehensively cover the feature flow.
- **Backend (Section 3):** Data model with `CANONICAL_ALLOW` and `CANONICAL_ASK` arrays, settings.local.json structure, return types, validation, and transformations are all specified. CLI entry point signature is documented.
- **Services (Section 3.5):** Pure function `mergeAllowlist(destDir)` is fully specified with dependencies (none), I/O, and behavior.
- **File Inventory (Section 9):** One new file (`tests/cli/mergeAllowlist.test.js`) and four modified files (`bin/cli.js`, `.claude/agents/install-toolkit.md`, `.gitignore`, `docs/reference.md`) are listed.
- **Testing Strategy (Section 10):** Eight unit test categories covering fresh install, merge, ask-beats-allow, allow-beats-ask, malformed JSON, idempotency, section preservation, and canonical list validation are specified. Integration tests and coverage targets are defined.
- **Implementation Order (Section 11):** Five-step implementation sequence with clear dependencies is provided.
- **Risks & Mitigations (Section 12):** Nine identified risks with specific mitigations are documented.
- **Security Considerations (Section 6):** Sensitive data handling, input validation, permission boundaries, and merge safety are all addressed.

## Validation date
2026-07-30

## Validator notes
Feature documentation for FTR-012 (Installer Bash Allowlist) is complete, internally consistent, and comprehensive. Both Requirements and Tech-Spec documents provide full coverage of feature.md claims with no gaps identified. The feature is ready for implementation.
