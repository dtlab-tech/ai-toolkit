# Issues Register — FTR-001

| # | Severity | US / Scope | File(s) | Description | Status | Resolved by |
|---|----------|-----------|---------|-------------|--------|-------------|
| 1 | INFO | INFRA | FTR-001-Tech-Spec.md | Appendix A shows a completed Grand Total in the intermediate file state — should show "partial — updated at pipeline end" placeholder to accurately represent the pre-Phase-8 state | FIXED | rework cycle 1 |
| 2 | INFO | INFRA | docs/procedures/token-estimation.md | General Actuals rules section does not distinguish halt (estimation model missing) vs graceful failure (usage blocks, pricing); a new reader sees no signal that estimation model absence is a hard stop | DEFERRED | Low risk; assessment pipeline usage section added in INFRA-T01 covers it |
| 3 | INFO | US-06 | .claude/skills/assess-codebase/SKILL.md | Estimation accuracy table Step 3c uses column headers "Agent type / Invocations" (from implement-feature pattern) instead of "Model / Count" as specified in requirements and Tech-Spec | FIXED | rework cycle 1 |
| 4 | WARNING | INFRA | docs/procedures/token-estimation.md | Actuals rules line still uses 20% trend threshold and text labels ("over/under/on-target") — diverges from SKILL.md which was updated to 5% and arrow symbols (↑↓→) in rework cycle 1 | FIXED | remediation pass |
| 5 | INFO | US-06 | FTR-001-Tech-Spec.md | Section 3.4 Actuals vs Estimate table example is missing Task/Scope, Model, and Duration columns that are present in the authoritative SKILL.md Step 3b definition | DEFERRED | Spec example only; SKILL.md implementation is correct |
