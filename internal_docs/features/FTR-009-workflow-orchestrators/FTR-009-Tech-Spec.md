# Technical Specification — Rewrite Orchestrators as Workflow Scripts

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-009 — Rewrite Orchestrators as Workflow Scripts |
| Version | 1.0 |
| Date | 2026-07-26 |
| Status | Draft |

---

## 1. Overview

This feature replaces the two orchestrator subagent markdown files (`project-manager.md` and `assessment-manager.md`) with five Claude Code Workflow scripts (`.js` files in `.claude/workflows/`), and updates the `implement-feature` and `assess-codebase` skills to invoke those workflows sequentially, handling approval gates in the skill's main loop. The `install-toolkit` agent and `bin/cli.js` are updated to include `.claude/workflows/` in their copy lists.

The core motivation is determinism: when orchestrators are spawned as subagents at spawn-depth 2, the harness tends to execute all child agent logic inline rather than spawning real subagents. Workflow scripts call agents via `agentType:`, which always produces real subagent boundaries, real `usage` data, and honoured `model:` frontmatter.

Worker agent `.md` files are untouched.

---

## 2. Architecture

### 2.1 System Context

The AI Toolkit is a collection of Claude Code agents, skills, commands, and procedures — all plain Markdown and JavaScript files. There is no server, database, or build system. The Claude Code harness executes everything.

The repository layout relevant to this feature:

```
.claude/
  agents/          ← worker agents (untouched), orchestrators deleted
  skills/          ← implement-feature.md and assess-codebase.md updated
  commands/        ← untouched
  workflows/       ← NEW: pm-phase1.js, pm-phase2.js, pm-phase3.js, am-phase1.js, am-phase2.js
bin/
  cli.js           ← updated to include workflows/ in copy list
docs/procedures/   ← untouched
```

### 2.2 Component Diagram

**Feature Delivery Pipeline (before):**
```
User
  → /implement-feature skill
       → project-manager subagent (depth 2: inlines all children)
            → [all worker agents run inline in orchestrator context]
```

**Feature Delivery Pipeline (after):**
```
User
  → /implement-feature skill
       → pm-phase1 workflow (real subagent boundary)
            → generate-requirements  (agentType:, real subagent)
            → generate-tech-spec     (agentType:, real subagent)
            → validate-feature-docs  (agentType:, real subagent)
       ← Gate 1 data returned to skill
  User approves Gate 1 in main loop
       → pm-phase2 workflow (real subagent boundary)
            → generate-work-breakdown (agentType:, real subagent)
       ← Gate 2 data returned to skill
  User approves Gate 2 in main loop
       → pm-phase3 workflow (real subagent boundary)
            → developer-backend/frontend/testing (agentType:, real subagents)
            → review-solution                   (agentType:, real subagent)
       ← PR URL + token actuals returned to skill
```

**Assessment Pipeline (before):**
```
User
  → /assess-codebase skill
       → assessment-manager subagent (depth 2: inlines all children)
```

**Assessment Pipeline (after):**
```
User
  → /assess-codebase skill
       → am-phase1 workflow (real subagent boundary)
            → generic-software-assessment      (agentType:)
            → layered-architecture-assessment  (agentType:)
            → concurrency-safety-assessment    (agentType:)
            → [other assessment agents]        (agentType:)
            → intervention-documentation-standard (agentType:)
       ← Findings Gate data returned to skill
  User acknowledges + flags at Findings Gate in main loop
       → am-phase2 workflow (real subagent boundary)
            → (approvals + registry + summary write)
       ← Completion signal to skill
```

### 2.3 Sequence Diagrams

**pm-phase1 sequence:**
```
skill           pm-phase1                worker agents
  |                 |                         |
  |--invoke-------->|                         |
  |                 |--agentType: gen-req---->|
  |                 |<--result + usage--------|
  |                 |--agentType: gen-tech--->|
  |                 |<--result + usage--------|
  |                 |--agentType: validate--->|
  |                 |<--result + usage--------|
  |                 |--write Effort-Estimate  |
  |                 |--accumulate token usage |
  |<--return gate1_payload + subagent_tokens--|
  |  [skill presents Gate 1, waits for user] |
```

---

## 3. Claude Code Workflow SDK

### 3.1 Workflow Script Structure

Workflow scripts are plain JavaScript files in `.claude/workflows/`. The Claude Code harness executes them and provides a global `workflow` object. Key API:

