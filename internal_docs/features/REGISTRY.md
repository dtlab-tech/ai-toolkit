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

## FTR-002 — Assessment Pipeline Effort Estimation
**Keywords:** effort-estimation, wall-clock, duration, assessment-manager, Effort-Estimate.md, process-log, remediation-rates, severity-counts
**Status:** completed
**Summary:** Extends `assessment-manager` to write `{PREFIX}-Effort-Estimate.md` at end of Phase 3 (assessment agent durations from process log timestamps, batch wall-clock) and finalise it at end of Phase 4 (intervention-documentation-standard row + remediation effort section derived from Interventions Index using fixed rates CRITICAL=8h, HIGH=4h, MEDIUM=2h, LOW=1h). Remediation effort summary displayed at the Findings Gate. File is frozen after Phase 5. No skill-level append step (contrast with FTR-001).
→ [Detail](FTR-002-assessment-effort-estimation/feature.md)

---

## FTR-003 — Assessment Pipeline Scope Reduction
**Keywords:** read-only, findings-gate, acknowledgement, flagging, assessment-manager, assessment-findings-gate.md, Approvals.md, remediation-removal
**Status:** completed
**Summary:** Makes the assessment pipeline fully read-only. Removes Phase 6 (remediation implementation) and Phase 7 (PR creation) from `assessment-manager`. Replaces the Remediation Gate with a two-step Findings Gate: mandatory acknowledgement (Step 5a) + optional INT-NNN flagging for feature delivery (Step 5b). Renames `assessment-approval-gate.md` → `assessment-findings-gate.md`. New `{PREFIX}-Approvals.md` format: every intervention gets a Flagged: Yes/No row. Removes remediation placeholder from Token Estimate (replaced with static note). Updates `assess-codebase` skill description.
→ [Detail](FTR-003-assessment-scope-reduction/feature.md)

---

## FTR-004 — Assessment Registry
**Keywords:** registry, assessment-history, assessment-manager, registry.md, severity-counts, flagged-count, Interventions-Index, Approvals
**Status:** completed
**Summary:** Extends `assessment-manager` Phase 6 to append one row to `docs/assessments/registry.md` after each completed assessment (Findings Gate acknowledged, `{PREFIX}-Approvals.md` written). Severity counts are sourced from `{PREFIX}-Interventions-Index.md`; flagged count from `{PREFIX}-Approvals.md`. File is created on first run with a Markdown table header; subsequent runs append without validating existing rows. Two data contracts (Interventions Index and Approvals file formats) are documented in Phase 6. Registry write is conditional on `{PREFIX}-Approvals.md` existing; all error paths are non-fatal to the pipeline.
→ [Detail](FTR-004-assessment-registry/feature.md)

---

## FTR-005 — Assessment Intervention Commands
**Keywords:** next-intervention, check-interventions, commands, Approvals.md, Interventions-Index, feature-delivery-handoff, reconciliation, flagged-interventions
**Status:** defined
**Summary:** Adds two read-only commands — `/next-intervention [prefix]` and `/check-interventions [prefix]` — that bridge the assessment pipeline output to the feature delivery pipeline. `/next-intervention` reads `{PREFIX}-Approvals.md`, finds the first flagged INT-NNN without a corresponding feature folder in `internal_docs/features/` or `docs/features/`, and outputs the exact `/define-feature` invocation. `/check-interventions` produces a full reconciliation table: every intervention cross-referenced against the Interventions Index, the INT-NNN document files on disk, and existing feature folders. Both commands are strictly read-only (allowed tools: Read, Glob, Grep). Depend on the FTR-003 Approvals file format.
→ [Detail](FTR-005-assessment-intervention-commands/feature.md)

---

## FTR-007 — Explicit Per-Agent Model Assignment
**Keywords:** model-frontmatter, per-agent-model, sonnet, opus, haiku, cost-efficiency, agent-config, OPT-01, token-optimization
**Status:** completed
**Summary:** Adds an explicit `model:` YAML frontmatter key to the 15 agents in `.claude/agents/` that lacked one, so every agent declares its cost-appropriate tier instead of inheriting the session model (often Opus). Mapping: `sonnet` for the 14 coordination/implementation agents (incl. `project-manager`, `assessment-manager`, all developers, all refactoring/security agents, `define-feature`, `init-agents-md`, `install-toolkit`, `intervention-documentation-standard`); `opus` for `review-solution` only; the 7 pre-set `haiku` agents left untouched. Pure config change — no prompt-body, behavior, or pipeline logic altered. Bare aliases (OQ-1); orchestrators kept on `sonnet` since the model does not cascade to subagents (OQ-2). Verified by AC-01..AC-06 (grep coverage empty, values ⊆ {haiku,sonnet,opus}, one added line per file).
→ [Detail](FTR-007-explicit-per-agent-model-assignment/feature.md)

---
