<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Add standalone write branch with no-overwrite guard and register to the agent
- **Outcome:** gaia-define-feature.md Phase 4 has a standalone branch. It first checks that feature.md is absent and stops without writing if it exists. It then shows the Summary (first sentence) and derived Keywords for user confirmation or edit, writes feature.md, and runs register.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, US-01-TASK-BE-03
- **Acceptance criteria:** AC-09
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add standalone write and register branch to define-feature agent

**Implementation notes:**

File to modify: `src/claude/agents/gaia-define-feature.md`. Only the Phase 4 section changes. The existing `feature.md` template and writing rules stay as they are. The Phase 3a work from US-01-TASK-BE-02 to BE-04 is assumed to already exist in the file. I did not read the file, and the Tech-Spec excerpt gives no current line ranges, so locate Phase 4 by its heading, not by line number.

Add a sub-section titled `#### Phase 4 — standalone branch` inside Phase 4. Place it before any split-branch text, and keep the existing template text untouched. This branch is reached from two paths: `not-flagged` (from Phase 3a) and `reject` (from the checkpoint re-invocation, handled by US-02-TASK-BE-02). `skipped` stops in Phase 3a and never reaches here.

Required order inside the branch. The BR-04 guard comes first. Confirmation comes before the write. The write comes before `register`.

```text
#### Phase 4 — standalone branch

1. BR-04 guard:
     if test -e "{featureDir}/feature.md" succeeds
       -> STOP. Report: "{featureDir}/feature.md already exists; refusing to overwrite (BR-04)."
          Write nothing. Do not call register.
2. Derive:
     Summary  = first sentence of the Summary section drafted for feature.md (D-08)
     Keywords = derived from the feature title and main terms, comma-separated (D-08)
3. AskUserQuestion: show Summary and Keywords.
     User confirms, or edits either value. Edited values replace the derived ones.
     No file is written before this answer.
4. Write {featureDir}/feature.md using the existing template (unchanged).
5. run-asset scripts/feature-split.js --project "<projectRoot>" -- register \
       --features-root "$featuresRoot" --feature-id "$PREFIX" \
       --summary "<summary>" --keywords "<k1,k2,...>" --status defined
     On non-zero exit: report the error and stop. Do not invent cleanup.
6. Continue to Phase 5 (standalone summary).
```

Open gaps, not settled by the excerpt. Keep these as written and confirm them against FTR-035 D-25 before finalising:
- The `register` flag names and the `defined` status for standalone registration are assumed from the Tech-Spec pseudocode.
- The format of the `--keywords` value (comma-separated, no spaces) is assumed.
- Behaviour after a `register` failure is not specified. This task only reports and stops. It does not delete the written `feature.md`.

No duplicate implementation. US-01-TASK-BE-03 only routes `not-flagged` to "Phase 4 standalone" and writes no branch. US-02-TASK-BE-02 only routes `reject` to this branch. This task is the first to define the write and register steps.

Verification is static, because the agent is a prompt file. The check confirms that the BR-04 guard text appears before the write, and that the `register` call appears after the write.

**Verification commands:**

```
npm test
```

```
node -e "const t=require('fs').readFileSync('src/claude/agents/gaia-define-feature.md','utf8');const g=t.indexOf('test -e \"{featureDir}/feature.md\"');const w=t.indexOf('Write {featureDir}/feature.md',g);const r=t.indexOf('-- register',w);if(g<0||w<0||r<0)process.exit(1)"
```