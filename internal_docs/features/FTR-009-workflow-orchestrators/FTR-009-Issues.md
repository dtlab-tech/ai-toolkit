# Issues Register — FTR-009

| # | Severity | US / Scope | File(s) | Description | Status | Resolved by |
|---|----------|-----------|---------|-------------|--------|-------------|
| 1 | WARNING | US-01 | .claude/workflows/pm-phase3.js | Rework loop condition `if (cycle < 2)` allows only 1 rework attempt; spec (approval-gates.md, project-manager Phase 6e) requires max 2 rework cycles. Correct condition is `if (cycle < 3)` with the outer for loop running `<= 3`. | FIXED | pm-phase3.js rework loop — MAX_REVIEW_CYCLES = 3, condition changed to `cycle < MAX_REVIEW_CYCLES` |
| 2 | INFO | US-02 | .claude/workflows/am-phase1.js | Assessment output file paths passed to intervention-documentation-standard use the pattern `${prefix}-${agent.name}.md` — actual output filenames from assessment agents may differ. Soft assumption; may fail at runtime if agent uses a different output filename. | DEFERRED | Runtime validation of assessment output filenames — low risk, deferred to follow-up |
| 3 | INFO | US-01 | .claude/workflows/pm-phase3.js | Git commit message for US phases uses `phase.name` (phase description) rather than the US title. Could be more descriptive by extracting the US title from the Work Breakdown. Low impact — commit messages remain meaningful. | DEFERRED | Cosmetic improvement to commit messages — low value, deferred to follow-up |
