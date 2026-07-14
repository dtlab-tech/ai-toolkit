# Feature Registry

This file is maintained automatically by the Project Manager.
Each entry summarises a feature for cross-reference by future features.

---

## FTR-001 — Assessment Pipeline Token Estimation
**Keywords:** token-estimation, cost-tracking, assessment-manager, assess-codebase, Token-Estimate.md, blended-cost, usage-block
**Status:** completed
**Summary:** Extends `assessment-manager` to write `{PREFIX}-Token-Estimate.md` at end of Phase 3, progressively populating it with per-agent estimated and actual token/cost rows through Phases 4 and 6. The `assess-codebase` skill appends the orchestrator row, Actuals vs Estimate section, estimation accuracy by model table, and final grand total at pipeline end. Aligns trend thresholds (5%, arrow symbols) and column headers across `token-estimation.md` and the skill. Missing `<usage>` blocks and missing `docs/pricing.md` are handled gracefully (N/A rows, pipeline continues).
→ [Detail](FTR-001-assessment-token-estimation/feature.md)

---
