# `src/claude/agents/gaia-generate-work-breakdown.md` — Modified

**Related Open Questions:** OQ-03, OQ-04, OQ-05 (see [index.md](../index.md#2-resolution-of-open-questions))
**Related components:** [pm-phase2.md](pm-phase2.md), [wbs-assembler.md](wbs-assembler.md)

**Addresses:** AC-01, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

Repurposed to the skeleton pass only: Step 7 ("Return the JSON Output") now describes the
schema-v3 skeleton shape below instead of the full schema-v2 task objects; Atomicity Contract,
task ID format, dependency/AC-assignment guidance all retained unchanged (still decided in this
one call). Verification-command and grouping-rationale guidance moved to
[gaia-generate-work-breakdown-task.md](gaia-generate-work-breakdown-task.md).

## Skeleton call — `c.worker()` JSON schema (passed as `opts.schema`)

```json
{
  "type": "object",
  "required": ["schemaVersion", "feature", "phases", "tasks"],
  "properties": {
    "schemaVersion": { "const": 3 },
    "feature": { "type": "string" },
    "phases": { "type": "array", "items": {
      "type": "object",
      "required": ["id", "type", "title", "commit", "sourceUC", "taskIds"],
      "properties": {
        "id": { "type": "string" }, "type": { "enum": ["infrastructure", "user-story"] },
        "title": { "type": "string" },
        "commit": { "type": "object", "required": ["type", "subject"],
          "properties": { "type": { "type": "string" }, "subject": { "type": "string" } } },
        "sourceUC": { "type": "array", "items": { "type": "string" } },
        "taskIds": { "type": "array", "items": { "type": "string" } }
      } } },
    "tasks": { "type": "object", "additionalProperties": {
      "type": "object",
      "required": ["title", "outcome", "domain", "agentType", "dependsOn",
                   "acceptanceCriteria", "estimate", "outputCount", "commit"],
      "properties": {
        "title": { "type": "string" }, "outcome": { "type": "string" },
        "domain": { "enum": ["BE", "FE", "DB", "DevOps", "INFRA", "TEST"] },
        "agentType": { "enum": ["developer-backend", "developer-frontend",
                                 "developer-testing", "review-solution"] },
        "dependsOn": { "type": "array", "items": { "type": "string" } },
        "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
        "estimate": { "type": "object", "required": ["agentMinutes", "tokens"],
          "properties": { "agentMinutes": { "type": "integer" }, "tokens": { "type": "integer" } } },
        "outputCount": { "type": "integer" },
        "commit": { "type": "object", "required": ["type", "subject"],
          "properties": { "type": { "type": "string" }, "subject": { "type": "string" } } }
      } } }
  }
}
```

The model's response still includes `title`/`commit` per phase (it is the only call that ever
decides them), and also `sourceUC` (OQ-05) — the agent is the one actually deciding which Use
Case(s) a phase's tasks realize, so only it can supply this field; it cannot be inferred
reliably downstream (see OQ-05's two counter-examples: an orchestration phase spanning several
UCs, and a UC realized across more than one phase). The coordinator (`pm-phase2.js`, see
[pm-phase2.md](pm-phase2.md)) does **not** copy `title`/`commit` into `index.json` verbatim, but
DOES copy `sourceUC` verbatim (it is a structural field, like `id`/`type`, not detail-file
content). `materializeIndex()` splits the response:
- `index.json`'s `phases[*]` entries keep `{ id, type, sourceUC, detailFile, taskIds }` —
  `detailFile` set to `"user-stories/" + phaseId + ".md"` (OQ-04: phase `title`/`commit` have no
  generation-order reason to live in the index, unlike the task fields that gate pre-dispatch
  structural checks; `sourceUC` is included here rather than deferred for the same reason `id`/
  `type` are — it's needed for the coverage check without reading any detail file).
- `title`/`commit` are passed to `renderPhaseDetailBlock()` (see
  [wbs-assembler.md](wbs-assembler.md)) and written immediately to
  `user-stories/{phaseId}.md` — immediately, not lazily, because phase content is fully known
  the moment the skeleton call returns; there is no separate per-phase generation pass.
- `index.json`'s `tasks[*]` entries get `detailFile` set to `"tasks/" + taskId + ".md"` and
  `status` set to `"pending"` for every task (added by the coordinator, not requested from the
  model — deterministic derivations of the task ID, not generation decisions).

See `templates/task-template.md`/`templates/user-story-template.md` for the canonical output
shapes this schema ultimately feeds.

## Tests

No dedicated new test file — this is a prompt-only change with no new executable code. Verified
by the existing `tests/frontmatter` structural suite (required `name`/`description`/`model`
frontmatter fields); behavioral correctness of the skeleton shape it produces is covered
downstream by [pm-phase2.md](pm-phase2.md)'s and [wbs-assembler.md](wbs-assembler.md)'s own
tests, not here.
