<a id="task-US-03-TASK-BE-03"></a>
### US-03-TASK-BE-03

- **Task ID:** US-03-TASK-BE-03
- **Title:** Add late-child accept and reject handling to the agent
- **Outcome:** gaia-define-feature.md handles a late-child accept by running apply --parent with the epic ID and one child on stdin, placed last, and reports the created child path and ID. It never calls register for the child. A rejection creates nothing and writes no standalone feature.md. Edits go through validate-proposal.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-02, US-02-TASK-BE-04
- **Acceptance criteria:** AC-13, AC-17, AC-18
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late-child apply and reject handling to define-feature agent

**Implementation notes:**

This task edits only the late-child section of `src/claude/agents/gaia-define-feature.md`. The Tech-Spec excerpt names the section's steps but not their current line ranges, so the edit anchors on the heading and step text, not on line numbers. Do not change Phases 0 to 4, the BR-04 guard, or the split branch.

The late-child section must cover three decisions. Each is shown below as the required behaviour.

1. **Accept (apply, no register).** Insert this after the existing late-child proposal step, replacing any text that routes accept to `register` or to a standalone write:

```text
Late child, decision = accept:
  1. Re-check before writing (defensive, same rules as Phase 3 late steps 1-3):
       epic.md still present under featuresRoot; status still "epic";
       "{featureDir}/feature.md" for the child still absent (BR-04). Any failure -> STOP, report, write nothing.
  2. Leftover check: any ".split-staging-*" entry under featuresRoot -> STOP, report, no apply (Tech-Spec §12).
  3. Build the one-child payload in memory: { name, purpose, summary, keywords },
     placed last, dependsOn = [previous last child].
     cat child.json | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
         apply --features-root "$featuresRoot" --parent "$EPIC_ID"
  4. Parse the apply output for the created child path and ID; report both to the user; finish with DONE.
  5. Never call "register" for the child (Tech-Spec §2.3). The epic is not re-registered on this path.
```

   Open gap, to confirm against FTR-035 before implementation: the exact stdin payload shape for `apply` in late mode is not in the excerpt. The snippet above assumes the same one-child shape as the split branch. The Tech-Spec does not specify late-path apply failure handling either. Until Gate 1 decides it, the agent reports apply's error text verbatim, stops, and makes no `register` call.

2. **Edit (validate-proposal, no write).**

```text
Late child, decision = edit:
  cat <<'JSON' | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
      validate-proposal --features-root "$featuresRoot" --feature-id "$EPIC_ID"
  { "proposal": <current one-child proposal>, "edit": "<user edits>" }
  JSON
  Report violations and foundation warnings from the single JSON line.
  Return a revised late CHECKPOINT. Write nothing. Require a new explicit accept.
```

   The `validate-proposal` input envelope is also an FTR-035/INFRA-TASK-BE-03 contract. Check the key names there and do not invent a different one.

3. **Reject (nothing created).**

```text
Late child, decision = reject:
  Create nothing. Do not write feature.md. Do not run apply or register.
  No standalone fallback. Report "no child created" and finish with DONE.
```

Verification requires that these three paths contain no write to the child's `feature.md`, and that the late-child section has no `register` invocation. The static test suite checks this by text. A future reviewer should confirm by reading the late-child section.

**Verification commands:**

```
grep -q "### L7. Decision" src/claude/agents/gaia-define-feature.md
```

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
npm test
```