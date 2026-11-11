<a id="task-US-03-TASK-BE-03"></a>
### US-03-TASK-BE-03

- **Task ID:** US-03-TASK-BE-03
- **Title:** Add apply failure handling to Step 1a accept
- **Outcome:** SKILL.md Step 1a tells the main loop that when apply fails it reports the error and says the split was not applied. It states that FTR-035 D-13 staging and rollback leave no child folder or registry entry. It never reports a partial child set as complete, and it stops before Gate 1.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-20
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add apply failure and rollback reporting to Step 1a

**Implementation notes:**

This is a text-only change to `src/claude/skills/implement-feature/SKILL.md`. It edits the failure branch of the Step 1a `accept` case. No code and no other file changes. The excerpt gives no line numbers, so locate the branch by its text, not by line.

The branch currently reads, in the Step 1a pseudocode:

```text
            "accept":
                result = run-asset scripts/feature-split.js --project <root> -- apply <FTR-035 args: proposal, prefix>
                if result failed:
                    report error; FTR-035 D-13 staging/rollback applies
                    STOP. Do not reach Gate 1. A retry is a fresh run with fresh IDs (T-4, T-5).
```

Replace the `if result failed:` block with the following. The `apply` argument list is not final. It is set by US-03-TASK-BE-01 (`--features-root <root> --parent <FTR-ID>`, proposal as JSON on stdin). Do not restate or invent arguments in this block:

```text
                if result failed:
                    print "Split NOT applied: feature-split.js apply failed: <error message from result>"
                    print "FTR-035 D-13 staging and rollback leave no child folder and no registry entry for this split."
                    print "No child set is reported as created. The parent documents are unchanged."
                    STOP. Do not reach Gate 1. Do not present a digest.
                    # A retry is a fresh run (see US-03-TASK-BE-04): fresh child IDs, check-size re-run.
```

Rules for the written text:
- The failure message must say the split was not applied. It must not say "partially applied" or list any child as created.
- The text must state that D-13 staging and rollback leave no child folder or registry entry. Do not claim that the failed run leaves any residue.
- Do not add a success-style list of children on this path. The success report belongs to US-03-TASK-BE-02.
- Do not add any approval prompt on this path.
- Do not add any retry logic inside the skill. Retry wording belongs to US-03-TASK-BE-04.

Stop condition: if the BE-01 `apply` invocation is not yet in the skill when this runs, stop and report it. This task is written against the BE-01 text and cannot be verified without it.

Check the edit with a static grep before running the suite: the failure block must contain the words "not applied", "D-13" and "Do not reach Gate 1", and must not contain the word "partial" as a completion claim.

**Verification commands:**

```
grep -n "not applied" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n "D-13" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n "Do not reach Gate 1" src/claude/skills/implement-feature/SKILL.md
```

```
npm test
```