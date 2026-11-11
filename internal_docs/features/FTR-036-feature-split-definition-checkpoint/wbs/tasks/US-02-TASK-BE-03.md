<a id="task-US-02-TASK-BE-03"></a>
### US-02-TASK-BE-03

- **Task ID:** US-02-TASK-BE-03
- **Title:** Add accept split branch to the agent with parent register before apply
- **Outcome:** gaia-define-feature.md handles checkpoint decision accept in this order: the no-overwrite guard, a .split-staging-* leftover check, the parent feature.md write, register with status defined, then apply --parent with the proposal on stdin. The text cites the apply initial-mode precondition.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-01, US-01-TASK-BE-04
- **Acceptance criteria:** AC-10
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add accept split branch to define-feature agent

**Implementation notes:**

Target file: `src/claude/agents/gaia-define-feature.md`. Add one new sub-branch under Phase 4, named "Phase 4 — split branch (checkpoint decision: accept)", placed after the standalone branch that US-02-TASK-BE-01 adds. The excerpt gives no current line numbers, so locate the insertion point by the `Phase 4` heading and the standalone branch. Do not change Phase 3a, the standalone branch, the reject routing (US-02-TASK-BE-02), the edit loop (US-02-TASK-BE-04), or the partial-failure offer wording beyond what the step list below requires (US-02-TASK-BE-05 owns that).

This branch is entered only from a checkpoint re-invocation with `decision: accept`. The grilling record and proposal arrive in the prompt. The agent does not re-run grilling or `check-definition`, and it never writes the record or proposal to disk. The proposal is passed to `apply` through a heredoc, not a temp file.

Text to insert:

```text
#### Phase 4 — split branch (checkpoint decision: accept)

Entered only when the re-invocation carries decision = accept. Record and proposal come from the prompt.

1. Existence guard (BR-04): if test -e "{featureDir}/feature.md" -> STOP, report that the
   parent feature.md already exists, and never overwrite it. Write nothing.
2. Leftover check: if any entry matching .split-staging-* exists under featuresRoot
   -> STOP, report the leftover path, and run no apply. Later applies stay blocked until
   the leftover is cleared (Tech-Spec §12).
3. Write the parent {featureDir}/feature.md with the existing template (unchanged).
   Summary = first sentence of the parent Summary section. Keywords as confirmed in the proposal.
4. Register the parent BEFORE apply:
     run-asset scripts/feature-split.js --project "<projectRoot>" -- register \
       --features-root "$featuresRoot" --feature-id "$PREFIX" \
       --summary "<summary>" --keywords "<k1,k2,...>" --status defined
   Reason: the FTR-035 apply initial-mode precondition requires a defined parent (D-08 refinement).
5. Apply the proposal, passed on stdin:
     cat <<'JSON' | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
         apply --features-root "$featuresRoot" --parent "$PREFIX"
     <proposal as JSON>
     JSON
6. Success -> Phase 5 with the created children listed.
   Failure -> return an ERROR block listing the children already created (parsed from apply
   output) and any .split-staging-* leftover. Offer retry (back to step 2), edit (back to
   the proposal), or reject (the parent continues as a standalone feature, already
   registered; created children are reported and not deleted by this agent).
```

Open points, not in the excerpt and to confirm against FTR-035 before the text is final: the exact `register` flag names and standalone status value, the exact stdin shape for `apply`, and the location of `.split-staging-*` leftovers. Write the text so these are named by their contracts, not restated in full. The static test pins the anchors `status defined` and `apply --parent`, with `status defined` first, plus the phrases `never overwrite` and `initial mode`, so keep those literal strings in the text.

**Verification commands:**

```
npm test
```

```
grep -n "apply --parent" src/claude/agents/gaia-define-feature.md
```

```
grep -n "never overwrite" src/claude/agents/gaia-define-feature.md
```