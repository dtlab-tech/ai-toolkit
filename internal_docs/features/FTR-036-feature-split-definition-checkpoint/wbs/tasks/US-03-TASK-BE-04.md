<a id="task-US-03-TASK-BE-04"></a>
### US-03-TASK-BE-04

- **Task ID:** US-03-TASK-BE-04
- **Title:** Add late-child routing and child prompt to the skill
- **Outcome:** define-feature/SKILL.md routes a request naming an epic FTR-ID (--epic) to Mode late-child, asks the child title and one-line purpose in the main loop, and spawns the agent with no grilling round. It says that a missing epic or a non-epic status creates nothing, and that an existing child feature.md is reported and stops.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-03-TASK-BE-03, US-02-TASK-BE-06
- **Acceptance criteria:** AC-13, AC-14, AC-16
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add late-child routing to define-feature skill

**Implementation notes:**

Scope: this task edits only `src/claude/skills/define-feature/SKILL.md`. It adds the late-child route and the child prompt. It does not add the proposal relay for late children (US-03-TASK-BE-05) and does not change the agent. The skill never writes files and never runs `check-definition`, `apply`, or `register` itself.

Limit of the input: the excerpt does not include the current text of SKILL.md, so I cannot quote exact before-lines. Make the edit as an addition, not a rewrite. Leave the existing spawn block and its sentence "Do not add instructions telling it to skip discovery" byte-for-byte unchanged.

1. Routing (new section, placed in the skill's routing logic next to the existing spawn step):

```text
route(user_request):
  if request contains --epic <FTR-ID>:
      mode = "late-child"          # epic ID named by the user
  elif request is ambiguous between a new feature and a late child:
      ask user: "new feature, or add a missing child to an existing epic?"   # no spawn yet
  else:
      mode = "define"
```

2. Child prompt (main loop, before any spawn in late-child mode). Ask the user two questions, one at a time:
   - child title (short name for the new child)
   - child purpose (one line)
   Store the answers as `childTitle` and `childPurpose`. Do not ask grilling questions on this path.

3. Spawn prompt for late-child mode. The `Mode:` line is the first line. The existing spawn block follows unchanged, with the late-child fields added:

```text
Mode: late-child
epicId: {{FTR-ID from --epic}}
childTitle: {{childTitle}}
childPurpose: {{childPurpose}}
Start the feature definition session.
Source reference (may be empty): {{user arguments verbatim}}
```

4. Text the skill must state (anchors the static tests will look for):
   - `late-child` mode runs no grilling round.
   - A missing epic (no folder named by the ID, or by the ID and a hyphen, that contains `epic.md`) creates nothing.
   - An epic whose registry status is not `epic` is refused and creates nothing. There is no standalone fallback.
   - If the child's `feature.md` already exists, the agent reports it and stops. Nothing is overwritten.
   - No path is hard-coded. The skill refers to `resolve-features-root` for the features root.

Do not duplicate the late-child proposal or decision handling here. That belongs to US-03-TASK-BE-05.

Estimated size: one new section of about 30–40 lines. Keep the rest of the file unchanged.

**Verification commands:**

```
npx jest tests/cli/define-feature-checkpoint-text.test.js
```

```
grep -n "late-child" src/claude/skills/define-feature/SKILL.md
```

```
grep -n "Do not add instructions telling it to skip discovery" src/claude/skills/define-feature/SKILL.md
```

```
npm test
```