```javascript
// Agent invocation — real subagent boundary, real usage data
const result = await workflow.agent({
  agentType: 'generate-requirements',   // matches agent name in .claude/agents/
  prompt: '<args string>',
});
// result.text      — agent output text
// result.usage     — { input_tokens, output_tokens, model }

// File I/O — standard Node.js fs available
const fs = require('fs');

// Return data to the skill that invoked the workflow
return {
  gate_data: { ... },
  token_summary: { ... },
};
```

> **Open Question OQ-2:** Whether the `workflow.agent()` call returns per-agent `usage` data inside the workflow or only exposes aggregate `subagent_tokens` at the workflow invocation boundary must be verified empirically. The implementation below is written for the case where per-agent `usage` IS available inside the workflow (which would yield exact per-agent rows). If only phase-level `subagent_tokens` is available, per-agent rows use proportional distribution (marked `*(proportional)*`) and the phase total/grand total remain exact.

### 3.2 Workflow Invocation by Skill

Skills invoke workflows using the standard Agent tool call with `subagent_type: workflow` and the workflow file name:

```markdown
<!-- in implement-feature.md -->
Invoke workflow `pm-phase1`:
- subagent_type: pm-phase1
- prompt: <path-to-feature.md>
Wait for result. Do NOT proceed until the workflow returns.
```

The skill receives `subagent_tokens` from the workflow's `<usage>` block in the task notification, which gives the exact token count for the entire workflow invocation (phase total).

---

## 4. Workflow Scripts — Specification

### 4.1 `pm-phase1.js` — Documentation Phase

**Location:** `.claude/workflows/pm-phase1.js`

**Inputs (from skill via prompt):**
- `feature_path` — path to `feature.md`

**Logic:**
1. Read `feature.md` and existing docs. Build state map (fresh/stale).
2. If `{PREFIX}-Requirements.md` is stale or missing: invoke `generate-requirements` via `agentType:`. Capture `usage`.
3. If `{PREFIX}-Tech-Spec.md` is stale or missing: invoke `generate-tech-spec` via `agentType:`. Capture `usage`.
4. Invoke `validate-feature-docs` via `agentType:`. Capture `usage`.
5. If gaps found: re-run only the failing doc agents (max 3 revision cycles). Re-validate.
6. Write `{PREFIX}-Effort-Estimate.md` (pre-WB stub with doc-gen agent durations).
7. Append to process log.
8. Return `{ gate1_payload, token_ledger }` to skill.

**gate1_payload structure:**
```javascript
{
  requirements_summary: { use_cases, business_rules, acceptance_criteria },
  tech_spec_summary:    { endpoints, entities, new_files },
  validation_summary:   { gaps_found },
  token_ledger:         [ { agent, model, est_tokens, actual_tokens, duration_ms }, ... ],
}
```

**Error handling:**
- Worker agent failure → log error to process log, include in `gate1_payload.errors[]`, return to skill (skill reports to user).
- Validation still fails after 3 cycles → include remaining gaps in `gate1_payload.validation_gaps[]`.

**Output files written:**
- `{PREFIX}-Requirements.md`
- `{PREFIX}-Tech-Spec.md`
- `{PREFIX}-Validation-Report.md`
- `{PREFIX}-Effort-Estimate.md` (stub)
- `{PREFIX}-process-log.txt` (appended)

---

### 4.2 `pm-phase2.js` — Work Breakdown Phase

**Location:** `.claude/workflows/pm-phase2.js`

**Inputs (from skill via prompt):**
- `feature_path` — path to `feature.md`
- `approval_record` — serialized Gate 1 approval text (written by skill to `{PREFIX}-Approvals.md` before invoking this workflow)

**Precondition:** `{PREFIX}-Approvals.md` must exist with Gate 1 ✅. The workflow reads and verifies this before proceeding.

**Logic:**
1. Read `{PREFIX}-Approvals.md`. Verify Gate 1 ✅. If missing: return error to skill.
2. Invoke `generate-work-breakdown` via `agentType:`. Capture `usage`.
3. Parse Work Breakdown for User Stories and task counts.
4. Compute task-level effort estimates (Effort-Estimate.md update).
5. Write updated `{PREFIX}-Effort-Estimate.md`.
6. Accumulate token ledger.
7. Return `{ gate2_payload, token_ledger }` to skill.

