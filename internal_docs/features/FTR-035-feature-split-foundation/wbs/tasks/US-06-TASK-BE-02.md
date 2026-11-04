<a id="task-US-06-TASK-BE-02"></a>
### US-06-TASK-BE-02

- **Task ID:** US-06-TASK-BE-02
- **Title:** Add registry reader rules to tech-spec generator agent
- **Outcome:** src/claude/agents/gaia-generate-tech-spec.md has a registry reader rules subsection 3a inside Process step 3, before step 4. It covers standalone entries, Status epic as a parent record, a folder holding epic.md as a parent record with no skeleton generated, Depends on: none, skipping entries with any other status, and ignoring the Detail line. The output structure and the Section 9 column contract are unchanged.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-43, AC-44, AC-45, AC-46
- **Estimate — agent minutes:** 8
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add registry reader rules to tech-spec generator agent

**Implementation notes:**

This is a read-side-only, prompt-text change to one file: `src/claude/agents/gaia-generate-tech-spec.md`. Nothing else in the file changes.

Current state (verified by reading the file): Process step 3 is at line 54 (`3. **Read** `docs/features/REGISTRY.md` if it exists ...`). Line 55 is `4. **Explore** the existing codebase areas affected ...`. Line 56 is a second `4. **Design** ...` item. That duplicated `4.` is pre-existing. Do not renumber it, because that would change the file beyond this task's scope.

Change: insert the following block after line 54 and before line 55 (`4. **Explore**`). Leave every other line as it is.

```markdown
3a. **Apply the registry reader rules** to each entry of `REGISTRY.md` you read in step 3:
    - `Status: epic` → the entry is a **parent record**. Use its Summary as context only.
      Never generate a Tech-Spec skeleton for an epic, and never list its children as
      components of this feature.
    - Entry has `Parent: FTR-NNN` → it is a **child** of that epic. Record the parent ID.
    - Entry has `Depends on:` → record the sibling IDs. The value `none` means no sibling dependency.
    - Entry lacks both `Parent:` and `Depends on:` → **standalone**. Behave exactly as before this change.
    - Any other `Status` value → leave the entry untouched. It is not an epic, not a parent, and not a dependency.
    - The `Detail:` line → ignored. It is never parsed as a dependency or a parent.
    - Feature folder contains `epic.md` → it is a **parent record** (BR-05). Do not run this
      pipeline for it. Report that through the Clarification Protocol.
    Use recorded parent and sibling IDs only in Section 5 (External Integrations) or Section 12
    (Risks & Mitigations), as already described in step 3 for shared dependencies.
```

Do not change the step 3 text that names `docs/features/REGISTRY.md` literally. The registry location is still unresolved (Requirements Section 9 Q1), and D-22 covers scripts only.

Do not change frontmatter, Step 0, the Output Structure template, the Section 9 column order (`Addresses` 3rd, `Domain` and `Spec` trailing), the Clarification Protocol, or the Guidelines. The generator still writes nothing to the registry.

Caveat for the implementer: the full text of AC-43 to AC-46 was not in the excerpt. The rules above come from the design (feature.md Scope reader-tolerance bullet and D-18 to D-20). Check the wording against those ACs before the Gate 1 review. If they differ, adjust only the wording of the inserted block, not its position.

Scope check: this is one insertion of about 14 lines. It is well within the atomic band, and the estimate covers one read, one edit and the verification commands.

**Verification commands:**

```
node -e "const t=require('fs').readFileSync('src/claude/agents/gaia-generate-tech-spec.md','utf8');const s3=t.indexOf('\n3. **Read** \`docs/features/REGISTRY.md\`');const a=t.indexOf('3a. **Apply the registry reader rules**');const s4=t.indexOf('\n4. **Explore**');if(!(s3>0&&a>s3&&s4>a)){console.error('3a is not between step 3 and step 4');process.exit(1)}console.log('3a placement ok')"
```

```
grep -c "epic.md" src/claude/agents/gaia-generate-tech-spec.md
```

```
git diff -U0 -- src/claude/agents/gaia-generate-tech-spec.md | grep -E "^-[^-]" ; test $? -eq 1
```

```
npm test
```