<a id="task-US-01-TASK-BE-03"></a>
### US-01-TASK-BE-03

- **Task ID:** US-01-TASK-BE-03
- **Title:** Add Phase 3a skipped and not-flagged status handling to the agent
- **Outcome:** gaia-define-feature.md handles status skipped by reporting the marker (epic.md, Approvals or wbs) and stopping without writing or showing a proposal. It handles status not-flagged by continuing to Phase 4 as standalone with no proposal. In the not-flagged path it names each unevaluated signal to the user.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-02, AC-03, AC-04
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** handle skipped and not-flagged results in Phase 3a

**Implementation notes:**

Dependency state: `src/claude/agents/gaia-define-feature.md` currently has no Phase 3a. Its headings run Phase 3 (line 235), then `## Phase 4 — Write feature.md` (line 247). The Phase 3a block is created by US-01-TASK-BE-02. Start only after BE-02 has landed. If no `Phase 3a` heading exists, stop and report; do not create the block here.

Edit scope: add only the `skipped` and `not-flagged` branches inside the Phase 3a block that BE-02 creates, directly after the `check-definition` invocation. Leave the `flagged` branch to BE-04. Do not change Phase 4, Phase 3, or any other heading.

Conflict to surface: the Tech-Spec algorithm pseudocode says `"skipped" -> Phase 4 standalone (no proposal shown)`. The component description says "Skipped folders stop and report", and this task's outcome says skipped stops. This task follows the outcome and the component description. The host should confirm the conflict at Gate 1.

Detail gap: `check-definition` returns `status: "skipped"` with no marker name. The agent must name the marker itself with read-only probes, in this order: `epic.md`, then `{PREFIX}-Approvals.md`, then the `wbs/` directory. If none is found, report the skip without naming a marker.

Replacement text to add inside the Phase 3a block, after the `switch result.status:` line:

```text
"skipped":
    marker = first found of:
        test -f "{featureDir}/epic.md"           -> "epic.md"
        test -f "{featureDir}/{PREFIX}-Approvals.md" -> "Approvals"
        test -d "{featureDir}/wbs"               -> "wbs"
    STOP. Report: "{PREFIX} is not a new feature ({marker} present). The definition
    check was skipped. Nothing was written and no proposal was shown."
    Do not show a proposal. Do not enter Phase 4.

"not-flagged":
    For each name in result.unevaluated, report:
        "{name} could not be evaluated, so it did not count toward the split threshold."
    Report: "The feature is below the split threshold. Continuing as a standalone feature."
    Continue to Phase 4 standalone. Do not show a proposal.
```

Constraints: the agent writes nothing in either branch before Phase 4. Phase 4 standalone's own BR-04 guard and writes are owned by BE-06 and existing text, so do not duplicate them here. The record stays in memory and is never written.

Length: about 25 lines added. This is small and atomic.

**Verification commands:**

```
node -e "const t=require('fs').readFileSync('src/claude/agents/gaia-define-feature.md','utf8'); for (const s of ['\"skipped\"','\"not-flagged\"','unevaluated','epic.md','Approvals','wbs']) if(!t.includes(s)) { console.error('missing '+s); process.exit(1); }"
```

```
npm test
```