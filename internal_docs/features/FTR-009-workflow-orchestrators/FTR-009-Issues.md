# Issues Register — FTR-009

| # | Severity | US / Scope | File(s) | Description | Status | Resolved by |
|---|----------|-----------|---------|-------------|--------|-------------|
| 1 | WARNING | US-01 | .claude/workflows/pm-phase3.js | Rework loop condition `if (cycle < 2)` allows only 1 rework attempt; spec requires max 2 rework cycles. Correct condition is `if (cycle < 3)`. | FIXED | pm-phase3.js rewritten — implementation orchestrator agent prompt explicitly states max 2 rework cycles |
| 2 | INFO | US-02 | .claude/workflows/am-phase1.js | Assessment output file paths passed to intervention-documentation-standard assumed a specific filename pattern that may not match actual agent output. | FIXED | am-phase1.js rewritten — passes --prefix and --output-dir; intervention-documentation-standard reads assessment files from the output dir directly |
| 3 | INFO | US-01 | .claude/workflows/pm-phase3.js | Git commit message used phase.name rather than US title. | FIXED | pm-phase3.js rewritten — implementation orchestrator agent prompt specifies commit message format: feat({PREFIX}): implement {US-ID} — {US title} |
