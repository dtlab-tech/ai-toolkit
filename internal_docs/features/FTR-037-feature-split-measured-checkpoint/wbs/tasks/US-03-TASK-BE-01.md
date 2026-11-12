<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add apply invocation with the confirmed edited proposal to Step 1a accept
- **Outcome:** SKILL.md Step 1a accept branch runs feature-split.js apply through run-asset with --features-root and --parent set to the parent prefix. It sends the last explicitly accepted proposal, including any edits, as JSON on stdin, and only after the explicit accept.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-06, US-02-TASK-BE-07
- **Acceptance criteria:** AC-11, AC-13
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add apply call with accepted proposal to Step 1a accept

**Implementation notes:**

Scope: one edit to `src/claude/skills/implement-feature/SKILL.md`, inside the `accept` branch of Step 1a. Step 1a is created by US-02-TASK-BE-04 to BE-07, so this task changes that branch only. No change to `feature-split.js`, `pm-phase1`, or any other file.

Gaps in the excerpt. The excerpt gives these parts of the call: `--features-root <root>`, `--parent <FTR-ID>`, and the confirmed proposal as JSON on stdin. It does not define the following, and this task must not invent them:
1. The full FTR-035 `apply` argument list. The Tech-Spec algorithm shows it only as the placeholder `<FTR-035 args: proposal, prefix>`.
2. How `<features-root>` is derived. The excerpt says only "features root".
3. The argument order around `--` in the run-asset form. The Tech-Spec shows `run-asset scripts/feature-split.js --project <root> -- apply ...`, which must be checked against the run-asset CLI.

Resolve these from the FTR-035 apply contract before editing. If they cannot be resolved, stop and report the gap instead of guessing.

Edit to the accept branch. The prose-only "runs apply" statement from US-02-TASK-BE-07 is replaced by this concrete step:

```text
"accept":
    # Reached only after an explicit accept to the current proposal.
    # BE-06 re-presents the proposal after every accepted edit, so this is the last shown version.
    payload = last_accepted_proposal          # exact object from the final presentation, edits included
    result = run-asset scripts/feature-split.js --project <root> -- apply \
                 --features-root <features-root> --parent <FTR-ID>
             stdin: JSON.stringify(payload)   # FTR-035 D-08 shape, source "measured", confirmed keywords
    if result failed:   -> BE-03 failure branch (report error, no partial set, stop before Gate 1)
    else:               -> BE-02 success branch (report parent and children, stop, no Gate 1)
```

Rules the skill text must state next to the call:
- `<FTR-ID>` is the parent prefix of the current run. It is not read from the proposal.
- Stdin carries only the confirmed JSON payload. It carries no paths and no prompt text.
- The call is made only from this main-loop step, never from `pm-phase1` (D-06).
- No `apply` call happens on reject or on an unanswered proposal (see BE-05 and BE-04 wording).

Duplicate check: US-02-TASK-BE-07 already contains prose saying accept runs `apply`. That is wording in the same branch, not a second implementation. This task supplies the concrete invocation, so no conflict is reported.

Test coverage: the static assertions for this call belong to US-03-TASK-TEST-01. This task's verification is the existing suite plus the greps below.

**Verification commands:**

```
npm test
```

```
grep -n -- "--features-root" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n -- "--parent" src/claude/skills/implement-feature/SKILL.md
```