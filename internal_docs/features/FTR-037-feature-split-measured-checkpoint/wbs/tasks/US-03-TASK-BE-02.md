<a id="task-US-03-TASK-BE-02"></a>
### US-03-TASK-BE-02

- **Task ID:** US-03-TASK-BE-02
- **Title:** Add created-children report and parent stop after successful apply
- **Outcome:** SKILL.md Step 1a tells the main loop, after a successful apply, to report the parent prefix and the child IDs and folders that apply created. It then stops the pipeline for the parent with no Gate 1 digest in this run and no change to the parent's documents.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-01
- **Acceptance criteria:** AC-11
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 6000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** report created children and stop parent after apply

**Implementation notes:**

**File:** `src/claude/skills/implement-feature/SKILL.md`, Step 1a, accept branch, success path only.

**Scope boundary.** US-03-TASK-BE-01 adds the `apply` call and the failure path is handled by US-03-TASK-BE-03. This task changes only the text that runs after `apply` exits successfully. It does not add a new branch, and it does not change the Gate 1 path or any other step.

**Locating the edit.** The Tech-Spec excerpt does not give line numbers for Step 1a. Find it by the heading `Step 1a` and the accept branch's success arm, which in the Tech-Spec algorithm reads `report created children` followed by `STOP for the parent. Do not reach Gate 1.`. Do not rely on line numbers.

**Before** (success arm of the accept branch, as left by the earlier Step 1a tasks):

```text
else:
    report created children
    STOP for the parent. Do not reach Gate 1.
```

**After:**

```text
else:   # apply exited successfully
    report to the user:
      "Split applied for parent <PARENT-PREFIX>."
      "Epic: <epic ID and folder, exactly as apply returned them>"
      for each child in apply's result:
          "<child ID> — <child folder, exactly as apply returned it>"
    # Do not write, rename or edit any document of the parent in this run.
    STOP for the parent.
    # Do not show a Gate 1 digest. Do not ask for approval. Do not run any further step for the parent.
```

**Rules to state in the SKILL.md text:**

- The report uses the child IDs and folders exactly as `apply` returned them. The main loop does not generate, rename or re-derive them.
- If the `apply` result does not list a child ID or folder, the report must say that the value is missing. It must not invent one.
- The parent's documents are not changed in this run. The stop comes before any write to them.
- The wording must not describe the split as complete if any child is missing from the result. That case is covered by US-03-TASK-BE-03.

**Open gap.** The argument and result shape of the FTR-035 `apply` command is not in the excerpt (see the Tech-Spec open gaps). The field names used above (epic ID, child ID, child folder) are placeholders until the result shape is confirmed. Write the text against the actual result keys when US-03-TASK-BE-01 has fixed them. If the keys are not yet known at execution time, stop and report this instead of guessing them.

**Duplicate check.** US-02-TASK-BE-07 already states that accept stops for the parent without reaching Gate 1. This task extends that same success arm with the report. It is an edit to existing text, not a second implementation.

**Verification commands:**

```
node -e "const s=require('fs').readFileSync('src/claude/skills/implement-feature/SKILL.md','utf8');const i=s.indexOf('Step 1a');if(i<0||!/created children/i.test(s.slice(i)))process.exit(1)"
```

```
npm test
```