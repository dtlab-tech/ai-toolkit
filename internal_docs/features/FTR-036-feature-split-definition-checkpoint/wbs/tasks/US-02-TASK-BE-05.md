<a id="task-US-02-TASK-BE-05"></a>
### US-02-TASK-BE-05

- **Task ID:** US-02-TASK-BE-05
- **Title:** Add partial apply failure reporting to the agent
- **Outcome:** gaia-define-feature.md handles a failed apply by returning an error block. The block lists the child folders already created and any .split-staging-* leftover, and offers retry, edit or reject. Later applies are blocked while a leftover exists.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-03
- **Acceptance criteria:** AC-12
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** report partial apply failure in define-feature agent

**Implementation notes:**

This task edits one branch of `src/claude/agents/gaia-define-feature.md`: the failure path of the Phase 4 split branch. It does not change the accept ordering added by US-02-TASK-BE-03 (no-overwrite guard, leftover check, parent write, `register --status defined`, `apply --parent`). It only changes what happens when step 5 (`apply --parent`) exits non-zero. The excerpt does not give the current line numbers in the agent file, so locate the Phase 4 split branch by its heading and by the step text `On failure (partial apply)`. Do not add a new Phase.

Current design (from the Tech-Spec split-branch pseudocode):

```text
5. cat proposal.json | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
       apply --features-root "$featuresRoot" --parent "$PREFIX"
6. On success: go to Phase 5 with the created children listed.
   On failure (partial apply):
     report the children already created (parsed from apply output)
     offer: retry (back to step 2), edit (back to the proposal), or reject
     reject -> the parent continues as a standalone feature, already registered;
               created children are reported and not deleted by this agent
```

Change to make in step 6, failure branch. Replace the one-line failure description with an explicit error block the skill can parse:

```text
6. On failure (apply exits non-zero):
     a. Parse from apply output: the child folders already created (paths or ids as printed by apply).
        If the output does not list them, run a read-only listing of featuresRoot for child folders
        of "$PREFIX" and report that listing; do not guess.
     b. Check for a leftover: any .split-staging-* entry under featuresRoot.
     c. Return exactly this block and STOP (end the turn, write nothing further):

        ERROR: partial-apply
        feature_id: $PREFIX
        parent: $PREFIX (feature.md written, registered as status defined)
        created_children: [<paths or ids from step a>, or "none"]
        staging_leftover: [<.split-staging-* entries from step b>, or "none"]
        reason: <apply error text, first line>
        options: retry | edit | reject

     d. Options, as handled when the skill re-invokes the agent:
        retry  -> the agent receives `decision: retry`, an explicit state and not `accept`. The parent feature.md and its
                  registry entry already exist from the first attempt, so the BR-04 no-overwrite guard, the parent write
                  and the `register` call are skipped. Run the leftover check (step 2). If a leftover still exists,
                  STOP and report it; no apply is run. Otherwise run step 5 again.
        edit   -> return to the proposal: validate per BE-04 and return a new CHECKPOINT. The accept that follows an edit
                  after a failed apply is handled as a retry: it skips the guard, the parent write and `register`.
        reject -> the parent stays as a standalone feature, already registered as defined.
                  Report created_children as they are. This agent does not delete any child folder.
                  The standalone branch is not re-entered: the parent was already written and registered, so reject
                  writes and registers nothing a second time.
```

Rules to state in the text:
- The no-overwrite guard (BR-04) applies to a first accept only. `retry`, an accept after an edit that follows a failed apply, and `reject` after a failed apply never rewrite the parent and never call `register` again.
- Later applies are blocked while any `.split-staging-*` entry exists. The retry path must go through the step 2 check, not around it.
- Nothing is rolled back by this agent. Cleanup of created children and of any leftover is not in this task's scope.
- The error block is the only output on failure. It has no free text beyond the `reason` line.

Open gaps, not in the excerpt and to be confirmed against FTR-035 apply: the exact format of apply's error output (needed to parse `created_children`); the location and naming of `.split-staging-*` leftovers under featuresRoot; whether apply's own rollback removes partial children before exiting non-zero (if it does, `created_children` is `none` and the text must say so); and how a leftover is cleared so that retry can succeed. Until those are confirmed, the text above uses the generic wording shown.

Verification: this task's text is pinned by `tests/cli/define-feature-checkpoint-text.test.js`, which US-02-TASK-TEST-01 creates later. For this task, check the anchors directly and run the suite.

**Verification commands:**

```
node -e "const t=require('fs').readFileSync('src/claude/agents/gaia-define-feature.md','utf8'); for (const a of ['ERROR: partial-apply','created_children','staging_leftover','options: retry | edit | reject','decision: retry','.split-staging-']) { if(!t.includes(a)) { console.error('missing: '+a); process.exit(1); } } console.log('ok');"
```

```
grep -n "split-staging" src/claude/agents/gaia-define-feature.md
```

```
npm test
```