<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Add late-child duplicate check and derived Summary and Keywords to the agent
- **Outcome:** gaia-define-feature.md checks whether the child's feature.md or folder already exists, reports it and stops without overwriting. It derives the child's Summary and Keywords from the child's purpose and the epic's Summary, not from grilling answers, and returns a late CHECKPOINT proposal with editable Summary and Keywords, placed last and depending on the previous last child, without writing any file.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-15, AC-19, AC-08
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late-child duplicate check and derived keywords to define-feature agent

**Implementation notes:**

Target file: `src/claude/agents/gaia-define-feature.md`, late-child section. The excerpt gives no current line ranges, so locate the section by its heading ("Late child (UC-03)") and by the step added in US-03-TASK-BE-01 (epic lookup and status gate). Insert the new steps after the status gate and before the "present proposal" step. Do not edit Phases 0, 1a–1d, 2, 3, 4, 4b or the Guidelines.

This task only adds text to the agent prompt. It creates no script code, writes no files at run time, and does not call `register`.

1. **Duplicate check (AC-15, late path step 3).** Insert after the status gate:

```text
Late child — duplicate check
  If the requested child's feature.md already exists, or its folder already exists under featuresRoot:
    -> report the existing path and STOP
    -> do not overwrite, do not run apply, write nothing
```

   **Gap, to resolve at Gate 1:** the excerpt says "the requested child's feature.md", but child IDs are assigned by `apply` (FTR-035), so the child's folder name is not known before apply runs. The excerpt does not say which key identifies the child before apply. Do not pick one silently. Confirm the key with FTR-035 before writing the check. The check needs a concrete path, and the agent must not invent one.

2. **Derived Summary and Keywords (AC-19, D-07 refinement).** The late path has no grilling round, so the grilling answers are not an input. Draft both values in the agent from two inputs only: `childPurpose` and the epic's Summary (read from `epic.md`).

```text
summary  = drafted from childPurpose, in the context of the epic's Summary   (editable)
keywords = drafted from childTitle, childPurpose and terms shared with the epic's Summary  (editable)
inputs   = childTitle, childPurpose, epic Summary only
```

   The excerpt does not fix the exact drafting rule for a late child. The "first sentence" rule (D-08) belongs to the standalone path and must not be reused here without confirmation.

3. **Late CHECKPOINT proposal (AC-08 link: no register call).** Return one proposal and stop. Show the same fields the Phase 3a flagged proposal shows, for one child:
   - name and one-line purpose
   - Summary and Keywords, marked editable
   - placed last, depending on the previous last child of the epic
   - a request for explicit accept, edit or reject

   Mirror the flagged-proposal wording already in Phase 3a. Do not write `feature.md` and do not call `register`. Nothing is written before the explicit accept, so the proposal stop is the only exit on this path.

Shape check after editing (both must hold):
- The new text contains "already exists" next to "stop" or "report".
- The late-child section names both `childPurpose` and the epic's Summary as the Summary source, and does not mention grilling answers as an input.

**Verification commands:**

```
grep -n -i "already exists" src/claude/agents/gaia-define-feature.md
```

```
grep -n -i "epic's Summary\|epic Summary" src/claude/agents/gaia-define-feature.md
```

```
npx jest --testPathPattern=frontmatter
```

```
npm test
```