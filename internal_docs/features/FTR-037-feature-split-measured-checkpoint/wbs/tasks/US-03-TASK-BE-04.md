<a id="task-US-03-TASK-BE-04"></a>
### US-03-TASK-BE-04

- **Task ID:** US-03-TASK-BE-04
- **Title:** Add retry and unanswered-proposal rerun wording to Step 1a
- **Outcome:** SKILL.md Step 1a states that a retry after a failed apply, or after a session that ended before an answer, is a fresh run. That run re-runs check-size and presents a new proposal with fresh child IDs. The failed attempt is not resumed and no state is stored between runs.
- **Dependencies:** US-03-TASK-BE-03
- **Acceptance criteria:** AC-20, AC-21
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** document fresh-run retry and unanswered proposal in Step 1a

**Implementation notes:**

Scope: a documentation-only edit to `src/claude/skills/implement-feature/SKILL.md`. No code, no other file, no change to the `apply` call or to Gate 1. The Tech-Spec excerpt does not include the current text of Step 1a, so the exact insertion point must be located by searching the file for the heading "Step 1a" and for the text "A retry is a fresh run". Those phrases come from the design algorithm and should already be present from US-02-TASK-BE-04 through US-03-TASK-BE-03. Treat that existing pseudocode comment as the anchor, not as the finished wording.

1. Pseudocode comment (already in the design, keep it and make it consistent). In the `accept` / failure branch of the Step 1a algorithm, the comment currently reads:

```text
                if result failed:
                    report error; FTR-035 D-13 staging/rollback applies
                    STOP. Do not reach Gate 1. A retry is a fresh run with fresh IDs (T-4, T-5).
```

   Leave the logic unchanged. Only make sure the comment says the same thing as the prose added below.

2. Prose paragraph (new). Add one short paragraph directly after the Step 1a algorithm block, before the "Presentation rules" list. It must use these claims, in plain language:
   - A retry after a failed `apply` is a fresh run. The failed attempt is not resumed, and nothing from it is reused.
   - A session that ended before the user answered the proposal is also a fresh run. Nothing from the unanswered proposal is kept.
   - Each fresh run re-runs `check-size` and presents a new proposal with fresh child IDs.
   - No state is stored between runs. The skill keeps nothing on disk or in the registry for a proposal that was not accepted.

   Suggested wording (adjust only punctuation to fit the surrounding style):

   > A retry after a failed `apply`, or a new session after a proposal was left unanswered, is a fresh run. The fresh run re-runs `check-size` and presents a new proposal with fresh child IDs. The failed or unanswered attempt is not resumed, and no state is stored between runs.

3. Do not add any new prompt, gate, or stored file. Do not state that the earlier proposal "carries over". The text must not hard-code threshold numbers or child counts.

4. Placement check. The new paragraph must sit inside the Step 1a section, which is before the Gate 1 heading. It must not be placed in the `pm-phase1` workflow file.

5. Length target: about 4 to 6 lines of added prose. No other edits to the file.

Length and scope check: the work is a single prose insertion plus a matching comment check, about 8 minutes of agent time.

**Verification commands:**

```
grep -q "fresh run" src/claude/skills/implement-feature/SKILL.md
```

```
grep -q "fresh child IDs" src/claude/skills/implement-feature/SKILL.md
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
npm test
```