**gate2_payload structure:**
```javascript
{
  user_stories:          N,
  total_tasks:           N,
  domain_breakdown:      { DB, BE, FE, INFRA, TEST },
  implementation_phases: N,
  human_estimate:        'Nh',
  agent_estimate:        'Nh Nmin',
  token_ledger:          [ ... ],
}
```

**Output files written:**
- `{PREFIX}-Work-Breakdown.md`
- `{PREFIX}-Effort-Estimate.md` (updated)
- `{PREFIX}-process-log.txt` (appended)

---

### 4.3 `pm-phase3.js` — Implementation Phase

**Location:** `.claude/workflows/pm-phase3.js`

**Inputs (from skill via prompt):**
- `feature_path` — path to `feature.md`
- `branch_name` — `feature/{PREFIX}-{slug}` (created by skill before invoking)

**Precondition:** `{PREFIX}-Approvals.md` must exist with Gate 1 ✅ and Gate 2 ✅. The workflow reads and verifies both before proceeding.

**Logic:**
1. Read `{PREFIX}-Approvals.md`. Verify both gates ✅.
2. Parse `{PREFIX}-Work-Breakdown.md` Section 4 for phase order, tasks, domains, US mapping.
3. **Implementation loop (per phase):**
   a. Identify ready tasks (all dependencies completed).
   b. Group by domain; batch independent tasks to the same agent.
   c. Invoke developer agents via `agentType:` (parallel where no inter-dependency).
   d. When all tasks of a User Story complete: invoke `review-solution` via `agentType:`.
   e. If PASS (no CRITICAL): git commit `feat({PREFIX}): implement US-XX — {title}`.
   f. If FAIL (CRITICAL): rework cycle (max 2). If unresolved: include in `return.escalations[]`.
   g. WARNING/INFO findings: log to `{PREFIX}-Issues.md`.
4. Invoke `review-solution` for INFRA tasks collectively.
5. Run remediation loop if `{PREFIX}-Issues.md` has OPEN items.
6. Create PR targeting `develop`.
7. Update Feature Registry.
8. Write `{PREFIX}-Token-Estimate.md` with all actuals.
9. Append actuals to `{PREFIX}-Effort-Estimate.md`.
10. Return `{ pr_url, token_ledger, issues_summary }` to skill.

**Domain → agent mapping:**

| Domain | agentType |
|--------|-----------|
| DB, BE, INFRA | `developer-backend` |
| FE | `developer-frontend` |
| TEST | `developer-testing` |

**Output files written:**
- `{PREFIX}-Token-Estimate.md`
- `{PREFIX}-Effort-Estimate.md` (actuals appended)
- `{PREFIX}-Issues.md` (if any non-CRITICAL findings)
- `{PREFIX}-Approvals.md` (Gate 2 status confirmed)
- `{PREFIX}-process-log.txt` (appended)
- All feature implementation files (via developer agents)

---

### 4.4 `am-phase1.js` — Assessment Phase

**Location:** `.claude/workflows/am-phase1.js`

**Inputs (from skill via prompt):**
- `target_path` — path to codebase to assess
- `scope` — comma-separated scope filter (optional)
- `prefix` — `ASSESS-NNN` (determined by skill)
- `output_dir` — `docs/assessments/ASSESS-NNN/`

**Logic:**
1. Discover assessment agents (keywords: "assessment", "audit", "analysis").
2. Apply scope filter if provided.
3. Invoke all qualifying assessment agents in parallel via `agentType:`. Capture `usage` for each.
4. Verify each expected output file exists and is non-empty.
5. Invoke `intervention-documentation-standard` via `agentType:`. Capture `usage`.
6. Write `{PREFIX}-Token-Estimate.md` with all agent actuals.
7. Write `{PREFIX}-Effort-Estimate.md` with all agent durations.
8. Return `{ findings_gate_payload, token_ledger }` to skill.

**findings_gate_payload structure:**
```javascript
{
  assessment_summaries:      [ { agent, output_file, finding_count }, ... ],
  interventions_index_path:  '{PREFIX}-Interventions-Index.md',
  effort_estimate_path:      '{PREFIX}-Effort-Estimate.md',
  token_summary: {
    total_est_tokens:    N,
    total_actual_tokens: N,
    total_est_cost:      '$N.NN',
    total_actual_cost:   '$N.NN',
  },
  errors: [],
}
```

