<a id="task-US-02-TASK-BE-06"></a>
### US-02-TASK-BE-06

- **Task ID:** US-02-TASK-BE-06
- **Title:** Add decision collection and re-invocation to the skill
- **Outcome:** define-feature/SKILL.md asks the user in the main loop to accept, edit or reject the CHECKPOINT proposal. It re-invokes the agent with a decision block (feature_id, decision, record, proposal, edits) and the in-memory record. It states that the user's decision is the only trigger for a write, and for edit it re-presents the revised proposal with the foundation warning. For a non-flagged result it shows the Keywords prompt.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-05, US-02-TASK-BE-02, US-02-TASK-BE-03, US-02-TASK-BE-04
- **Acceptance criteria:** AC-09, AC-10, AC-11
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add decision relay to define-feature skill

**Implementation notes:**

Target file: `src/claude/skills/define-feature/SKILL.md`. This is an edit to one file only. The excerpt does not include the current text of that file, so this plan names the sections to add and does not give line ranges. Copy the existing spawn block and its sentence "Do not add instructions telling it to skip discovery" verbatim, and do not edit them.

Scope boundary: the `Mode:` line and the PROPOSAL view belong to US-01-TASK-BE-05. The partial-apply recovery offer belongs to US-02-TASK-BE-07. This task adds only the decision round, the decision block, and the re-invocation rules.

1. **Decision round (main loop).** Add a section after the PROPOSAL relay that asks the user once to choose one of three options:
   - `accept`: the proposal is confirmed as shown.
   - `edit`: the user gives free-text edits to names, purposes, dependency order, shared parts, Summary or Keywords.
   - `reject`: continue as one standalone feature.

   The text must state in these words: "The user's decision is the only trigger for a write. Nothing is written before accept or reject." It must also state that the skill never writes files and never runs `check-definition` or `apply` itself.

2. **Decision block.** The re-invocation prompt sends the following. The record and proposal come from the main-loop context, not from disk:

```
Mode: define
CHECKPOINT: decision
feature_id: {FTR-XXX}
decision: accept | edit | reject
record: <unchanged JSON from the PROPOSAL block>
proposal: <unchanged, or with the user's edits applied>
edits: "<user's free-text edits>"    # only when decision = edit
```

   The keys are exactly `feature_id`, `decision`, `record`, `proposal`, `edits`. The `Mode:` first-line form follows the convention set in US-01-TASK-BE-05. The agent-side input for this block is defined in US-02-TASK-BE-02 to US-02-TASK-BE-04.

3. **Routing per decision.**
   - `accept`: re-invoke with `decision: accept`. Relay DONE. ERROR relay is handled by US-02-TASK-BE-07.
   - `reject`: re-invoke with `decision: reject`. Relay DONE, and state that the feature is standalone.
   - `edit`: re-invoke with `decision: edit` and the `edits` text, with `proposal` unchanged. The agent returns a revised PROPOSAL with violations and the foundation warning. The skill re-presents the revised proposal, shows the foundation warning from the returned block, and returns to step 1. The next decision carries the revised `proposal`. This repeats until accept or reject.

4. **Non-flagged result.** When the spawn returns with no CHECKPOINT (status `skipped` or `not-flagged`), no proposal is shown. Show the Keywords prompt that the agent returns, and collect the confirmed keywords in the main loop. Also name any `unevaluated` signals (BR-02). The excerpt does not fix the return block or key name for this exchange. Use `confirmed_keywords: "<k1,k2>"` as a placeholder and align the name with US-02-TASK-BE-01 before implementing.

5. **Anchors for the static test file.** Include these literal words so the pinned checks in `tests/cli/define-feature-checkpoint-text.test.js` can match: `accept`, `edit`, `reject`, `feature_id`, `record`, `proposal`, `edits`, `foundation`, `standalone`, `Keywords`, `only trigger`, and `in the main loop`. The file itself is created by US-01-TASK-TEST-01 and extended by US-02-TASK-TEST-02.

Estimate: about 15 minutes and roughly 12k tokens. The work is short prose and one block schema in one file. The main cost is reading the existing SKILL.md to find the insertion points.

**Verification commands:**

```
grep -q "decision:" src/claude/skills/define-feature/SKILL.md && grep -q "edits:" src/claude/skills/define-feature/SKILL.md
```

```
npm test
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```