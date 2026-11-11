# src/claude/agents/gaia-define-feature.md — Modified

## Change

This modifies the `define-feature` agent prompt. A new Phase 3a (size checkpoint) sits between Phase 3 (clarification) and Phase 4 (write). Phase 3a builds the in-memory grilling record (`actors`, `applications`, `flows`, per D-02 and D-03), runs `feature-split.js check-definition` with the record on stdin, and branches on `status`. `skipped` and `not-flagged` continue to Phase 4 as standalone. `flagged` returns a proposal and stops without writing anything, so the `define-feature` skill can collect accept, edit or reject in the main loop and re-invoke the agent with explicit checkpoint state (return-and-re-invoke, Tech-Spec §2.3). Phase 4 keeps the existing `feature.md` template and writing rules, and adds three things: a BR-04 existence guard that refuses to overwrite; a standalone branch that derives Keywords, lets the user edit them, writes the file and runs `register` (D-08); and a split branch that writes the parent `feature.md`, registers it with status `defined` before `apply --parent` (D-08 refinement, citing the FTR-035 apply initial-mode precondition), then handles partial apply failure. The input section gains two entry modes, checkpoint re-invocation and late child (UC-03). The late child takes an exact FTR-ID epic match, refuses unless the registry status is `epic`, has no grilling round and no standalone fallback, and makes no `register` call; its Summary and Keywords come from its purpose and the epic's Summary (D-07 refinement). Phases 0, 1a–1d, 2, 3 questions, 4b (ledger close) and the Guidelines are unchanged. Phase 5 gains a split-result summary. Open gaps, not in the excerpt and to be confirmed against FTR-035: the exact `register` and `apply` flag names and the `status` value for standalone registration; the command that reads registry status for the late-child check; the location of `.split-staging-*` leftovers; the apply input for late mode; the foundation-warning text (FTR-035 D-10); how `applications` are elicited during grilling; the ledger handling for late child; and what cleanup, if any, follows a reject after partial failure.

### Algorithm

#### Input modes

- **Fresh definition** (default): Phase 0 through Phase 4 as today, with Phase 3a inserted.
- **Checkpoint re-invocation**: the skill passes `checkpoint: { decision: "accept" | "edit" | "reject", proposal: {...}, record: {...} }`. The agent does not re-run grilling or `check-definition`. It resumes at the Phase 4 split branch (accept), the edit validation (edit), or the standalone branch (reject).
- **Late child** (UC-03): `mode: late-child`, `epicId`, `childTitle`, `childPurpose`. Phase 0 is limited to reading the target epic's `epic.md`.

#### Phase 3a — size checkpoint

```text
record = { actors: [...], applications: [...], flows: [{ name, reason }] }   # memory only, never written to disk

cat <<'JSON' | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
    check-definition --features-root "$featuresRoot" --feature-id "$PREFIX"
<record as JSON>
JSON

if exit != 0 or stderr contains RECORD_INVALID:
    STOP. Report the error. Write nothing. (Tech-Spec §6)

switch result.status:
    "skipped"      -> Phase 4 standalone (no proposal shown)
    "not-flagged"  -> Phase 4 standalone (nothing shown)
    "flagged"      -> build proposal, show it, STOP and return it to the skill (BR-01, BR-03)
```

When `flagged`, the proposal must show:

- The signal counts against each minimum (`signals`).
- Each flow by name with its one-line reason (`flows`, D-02).
- Each child's name, one-line purpose, Summary and Keywords (both editable, D-07), dependency order, and the shared parts assigned to the first child (D-09).
- Every name in `unevaluated`, with the statement that the signal could not be evaluated (BR-02).

Child ids are assigned by `apply` (FTR-035); the proposal carries names only.

#### Checkpoint decisions

```text
accept  -> Phase 4 split branch
edit    -> validate the edited proposal:
             names non-empty and unique
             dependsOn references only listed children, with no cycles
             every shared part assigned to exactly one child
           surface the foundation warning (FTR-035 D-10)
           re-present the proposal and STOP again (BR-01: edits need a new explicit accept)
reject  -> Phase 4 standalone (D-05)
```

