<a id="task-US-01-TASK-BE-05"></a>
### US-01-TASK-BE-05

- **Task ID:** US-01-TASK-BE-05
- **Title:** Add CHECKPOINT proposal relay and mode line to the define-feature skill
- **Outcome:** define-feature/SKILL.md passes a Mode line in the spawn prompt, keeps the grilling record only in main-loop context and never on disk, and presents the CHECKPOINT proposal view with children, purposes, order, shared parts, flows with reasons and editable Summary and Keywords. It names unevaluated signals, and it stops and reports on root-resolution failure or RECORD_INVALID.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-04
- **Acceptance criteria:** AC-04, AC-05, AC-06, AC-07, AC-08
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** relay Phase 3a checkpoint proposal in define-feature skill

**Implementation notes:**

Scope: edit only `src/claude/skills/define-feature/SKILL.md`. The excerpt does not include the current file text, so this task cannot give exact line ranges. The implementer must read the file first, keep the existing spawn block and its sentence "Do not add instructions telling it to skip discovery" verbatim, and add the following around it. The skill never writes files and never runs `check-definition` or `apply` itself. It contains no hard-coded features-root path; the root comes from `ai-toolkit resolve-features-root`.

1. **Mode line in the spawn prompt.** The first line of the spawn prompt becomes `Mode: define`:

```text
Mode: define
Start the feature definition session.
Source reference (may be empty): {{user arguments verbatim}}
```

The `late-child` value and its routing belong to US-03; this task adds only the `define` line.

2. **Root-resolution and RECORD_INVALID stop.** If the agent returns ERROR for a failed `ai-toolkit resolve-features-root` call or a `RECORD_INVALID` result, relay the reason, state that nothing was written, and stop.

3. **Relay the CHECKPOINT block.** When the agent returns `CHECKPOINT: split-proposal`, parse its `feature_id`, `record`, `check` and `proposal` keys. Keep `record` in main-loop context only. Do not write it to disk and do not place it in any file.

4. **Present the proposal view.** Show:
   - the signal counts against each minimum (from `check.signals`);
   - each flow by name with its one-line reason (`check.flows`);
   - each child's name, one-line purpose, Summary and Keywords, with Summary and Keywords marked as editable;
   - the dependency order (`proposal.order`) and the shared parts assigned to the first child (`proposal.shared_first_child`);
   - every name in `check.unevaluated`, with the statement that this signal could not be evaluated. Also state this in the not-flagged path, where the agent returns DONE and the skill relays any unevaluated names.

**Not in this task.** Collecting the accept, edit or reject decision and re-invoking the agent (US-02-TASK-BE-06), the recovery offer after a failed apply (US-02-TASK-BE-07), and the late-child path (US-03) are separate tasks. This task stops after presenting the proposal view.

Verification by reading the file: the Mode line, the CHECKPOINT and decision block headings, and the phrases "unevaluated", "resolve-features-root", "RECORD_INVALID" and "in memory" must appear. The text tests that pin these anchors belong to US-01-TASK-TEST-02, which may not exist yet when this task runs, so the grep checks below are the in-task verification.

**Verification commands:**

```
test -f src/claude/skills/define-feature/SKILL.md
```

```
grep -q "Mode:" src/claude/skills/define-feature/SKILL.md && grep -q "CHECKPOINT" src/claude/skills/define-feature/SKILL.md && grep -q "unevaluated" src/claude/skills/define-feature/SKILL.md && grep -q "resolve-features-root" src/claude/skills/define-feature/SKILL.md && grep -q "RECORD_INVALID" src/claude/skills/define-feature/SKILL.md
```

```
grep -q "Do not add instructions telling it to skip discovery" src/claude/skills/define-feature/SKILL.md
```

```
npm test
```