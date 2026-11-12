<a id="task-US-03-TASK-BE-05"></a>
### US-03-TASK-BE-05

- **Task ID:** US-03-TASK-BE-05
- **Title:** Add edit-then-reject discard rule to Step 1a reject branch
- **Outcome:** SKILL.md Step 1a states that rejecting a proposal, including one the user already edited, discards the edits and continues to Gate 1 with the parent's documents unchanged. It states that no rejection record and no registry change is written.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-07
- **Acceptance criteria:** AC-12, AC-13
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** state edit-then-reject discards edits in Step 1a

**Implementation notes:**

This is a text-only change to one file: `src/claude/skills/implement-feature/SKILL.md`, inside Step 1a. No script, no code path, and no threshold number changes. The excerpt does not include the current line numbers of the Step 1a reject branch, so anchor the edit on the `"reject":` branch of the Step 1a pseudocode block. Match the wording that US-02-TASK-BE-07 actually left in the file. Do not change the accept, unanswered, or `unavailable` text.

Current reject branch, as specified by the Tech-Spec algorithm (US-02-TASK-BE-07 wording):

```text
            "reject":
                store nothing
                continue to Gate 1 (unchanged)
                break loop
```

Replacement branch:

```text
            "reject":
                discard all edits made to this proposal, including edits already
                  shown in a re-presented proposal; the edited proposal is never applied
                store nothing: no rejection record is written and no registry change is made
                leave the parent's documents unchanged
                continue to Gate 1 (unchanged)
                break loop
```

Add one plain sentence of user-facing prose next to the reject option in the Step 1a text, so the rule is visible to the main-loop agent and not only in the pseudocode:

> Rejecting discards every edit made in this session, including an edit the user already saw in a re-presented proposal. No rejection record is written and no registry change is made. The pipeline continues to Gate 1 with the parent's documents unchanged.

Wording constraints:
- Use the exact phrases "discard all edits" (or "discards all edits") and "no rejection record" so the grep-based verification below and the static test in US-03-TASK-TEST-02 can match them.
- Do not add any approval prompt or new option. Reject remains a single outcome among accept, edit and reject.
- Do not state that a rejected edit is saved to a draft or resumed later. The FTR-035 design stores nothing between runs (US-03-TASK-BE-04).

Estimated scope: one Markdown file, two small edits, about 10 minutes of agent work. The estimate covers reading the Step 1a section, making the edit, and running the verification commands.

**Verification commands:**

```
grep -Fqi "discard all edits" src/claude/skills/implement-feature/SKILL.md
```

```
grep -Fqi "no rejection record" src/claude/skills/implement-feature/SKILL.md
```

```
npm test
```