#### Phase 4 — standalone branch

```text
1. BR-04 guard: if test -e "{featureDir}/feature.md" -> STOP, report, write nothing
2. Summary  = first sentence of the feature's Summary section (D-08)
   Keywords = derived from the title and main terms (D-08)
3. AskUserQuestion: show Summary and Keywords; user confirms or edits
4. Write {featureDir}/feature.md using the existing template (unchanged)
5. run-asset scripts/feature-split.js --project "<projectRoot>" -- register \
       --features-root "$featuresRoot" --feature-id "$PREFIX" \
       --summary "<summary>" --keywords "<k1,k2,...>" --status defined
   (flag names and standalone status to be confirmed against FTR-035 D-25)
```

#### Phase 4 — split branch (accept)

```text
1. BR-04 guard on {featureDir}/feature.md (STOP if it exists)
2. Leftover check: if any .split-staging-* entry exists under featuresRoot
     -> STOP, report, no apply (Tech-Spec §12 blocks later applies)
3. Write the parent {featureDir}/feature.md using the existing template
4. register the parent with --status defined
     (D-08 refinement: FTR-035 apply in initial mode needs a defined parent)
5. cat proposal.json | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
       apply --features-root "$featuresRoot" --parent "$PREFIX"
6. On success: go to Phase 5 with the created children listed.
   On failure (partial apply):
     report the children already created (parsed from apply output)
     offer: retry (back to step 2), edit (back to the proposal), or reject
     reject -> the parent continues as a standalone feature, already registered;
               created children are reported and not deleted by this agent
```

#### Late child (UC-03)

```text
1. Target epic:
     exact FTR-ID match of epicId, in a folder under featuresRoot that contains epic.md
     no match -> list candidate epics (folders containing epic.md), AskUserQuestion;
                 if none exist -> report and STOP, create nothing
2. Registry status of the epic must be "epic"; otherwise refuse and STOP (no standalone fallback)
3. If the requested child's feature.md already exists -> report and STOP
4. No grilling round. Summary and Keywords are derived from childPurpose and the epic's Summary
   (D-07 refinement: the grilling source is undefined on the late path)
5. Present one-child proposal: name, purpose, Summary, Keywords, placed last,
   depends on the previous last child; wait for explicit confirmation (BR-01)
6. On confirm: apply creates the child (FTR-035; late-mode input to be confirmed)
7. No register call on this path (Tech-Spec §2.3). On reject: nothing is created.
```

## Tests

- **`tests/cli/define-feature-checkpoint-text.test.js`** (static test that pins this agent's text; the skill's text is covered by the same file):
  - Heading order: Phase 3 precedes Phase 3a, which precedes Phase 4.
  - Phase 3a invokes `check-definition` with `--features-root` and `--feature-id`, pipes the record on stdin, and does not write `feature.md` before the proposal stop.
  - All three statuses (`skipped`, `not-flagged`, `flagged`) are handled, and `unevaluated` is surfaced.
  - `RECORD_INVALID` and non-zero exit text says "stop", "report", "write nothing".
  - The BR-04 existence guard appears in both the standalone and the split branch.
  - Standalone branch: `register` appears after the `feature.md` write.
  - Split branch ordering: the parent `register --status defined` index is before the `apply --parent` index.
  - Partial-failure text covers retry, edit, reject, and the `.split-staging-*` block.
  - Late-child text covers exact FTR-ID match, `epic.md`, candidate listing, no-match stop, `status` must be `epic`, existing-child stop, no grilling, and no `register` call.
  - Phase 1a still captures `featuresRoot` once from `ai-toolkit resolve-features-root` and contains no hard-coded `docs/features` path.
  - Phases 0, 1, 2 and 4b headings are still present.
- Behaviour of `check-definition`, `apply` and `register` is covered by `tests/scripts/feature-split.test.js`, owned by the script component and not repeated here.