**Output files written:**
- `{PREFIX}-Generic-Assessment.md` (and other assessment outputs)
- `{PREFIX}-INT-NNN-*.md` (per intervention)
- `{PREFIX}-Interventions-Index.md`
- `{PREFIX}-Token-Estimate.md`
- `{PREFIX}-Effort-Estimate.md`
- `{PREFIX}-process-log.txt`

---

### 4.5 `am-phase2.js` — Approvals and Summary Phase

**Location:** `.claude/workflows/am-phase2.js`

**Inputs (from skill via prompt):**
- `prefix` — `ASSESS-NNN`
- `output_dir` — `docs/assessments/ASSESS-NNN/`
- `flagged_interventions` — comma-separated INT-NNN identifiers (from skill, after Findings Gate)
- `acknowledgement_text` — user acknowledgement text

**Logic:**
1. Write `{PREFIX}-Approvals.md` with acknowledgement and flagged/unflagged rows.
2. Append row to `docs/assessments/registry.md` (create if first run).
3. Write Assessment Summary.
4. Append to `{PREFIX}-process-log.txt`.
5. Return `{ approvals_path, registry_updated, summary }` to skill.

**Output files written:**
- `{PREFIX}-Approvals.md`
- `docs/assessments/registry.md` (appended)
- `{PREFIX}-process-log.txt`

---

## 5. Updated Skills

### 5.1 `implement-feature.md` — Rewrite

The skill replaces the single `project-manager` subagent spawn with a sequential three-workflow invocation loop with gate handling between each phase.

**New skill structure (pseudocode):**

```markdown
## Step 1 — Invoke pm-phase1

- subagent_type: pm-phase1
- prompt: <path-to-feature.md>

Wait for result. On completion, extract gate1_payload from result text.

## Step 2 — Present Gate 1

Present documents summary to the user:
- {PREFIX}-Requirements.md — N use cases, N business rules, N acceptance criteria
- {PREFIX}-Tech-Spec.md — N endpoints, N entities, N new files
- {PREFIX}-Validation-Report.md — N gaps found / 0 gaps

⛔ GATE 1 — DOCS APPROVAL — HARD STOP
[…approval prompt…]
Wait for explicit text reply. DO NOT invoke pm-phase2 until approval received.

Write {PREFIX}-Approvals.md with Gate 1 ✅ status.
Verify file on disk before proceeding.

## Step 3 — Invoke pm-phase2

- subagent_type: pm-phase2
- prompt: <path-to-feature.md>

Wait for result. Extract gate2_payload.

## Step 4 — Present Gate 2

[…Gate 2 presentation and hard-stop…]
Write Gate 2 ✅ to {PREFIX}-Approvals.md.
Verify file on disk before proceeding.

## Step 5 — Create branch, invoke pm-phase3

git checkout -b feature/{PREFIX}-{slug}

- subagent_type: pm-phase3
- prompt: <path-to-feature.md> --branch feature/{PREFIX}-{slug}

Wait for result. Extract pr_url and token_ledger.

## Step 6 — Complete Token Estimate and report

Append orchestrator row and grand total to {PREFIX}-Token-Estimate.md.
Report PR URL and token summary to user.
```

**Key differences from current skill:**
- No single `project-manager` spawn.
- Gate 1 and Gate 2 hard stops occur in the skill's main loop (user-visible, blockable).
- Three sequential workflow invocations.
- Token-Estimate orchestrator row appended by the skill (same as today).

---

### 5.2 `assess-codebase.md` — Rewrite

The skill replaces the single `assessment-manager` subagent spawn with a two-workflow invocation loop with the Findings Gate between phases.

**New skill structure (pseudocode):**

```markdown
## Step 1 — Determine prefix

Scan docs/assessments/ for ASSESS-NNN folders. Increment highest or start at ASSESS-001.

## Step 2 — Invoke am-phase1

- subagent_type: am-phase1
- prompt: <target_path> --scope=<scope> --prefix ASSESS-NNN

Wait for result. Extract findings_gate_payload.

## Step 3 — Present Findings Gate

[…Findings Gate presentation per assessment-findings-gate.md procedure…]

Step 3a — Acknowledge: present findings summary (effort estimate). Wait for any non-empty text reply.
Step 3b — Flag interventions: prompt for INT-NNN identifiers. Validate against Interventions-Index. Accept "None".

## Step 4 — Invoke am-phase2

- subagent_type: am-phase2
- prompt: --prefix ASSESS-NNN --flagged <INT-NNN,...> --ack "<ack_text>"

Wait for result.

## Step 5 — Complete Token Estimate and report

Append orchestrator row and grand total to {PREFIX}-Token-Estimate.md.
Report summary to user.
```

