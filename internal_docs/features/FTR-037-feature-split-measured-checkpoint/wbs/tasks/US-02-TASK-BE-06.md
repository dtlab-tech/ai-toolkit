<a id="task-US-02-TASK-BE-06"></a>
### US-02-TASK-BE-06

- **Task ID:** US-02-TASK-BE-06
- **Title:** Add edit loop with minChildren refusal and re-presentation to Step 1a
- **Outcome:** The SKILL.md Step 1a decision loop offers accept, edit or reject. For edit it lists the editable fields: child names, purposes, order, foundation owner, add, remove or merge children, Summary and Keywords. It refuses an edit that leaves fewer than minChildren children and keeps the previous proposal. After each accepted edit it re-presents the proposal and requires a fresh explicit accept.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-05
- **Acceptance criteria:** AC-16
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add proposal edit loop to implement-feature Step 1a

**Implementation notes:**

**Scope boundary.** This task changes only the `"edit"` arm of the `split-proposed` decision loop in `src/claude/skills/implement-feature/SKILL.md` (Step 1a, between the `pm-phase1` return and Gate 1). The decision prompt must still offer `accept | edit | reject`. The bodies of `accept` and `reject` belong to US-02-TASK-BE-07 and are not written here. The presentation rules come from US-02-TASK-BE-05 and are reused, not rewritten.

**Location.** The excerpt does not give current line numbers for SKILL.md. Locate the `split-proposed` branch of Step 1a by searching for the `"edit":` arm. If that arm is not present, or the loop does not act on a single current proposal variable, stop and report it rather than restructuring the skill.

**Required change (replace the `"edit"` arm).** The arm must act on a `current_proposal` variable, initialised from `cp.proposal`. Accept (BE-07) must send `current_proposal`, not the original proposal, so that the last re-presented proposal is the one applied.

```text
"edit":
    change = ask_user("Edit one field: child name, purpose, order, foundation owner,
                       add child, remove child, merge two children, Summary, Keywords.")
    candidate = editProposal(current_proposal, change)     # FTR-035 D-09..D-12
    if count(candidate.children) < minChildren:
        print "Edit refused: it would leave <n> children; the minimum is <minChildren>.
               The previous proposal is kept."
        # current_proposal is NOT replaced
        -> return to the decision prompt (accept | edit | reject)
    else:
        current_proposal = candidate
        re-present current_proposal using the BE-05 presentation rules
        (over-threshold counts beside thresholds, per-child fields, foundation note)
        -> return to the decision prompt
        # Only an explicit new "accept" answer applies it. The edit is never an implicit accept.
```

**Rules this arm must state in the skill text:**
- Each edit is one change. Each accepted edit is re-presented once, and then the decision prompt is shown again.
- A refused edit changes nothing. The user may try a different edit or answer accept/reject.
- Keywords the user has edited are kept as entered and are not re-derived automatically (open gap from the design).
- The minimum child count is named as `minChildren` and is never written as a number in the skill (see gap below).

**Open gaps to report, not invent:**
1. **Source of `minChildren`.** The excerpt does not say how the skill receives `minChildren`. The `check-size` result shape (D-05) lists `thresholds` for the four counts only. Do not hard-code a value. Confirm where it is delivered before implementing. If it is not available to the skill, stop and report.
2. **`editProposal` existence.** The skill calls `editProposal` (FTR-035 D-09 to D-12), which is not in the excerpt. Confirm it exists in the FTR-035 facade or is a procedure the main-loop agent follows. If it is neither, stop and report.

**Verification commands:**

```
npm test
```

```
npx jest tests/workflows/split-checkpoint-static.test.js
```

```
grep -n "minChildren" src/claude/skills/implement-feature/SKILL.md
```

```
grep -n "fresh explicit accept" src/claude/skills/implement-feature/SKILL.md
```