<!--
PHASE / USER-STORY DETAIL TEMPLATE — wbs/user-stories/{PHASE_ID}.md

Canonical structure for a phase file (the INFRA phase and every US-NN phase both use this same
template — INFRA is not a user story, but lives in the same directory and format; see "Type"
below). Every phase file has exactly four parts, in this order: (1) the field block,
(2) Context, (3) Tasks in this phase, (4) Depends on phases. Fill in every placeholder (angle
brackets) and delete every HTML comment block (including this one) before treating the file as
finished.
-->
<a id="phase-{PHASE_ID}"></a>
### {PHASE_ID}

- **Phase ID:** {PHASE_ID}
- **Type:** <infrastructure | user-story>
- **Source UC:** <comma-separated UC-ID(s) this phase's tasks realize, or `—` for a phase with no
  single originating UC (e.g. shared infrastructure). Restated here for human readability from
  `index.json`'s own `sourceUC` array, which is authoritative — this line is a display-only
  projection, not parsed back out by `parsePhaseDetailBlock` (same convention as `Phase ID`/
  `Type` above, which are also restated but not re-extracted). Can be MORE than one UC (an
  orchestration phase) — don't force a single value if that's not true; see Tech-Spec OQ-05.>
- **Title:** <For `type: user-story`, use the standard form: "As a <role>, I want <capability>,
  so that <benefit>" — derived directly from this phase's source Use Case(s). For `type:
  infrastructure` (the one INFRA phase), there is no user-story grammar — use a short descriptive
  label of what shared setup this phase provides.>
- **Commit type:** <conventional-commit type, usually `feat`>
- **Commit scope:** <optional, or `—`>
- **Commit subject:** <imperative, concise — e.g. "implement {PHASE_ID} <short description>" —
  the renderer prepends `type(scope): ` automatically, do not include it here>

**Context:**

<!--
2–4 sentences, no more. Answer: why does this phase exist (which Use Case / need does it map
to)? How do its own tasks relate to each other? Is there a dependency or sequencing reason other
phases or tasks need to know about before opening this phase's individual task files? Do NOT
restate the Title — add information the title doesn't already give.
-->

<prose>

**Tasks in this phase:**

<!--
One bullet per task, in the same order as `index.json`'s `taskIds` for this phase. The summary is
a few words of what the task DOES, not a copy of its full Title (that's one click away via the
task ID link/filename).
-->

- `{TASK_ID}` — <one-line summary>

**Depends on phases:** <comma-separated phase IDs this phase's tasks have a `dependsOn` reference
into, or `none` if this phase has no cross-phase dependency>

<!--
PARSING CONTRACT — read by wbs-assembler.js's parsePhaseDetailBlock: field values are read from
the CONTIGUOUS RUN of `- **Label:** value` lines starting immediately after the `### {PHASE_ID}`
heading, stopping at the first non-matching line. Same rule and same rationale as the task
template — see task-template.md's parsing-contract note for the full explanation and the real
bug it fixes.
-->