---

## 6. Updated Install Files

### 6.1 `install-toolkit.md` — Step 2 Change

In Step 2 (Plan what to copy), add a new row to the source directories table:

```markdown
| `.claude/workflows/` | `{dest}/.claude/workflows/` | Claude Code Workflow scripts for orchestrated pipelines |
```

The existing NEW / SAME / MODIFIED logic applies unchanged to all files in `.claude/workflows/`.

**Plan display addition:**
```
.claude/workflows/
  ✅ NEW       pm-phase1.js
  ✅ NEW       pm-phase2.js
  ✅ NEW       pm-phase3.js
  ✅ NEW       am-phase1.js
  ✅ NEW       am-phase2.js
```

No other step in `install-toolkit.md` changes.

### 6.2 `bin/cli.js` — Mapping Change

In the `installLocal` function (line ~329), add a new entry to the `mappings` array:

```javascript
{ src: path.join(packageRoot, '.claude'),           dest: path.join(targetDir, '.claude') },
{ src: path.join(packageRoot, 'docs'),              dest: path.join(targetDir, 'docs') },
{ src: path.join(packageRoot, 'CLAUDE.md'),         dest: path.join(targetDir, 'CLAUDE.md') },
```

The `.claude` directory is already copied as a whole directory via `walkDir`. Since `.claude/workflows/` will exist inside `.claude/`, it is automatically included — no explicit mapping change is needed IF the cli.js copies the entire `.claude/` subtree. Verify the current `expandMappings` + `walkDir` behaviour: it recursively walks `.claude/` and copies all files within. Confirm `.claude/workflows/` files are included by this walk. If so, `cli.js` requires no change.

The same verification applies to the `installGlobal` function (line ~354), which maps `.claude/agents`, `.claude/skills`, `.claude/commands` individually. The global install DOES need an explicit addition:

```javascript
{ src: path.join(packageRoot, '.claude', 'workflows'), dest: path.join(target, 'workflows') },
```

---

## 7. Deletion of Orchestrator Agent Files

Two files are deleted as part of this feature:

| File | Action |
|------|--------|
| `.claude/agents/project-manager.md` | Delete |
| `.claude/agents/assessment-manager.md` | Delete |

These files are inert once the skills no longer reference them. Projects that installed the toolkit previously will retain these files until their next `install-toolkit` run.

---

## 8. Token-Estimate File Changes

The file format is unchanged from FTR-001/FTR-002. Data sourcing changes:

**Per-agent rows (feature delivery):**
```markdown
| generate-requirements | haiku | N *(proportional)* | $N.NNNN *(proportional)* | N (actual from pm-phase1 subagent_tokens, proportional) | $N.NNNN | complete |
```

Proportional distribution formula:
```
agent_tokens = phase_total_tokens × (agent_est_tokens / sum_of_all_agents_est_tokens_in_phase)
```

**Disclaimer (inserted in Token-Estimate header):**
```markdown
> Per-agent values marked *(proportional)* are estimated distributions of the phase total.
> Phase totals and grand total are exact measurements from workflow subagent_tokens.
```

---

## 9. Security Considerations

- No new secrets, credentials, or external network calls are introduced.
- Workflow scripts have the same file-system access as the current orchestrator agents.
- No new permission scopes are required.
- The gate approval mechanism is unchanged — same approval semantics, same approval file format.

---

## 10. File Inventory

### New files

| Path | Purpose |
|------|---------|
| `.claude/workflows/pm-phase1.js` | Docs phase workflow: discovery, requirements, tech-spec, validation, effort-estimate stub |
| `.claude/workflows/pm-phase2.js` | WB phase workflow: work-breakdown, effort-estimate update |
| `.claude/workflows/pm-phase3.js` | Implementation phase workflow: developer agents, review, PR, token-estimate, effort-estimate actuals |
| `.claude/workflows/am-phase1.js` | Assessment phase workflow: discovery, parallel assessment agents, intervention docs, token/effort estimates |
| `.claude/workflows/am-phase2.js` | Post-gate workflow: approvals, registry, summary |

