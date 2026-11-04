# src/claude/agents/gaia-generate-tech-spec.md — Modified

## Change

This change is read-side only. It adds one subsection, "Registry reader rules", inside Process step 3 of `src/claude/agents/gaia-generate-tech-spec.md`, directly before step 4 (Explore). The rules tell the generator how to read the registry lines that FTR-035 introduces (D-18, D-19, D-20): the `Parent:` and `Depends on:` lines on child entries, and the `epic` status on the parent's entry. The generator now recognises a feature folder that contains `epic.md` as a parent record (BR-05), and it never produces a Tech-Spec skeleton from that record. Entries without `Parent:` or `Depends on:` are read as standalone, with no change in behaviour. Entries with any other status are left untouched and are not treated as epics or dependencies. The `Detail` line is ignored. Nothing else in the file changes: frontmatter and tools, Step 0, the Output Structure template, the Section 9 column contract (`Addresses` stays 3rd, `Domain` and `Spec` stay trailing), the Clarification Protocol and the Guidelines are unchanged. The generator still writes nothing to the registry.

Open gaps for the host:
1. The texts of AC-43 to AC-46 are not in the excerpt I was given. The rules above come from feature.md Scope (reader tolerance bullet) and D-18 to D-20. Wording must be checked against those ACs before Gate 1.
2. feature.md does not say what the generator does when it is handed an epic folder, since the epic has no `feature.md` and the input is a `feature.md` path. This design routes that case through the existing Clarification Protocol and does not generate a skeleton. This is a design choice, not something feature.md decides.
3. Process step 3 still names `docs/features/REGISTRY.md` literally. The registry location is unresolved (Requirements Section 9 Q1), so this file is not changed here. D-22 covers scripts only, not agents.

## Algorithm

The new subsection to insert after Process step 3:

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

## Tests

- **File:** `tests/frontmatter/registry-reader-tolerance.test.js`. This is the existing suite named in the component index. It is the only test file for this component. Because no runtime reader exists in the index, its assertions run on the agent prompt text (static checks). Fixture registry snippets are classified by the rules the prompt states.
- **Key cases:**
  - The fixture epic entry (`Status: epic`, no `Parent:`) is classified as a parent record. Its children are not added as components.
  - A child entry with `Parent: FTR-035` and `Depends on: FTR-036` yields parent FTR-035 and sibling dependency FTR-036.
  - The first child with `Depends on: none` yields no sibling dependency.
  - An entry with neither line is standalone, and the output matches the pre-change behaviour (regression case).
  - An entry with an unknown status such as `draft` is left untouched and is not treated as an epic.
  - A `Detail:` link line is not parsed as a dependency or a parent.
  - A folder containing `epic.md` is classified as a parent record, and the prompt text forbids generating a skeleton from it.
  - The Section 9 column order text (`Addresses` 3rd, `Domain` and `Spec` trailing) is unchanged. This is checked by the existing contract tests, which must run unchanged.