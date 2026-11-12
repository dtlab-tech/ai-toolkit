<a id="task-US-02-TASK-BE-05"></a>
### US-02-TASK-BE-05

- **Task ID:** US-02-TASK-BE-05
- **Title:** Add split-proposed Keywords derivation and proposal presentation to Step 1a
- **Outcome:** The Step 1a split-proposed branch in SKILL.md tells the main-loop agent to derive only each child's Keywords from its title, use cases and components. It then presents each over-threshold count beside its threshold, read from the result, and for each child its name, purpose, Summary, Keywords, dependsOn, and assigned use cases and components. It also states the foundation owner or the no-foundation note.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-04, US-02-TASK-BE-03
- **Acceptance criteria:** AC-03, AC-10, AC-14, AC-15, AC-19
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** present measured split proposal with derived keywords in Step 1a

**Implementation notes:**

Scope: a text change to `src/claude/skills/implement-feature/SKILL.md` only. No code, no change to `pm-phase1.js` or `feature-split.js`. The `split-proposed` branch is inside the Step 1a block that US-02-TASK-BE-04 adds between Step 1 and Step 2 (Gate 1). This task replaces the BE-04 placeholder for `split-proposed` (if one exists) with the text below. It does not add the edit loop or the accept/reject outcomes; those belong to BE-06 and BE-07.

I did not read the current SKILL.md, so I cannot give exact line numbers. Locate the Step 1a heading and its `split-proposed` case by searching for `Step 1a` and `split-proposed`. The design text below is the source of truth for the replacement.

Source of the behaviour (Tech-Spec, SKILL.md component):
- `split_checkpoint` comes from the `pm-phase1` return value (FTR-037 D-06). The Keywords derivation and presentation happen only in the main loop, never inside the workflow (D-06).
- `check-size` stays LLM-free (NFR-01), so the printed proposal has `keywords: []`. The main-loop agent fills Keywords in before presentation (D-09). Keywords are derived for each child only. Nothing else in the proposal is re-derived.
- Thresholds must be read from the check result `thresholds`. No threshold number may be written into the skill.

Replacement text for the `split-proposed` case of Step 1a (pseudocode, to be written as skill prose):

```text
case "split-proposed":
    proposal = cp.proposal            # source: "measured", keywords: [] on every child
    for child in proposal.children:
        # Derive ONLY Keywords, from this child's title, use cases and components.
        # Do not change name, purpose, order, dependsOn, use cases or components here.
        child.keywords = agent_derive_keywords(child.name, child.useCases, child.components)
    present_proposal(proposal, over = cp.over, thresholds = cp.thresholds)
    # Next: the accept | edit | reject loop (BE-06 / BE-07). Not part of this task.
```

Presentation rules to write into the skill:
- For each count in `cp.over`, show `<count>: <counts[count]> / threshold <thresholds[count]> (over)`. Read both numbers from the result. Do not list counts that are not in `over`.
- For each child, in order, show: name, purpose, Summary, Keywords, dependsOn, assigned use cases, assigned components.
- Show the foundation owner (`proposal.sharedFoundationOwner`) and its dependents. If the proposal has no foundation (`sharedFoundationOwner` is null), show `proposal.foundationNote` as it is. Do not invent a foundation.
- A child with empty or missing components is shown as an error and cannot be accepted unedited (per the component design).
- State that the proposal exists only on screen. Nothing is written before an explicit accept.

Keep the `split-proposed` branch free of any `apply` call. The apply call is in the accept outcome (BE-07). Keep the Keywords step free of numbers, paths or thresholds.

Open gaps to keep visible in the skill text, not decided here:
- The Summary source is not defined by feature.md. Display what the proposal gives and treat it as editable.
- Whether Keywords are re-derived after a user edit is not decided. Do not add re-derivation logic in this task.
- The field names in the pseudocode (`name`, `useCases`, `components`) are placeholders. Use the exact keys of the FTR-035 D-08 proposal shape as produced by `feature-split.js`, and check them against BE-01 to BE-03 before writing.

Length: the replacement is about 25 to 40 lines of skill prose. It is not a new file.

**Verification commands:**

```
npm test
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
grep -n "split-proposed" src/claude/skills/implement-feature/SKILL.md
```