### Modified files

| Path | Change description |
|------|-------------------|
| `.claude/skills/implement-feature.md` | Replace PM subagent spawn with sequential pm-phase1/2/3 workflow invocations; gate presentation in main loop |
| `.claude/skills/assess-codebase.md` | Replace AM subagent spawn with sequential am-phase1/2 workflow invocations; Findings Gate in main loop |
| `.claude/agents/install-toolkit.md` | Add `.claude/workflows/` to Step 2 source directories table |
| `bin/cli.js` | Add `.claude/workflows/` mapping to `installGlobal` mappings array |

### Deleted files

| Path | Reason |
|------|--------|
| `.claude/agents/project-manager.md` | Replaced by workflow scripts + updated skill |
| `.claude/agents/assessment-manager.md` | Replaced by workflow scripts + updated skill |

---

## 11. Testing Strategy

- **AC-01:** `ls .claude/agents/ | grep -E 'project-manager|assessment-manager'` returns empty.
- **AC-02:** `node --check .claude/workflows/pm-phase1.js` (and other 4 scripts) exits 0.
- **AC-03/AC-04:** Run a full pipeline on a test feature / test target. Inspect the Token-Estimate file — all agent rows must have numeric (or proportional) values, not `N/A`.
- **AC-05:** Verify `usage.model` in the `<usage>` blocks from worker agents matches the declared `model:` frontmatter.
- **AC-06/AC-07/AC-08:** Inspect transcript — Gate messages appear in the main skill loop, not embedded in a subagent result.
- **AC-09:** Run `install-toolkit` against a blank destination. Verify `.claude/workflows/` exists with five files.
- **AC-10:** `git diff HEAD -- .claude/agents/` excludes all files except `project-manager.md` and `assessment-manager.md` (which appear as deletions only, no modifications to other agents).

Manual verification steps:
1. Run `/implement-feature` on a small feature (e.g., FTR-009 itself). Verify gate presentation and token actuals.
2. Run `/assess-codebase .` on the toolkit repo. Verify Findings Gate in main loop and token actuals.
3. Run `npx @dtlabs/ai-toolkit --local /tmp/test-project` and verify `.claude/workflows/` in the destination.

---

## 12. Implementation Order

1. Create `.claude/workflows/` directory — depends on: nothing
2. Implement `pm-phase1.js` — depends on: 1; references `generate-requirements`, `generate-tech-spec`, `validate-feature-docs`
3. Implement `pm-phase2.js` — depends on: 1; references `generate-work-breakdown`
4. Implement `pm-phase3.js` — depends on: 1; references `developer-*`, `review-solution`
5. Implement `am-phase1.js` — depends on: 1; references all assessment agents, `intervention-documentation-standard`
6. Implement `am-phase2.js` — depends on: 1; registry and approvals writes
7. Update `implement-feature.md` — depends on: 2, 3, 4 (workflow scripts exist)
8. Update `assess-codebase.md` — depends on: 5, 6
9. Update `install-toolkit.md` — depends on: 1 (workflows/ directory known to exist)
10. Update `bin/cli.js` installGlobal mappings — depends on: 1
11. Delete `project-manager.md` and `assessment-manager.md` — depends on: 7, 8

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Claude Code Workflow SDK does not expose per-agent `usage` inside a workflow — only phase-level `subagent_tokens` | Medium — per-agent rows must use proportional distribution; exact per-agent data unavailable | Accept the proportional approach with a clear disclaimer in the Token-Estimate file; this is explicitly documented in the feature.md and is the defined fallback |
| `workflow.agent()` API differs from what the feature.md assumes | High — entire implementation approach may need revision | Verify SDK API before starting Phase 3 implementation; if incorrect, revise workflow call signatures before writing the five scripts |
| Gate presentation breaks if workflow returns an unexpected result structure | Medium — skill may not extract gate payload correctly | Define a strict return schema for each workflow and validate on the skill side before presenting gate content |
| `installGlobal` in `cli.js` already copies workflows/ via its current mappings | Low (false positive) — no change needed for local install; global install still needs explicit mapping | Verify both `installLocal` and `installGlobal` paths; only add mapping where genuinely missing |
| Old PM/AM agent files remain in previously installed projects | Low — they are inert once skills no longer invoke them | Acceptable by design; document in release notes |
