<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Defer folder creation and ledger open from Phase 1d to write mode
- **Outcome:** gaia-define-feature.md no longer creates the feature folder or opens the ledger entry before grilling ends. Both actions are stated to happen only in mode write, after the user decision, so the checkpoint writes nothing to disk before confirmation.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-08
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** defer feature folder and ledger open to write mode

**Implementation notes:**

**Scope and a gap in the input.** This task edits one file: `src/claude/agents/gaia-define-feature.md`. The Tech-Spec excerpt says Phase 1d currently creates the feature folder (`mkdir`) and opens the ledger entry, but the excerpt does not contain the current text of Phase 1d. I have not read the agent file, so the exact line ranges and the current wording are unknown. Do not write the change from this note alone. Open the file, locate Phase 1d, and apply the edits below to the real text. If Phase 1d does not contain a `mkdir` or a ledger open, stop and report, because the skeleton and the file disagree.

**What must change (conceptual before/after):**

Before (expected shape of Phase 1d, to be confirmed in the file):

```text
Phase 1d — feature setup
  1. mkdir -p "{featureDir}"
  2. open ledger entry for {PREFIX}
  3. ... grilling begins
```

After:

```text
Phase 1d — feature setup
  1. Resolve {featureDir} as a path only. Do not create it.
  2. Do not open the ledger entry here.
  3. The grilling record is held in memory only (no file is written during grilling).
  ... grilling continues
  Folder creation and the ledger open are performed in mode write only,
  after the user decision (see Phase 4). Nothing is created before then.
```

**Write-mode wording to add (in Phase 4, or in the write-mode section once it exists):**

```text
Mode write (runs only after the user decision: standalone, or accept of a split proposal):
  1. mkdir -p "{featureDir}"
  2. open the ledger entry for {PREFIX}
  3. continue with the existing Phase 4 writes (feature.md, register or apply)
```

The `mode write` section and its split and standalone branches are introduced by other tasks in this feature (Phase 3a and Phase 4 branches). This task only has to make sure the folder creation and ledger open are moved to, and stated as belonging to, mode write. Do not add Phase 3a text here. Do not change Phases 0, 1a–1c, 2, 3, 4b or the Guidelines.

**Constraints to respect while editing:**
- Keep the `featuresRoot` capture in Phase 1a unchanged. Do not add any hard-coded `docs/features` path.
- Do not remove the ledger close in Phase 4b.
- Use wording that a later static test can match: the words `mode write`, `mkdir`, and the ledger open must appear in the write section. A test for "nothing created before confirmation" will look for text such as "before the user confirms" or "nothing is created".

**Verification commands:**

```
npm test
```

```
grep -n "mkdir" src/claude/agents/gaia-define-feature.md
```

```
grep -n -i "mode write" src/claude/agents/gaia-define-feature.md
```