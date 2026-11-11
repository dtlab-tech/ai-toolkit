<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Add late-child epic lookup and status gate to the agent
- **Outcome:** gaia-define-feature.md has a late-child mode (epicId, childTitle, childPurpose) that resolves the features root with ai-toolkit resolve-features-root and finds the epic by a folder name equal to the ID or starting with the ID and a hyphen, on a folder that contains epic.md. It lists candidate epics and creates nothing when none matches. It refuses, naming the status, unless the registry status is epic. It runs no grilling round.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-14, AC-16
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late-child epic lookup and status gate to define-feature agent

**Implementation notes:**

Target file: `src/claude/agents/gaia-define-feature.md`. I read it. It is still the pre-US-01 version: it has no Phase 3a and no `Mode:` dispatch. The current Input section ends at line 24 (`If a source reference is given, ...`), followed by the `---` separator at line 26. Insert the new section between those two lines, so the late-child block sits after Input and before Phase 0. This placement does not depend on Phase 3a existing yet. Do not edit Phases 0–5 or the Guidelines in this task. The Phase 1d/4b wording is handled by other tasks.

Gaps in the Tech-Spec excerpt. Do not invent these; write the section with the placeholders shown and flag them in the agent text as "confirm against FTR-035":
- The command that reads the registry status of an epic. The excerpt does not name it.
- The stdin/argument shape of `apply --parent` in late mode.
- How a not-yet-assigned child is checked for an existing `feature.md` or folder. The child ID is assigned by `apply`, so the check target is unclear.
- Ledger handling for the late child.

If the status command or the duplicate-check target cannot be determined at run time, the agent must stop and report. It must not guess a path or a status.

Text to insert after line 24 of `gaia-define-feature.md`:

```markdown
## Late-child mode (UC-03)

Entered when the spawn prompt's first line is `Mode: late-child`, with `epicId` (FTR-ID), `childTitle`, and `childPurpose`.

- **No grilling round.** Do not run Phase 2, Phase 3, or Phase 3a in this mode.
- **Phase 0 is limited** to reading `{epicFolder}/epic.md`. Skip 0a–0e.
- **No standalone fallback.** Every refusal below ends the run. Nothing is written.
- **No `register` call.** A late child is never registered by this path.

### L1. Resolve the features root
```bash
featuresRoot=$(ai-toolkit resolve-features-root) && echo "$featuresRoot"
```
If it exits non-zero: report the error and STOP. Write nothing. Do not hard-code any features-root path.

### L2. Locate the epic (ID match)
For each folder `D` under `{featuresRoot}` matching `FTR-[0-9]+*` that contains `epic.md`:
```
if name(D) == epicId or name(D) starts with epicId + "-"    # FTR-1 never matches FTR-10; FTR-1-x does
    epicFolder = D
```
- If no match: list the candidate epics (folders containing `epic.md`) as `FTR-ID  folder-name`.
  - If the list is empty: report "no epic folders found under featuresRoot", STOP, create nothing.
  - Otherwise: AskUserQuestion to pick one. If the user picks none: STOP, create nothing.
- Once `epicFolder` is set, read `{epicFolder}/epic.md` (this is the only Phase 0 read).

### L3. Registry status gate
```
status = <registry-status lookup for epicId: command NOT given in the Tech-Spec, confirm against FTR-035>
if lookup fails or returns no value: report, STOP
if status != "epic":
    report "epic {epicId} has registry status '{status}'; late children require status 'epic'"
    STOP. No standalone fallback.
```

L4 to L7 (duplicate check, Summary and Keywords derivation, late proposal, accept, edit and reject with apply) are added by US-03-TASK-BE-02 and US-03-TASK-BE-03. Do not write them in this task; end the inserted section after L3.
```

Note: the ledger handling for late child is not defined in the excerpt. Do not add ledger calls to this section without confirming them first.

**Verification commands:**

```
npm test
```

```
grep -q "Late-child mode (UC-03)" src/claude/agents/gaia-define-feature.md
```

```
grep -q "resolve-features-root" src/claude/agents/gaia-define-feature.md
```

```
grep -q "starts with epicId" src/claude/agents/gaia-define-feature.md
```

```
grep -q "late children require status 'epic'" src/claude/agents/gaia-define-feature.md
```