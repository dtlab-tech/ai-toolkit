<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Repurpose gaia-generate-work-breakdown.md to emit the schema-v3 skeleton only
- **Outcome:** src/claude/agents/gaia-generate-work-breakdown.md's Step 7 describes the schema-v3 skeleton shape (phases + per-task structural fields: id, title, outcome, domain, agentType, dependsOn, acceptanceCriteria, estimate, outputCount, commit) instead of full schema-v2 task objects; Atomicity Contract, task-ID format, and dependency/AC-assignment guidance are retained; verification-command and grouping-rationale guidance is removed (moved to the new per-task agent)
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 28000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repurpose gaia-generate-work-breakdown.md to emit schema-v3 skeleton

**Implementation notes:**

Edit, don't rewrite from scratch — most of the existing agent file is still correct and must
stay:

**Keep unchanged:** "Atomicity Contract" section, "Task ID format" rules, "Domain → agentType
mapping" table, Step 4 "Identify Shared Infrastructure Tasks", Step 5 "Resolve Dependencies",
Step 6 wording for `estimate.agentMinutes` (duration guidance table stays — the skeleton still
estimates duration), the "Clarification Protocol" section, and all "Guidelines".

**Remove entirely:** the "Verification Commands" section (moved to the new
`gaia-generate-work-breakdown-task.md` agent — US-03), and every mention of
`groupingRationale`/`verification.commands` as something THIS agent produces.

**Rewrite Step 7 ("Return the JSON Output")** — replace the current full schema-v2 example JSON
(the one with `verification.commands`, `groupingRationale` prose, per-task `commit`) with the
schema-v3 skeleton shape from Tech-Spec §5:
```json
{
  "schemaVersion": 3,
  "feature": "{PREFIX}",
  "phases": [
    { "id": "INFRA", "type": "infrastructure", "title": "...",
      "commit": { "type": "feat", "subject": "..." }, "taskIds": ["INFRA-TASK-BE-01"] }
  ],
  "tasks": {
    "INFRA-TASK-BE-01": {
      "title": "...", "outcome": "Single observable outcome statement", "domain": "BE",
      "agentType": "developer-backend", "dependsOn": [], "acceptanceCriteria": [],
      "estimate": { "agentMinutes": 8, "tokens": 15000 }, "outputCount": 1,
      "commit": { "type": "feat", "subject": "..." }
    }
  }
}
```
Note `tasks` is now a **map keyed by task ID**, not an array nested under each phase (phases only
carry `taskIds`, an ordered array of keys into this map) — this is the one structural change
beyond "drop verification/groupingRationale" and must be called out explicitly in the agent's
own instructions, since it changes how the model is told to assemble its response.

Update the opening paragraph ("produce a structured work breakdown...") to say the agent now
produces only the skeleton, and that the per-task detail (outcome refinement, verification
commands, grouping rationale) is filled in by a separate agent, one call per task — so a reader
of this file understands why `verification.commands` disappeared from its contract instead of
assuming it was dropped by oversight.

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter
```
