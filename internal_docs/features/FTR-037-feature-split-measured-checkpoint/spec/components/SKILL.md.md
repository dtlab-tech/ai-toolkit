# src/claude/skills/implement-feature/SKILL.md — Modified

## Change

This change adds a new Step 1a to the `implement-feature` skill, between the return of `pm-phase1` and Gate 1, and leaves the rest of the skill unchanged. Step 1a reads `split_checkpoint` from the `pm-phase1` return value (FTR-037 D-06) and branches on its `status` (D-05, D-11). On `skipped` or `passed` it continues to Gate 1 without a prompt (BR-02). On `unavailable`, or when the result is missing, failed or not parseable JSON (BR-04), it prints each unavailable count with its reason as a plain error in the main loop and stops before Gate 1. It is not a gate and not an approval prompt (D-04). On `split-proposed` it presents the proposal and collects accept, edit or reject. The prompt, the edit loop and the `apply` call run only in this main-loop step, never inside the workflow (D-06). Accept runs the FTR-035 `apply` and stops the pipeline for the parent. Reject continues to Gate 1 unchanged and stores nothing (D-10, BR-01). The proposal shows each over-threshold count beside its threshold, using the values from the check result, so no threshold numbers are hard-coded in the skill. Keywords are derived by the main-loop agent from each child's title, use cases and components (D-09). `check-size` stays LLM-free (NFR-01), so the proposal it prints has no Keywords, and the agent fills them in before presentation. Nothing else in the skill is changed.

Open gaps for the host to surface at Gate 1:
- The argument list of the FTR-035 `apply` command is not in this excerpt. The apply call below uses a placeholder until FTR-035 fixes it.
- The source of `Summary` for each child is not decided by feature.md (D-09 covers only Keywords). The skill displays the Summary produced by the proposal and treats it as editable.
- Whether Keywords and Summary are re-derived after the user edits a child's title, use cases or components is not decided. This design keeps a user-edited Keywords value and does not re-derive it automatically.
- The editable-field list is restated here from the Tech-Spec Section 9 summary of FTR-035 D-09 to D-11, because those decisions are not reproduced in the excerpt.

## Algorithm

Step 1a runs in the `implement-feature` main loop immediately after `pm-phase1` returns.

```text
STEP 1a — Size checkpoint (main loop)

cp = pm_phase1_result.split_checkpoint
if cp is missing, not an object, or cp.status is not one of
   {skipped, passed, unavailable, split-proposed}:
    cp = { status: "unavailable",
           unavailable: [{ count: "check-size", reason: "check result missing or not parseable" }] }

switch cp.status:

  case "skipped", "passed":
      continue to Gate 1 (unchanged)

  case "unavailable":
      for u in cp.unavailable:
          print "Cannot measure <u.count>: <u.reason>"
      STOP. Do not present Gate 1. Do not ask for approval.
      (The check is re-run only after the cause is fixed.)

  case "split-proposed":
      proposal = cp.proposal                      # FTR-035 D-08 shape, source: "measured"
      for child in proposal.children:
          child.keywords = agent_derive_keywords(child.title, child.use_cases, child.components)
          # Keywords are produced here in the main loop, not by feature-split.js (NFR-01, D-09).
      present_proposal(proposal, over = cp.over, thresholds = cp.thresholds)
      loop:
          decision = ask_user("accept | edit | reject")
          match decision:
            "accept":
                result = run-asset scripts/feature-split.js --project <root> -- apply <FTR-035 args: proposal, prefix>
                if result failed:
                    report error; FTR-035 D-13 staging/rollback applies
                    STOP. Do not reach Gate 1. A retry is a fresh run with fresh IDs (T-4, T-5).
                else:
                    report created children
                    STOP for the parent. Do not reach Gate 1.
            "edit":
                apply user changes to: child names, purposes, order, foundation owner,
                  add / remove / merge children, Summary, Keywords
                if remaining child count < minChildren:
                    refuse the edit and re-prompt
                else:
                    re-present proposal; continue loop
            "reject":
                store nothing
                continue to Gate 1 (unchanged)
                break loop
```

Presentation rules:

- Each over-threshold count is shown as `<count>: <value> / threshold <threshold> (over)`. Counts not over their threshold are not listed as over.
- Each child shows order, title, purpose, use cases, components, Summary and Keywords.
- The shared foundation is shown on its owning child. If `proposal` states that no foundation is assigned (D-07), that statement is shown as is.
- A child with empty or missing components is shown as an error and cannot be accepted unedited.
- The proposal is never created on screen as a file. Nothing is written until `accept`.

## Tests

Test file: `tests/workflows/split-checkpoint-static.test.js`. This static test pins the text of this skill. It does not run the skill. Key cases:

- Step 1a exists and sits between the `pm-phase1` call and the Gate 1 call. The text of the skill must show Step 1a before Gate 1.
- Step 1a names all four statuses: `skipped`, `passed`, `unavailable` and `split-proposed`. It continues to Gate 1 on `skipped` and `passed`.
- `unavailable` prints each count and reason, stops before Gate 1, and contains no approval prompt (D-04, BR-03).
- A missing, failed or non-JSON check result is treated as `unavailable`, and the text says so (BR-04).
- `split-proposed` offers exactly accept, edit and reject. Reject continues to Gate 1 and the text states that nothing is stored (D-10, BR-01).
- Accept calls `apply` from `feature-split.js` and stops for the parent. It does not reach Gate 1.
- Edit refuses a result below `minChildren` and re-presents the proposal.
- The skill text does not hard-code threshold numbers. It reads them from `thresholds` in the result.
- The skill text states that Keywords are derived by the main-loop agent, not by `check-size` (D-09, NFR-01).
- The prompt and `apply` are not called from inside `pm-phase1` (D-06). The test checks that the skill, not the workflow, contains the `apply` call.

The `check-size` behaviour itself is covered by `tests/scripts/feature-split-check-size.test.js`, which is not part of this component.

Addresses: AC-03, AC-06, AC-10, AC-11, AC-12, AC-14, AC-15, AC-16, AC-19, AC-20, AC-21. The excerpt does not include the wording of these acceptance criteria, so this section does not map each one to a specific test case. The mapping should be confirmed against the Requirements text.