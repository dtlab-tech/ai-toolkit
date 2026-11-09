# src/claude/agents/gaia-generate-requirements.md — Modified

Domain: BE · Addresses: AC-43, AC-44, AC-45, AC-46

## Change

This change is confined to the read side of the registry, as feature.md Scope and Dependencies require. Three edits to the existing agent prompt. First, Process step 2 currently hard-codes `docs/features/REGISTRY.md`. It is replaced by the registry path the host supplies in the dispatch prompt, already resolved with `ai-toolkit resolve-features-root` (D-22). This agent's tools are `Read, Glob, Grep` and it has no Bash, so it cannot run the resolver itself. Second, a new section, "Registry Reader Rules", is inserted after "Input". It covers epic entries (`Status: epic`, D-19), child entries carrying `Parent:` and `Depends on:` (D-18), standalone entries with neither line, and entries with any other status. Third, relationships found through these rules are written into Section 8 (Dependencies & Assumptions). Explicitly unchanged: the Output Structure, the 4-column acceptance-criteria table, the Output Filename rule, the Clarification Protocol, the Guidelines, and the skeleton-plus-UC-index contract. The agent still never writes the registry and never follows `Detail` links.

Open gaps for the host to surface at Gate 1:
- The excerpt supplied does not include the text of AC-43 to AC-46. The rules above are derived from feature.md D-18, D-19, D-20 and Scope. Gate 1 must confirm that the ACs match.
- The registry path source is unresolved. The design assumes the host supplies the resolved path. The alternative is adding Bash to `tools`, which this design does not do.
- Requirements has no UC, AC or NFR for reader tolerance. This design specifies the behaviour, but Requirements still needs its own UC and AC.
- The Detail target of the epic entry is unspecified in Requirements. This agent does not use Detail, so it does not depend on that target.
- Unknown-status entries are skipped silently here. The Requirements UC-05 error flow for them still has no AC.
- The registry line format (`## FTR-NNN: Title` with `**Key:**` lines) is ASSUMED. It must be confirmed against the live `REGISTRY.md` before implementation.

## Registry Reader Rules

Replace Process step 2 with: "Read the registry at the path the host supplies in the dispatch prompt (resolved with `ai-toolkit resolve-features-root`). If no path is supplied or the file does not exist, skip this step silently."

Insert the following as a new section after "Input":

```markdown
## Registry Reader Rules

The registry path is supplied by the host, already resolved. Read it with the Read tool. This agent never writes the registry and never follows `Detail` links.

Each entry is a `## FTR-NNN: Title` heading followed by bold-key lines: `**Keywords:**`, `**Status:**`, `**Summary:**`, `**Detail:**`, and for children `**Parent:**` and `**Depends on:**`.

Apply these rules per entry:

1. **`Status: epic`**: the entry is the parent record of a split. Record it as a parent in Section 8. Confirm its epic record exists with Glob `<features-root>/<ID>-*/epic.md`. If none is found, note "epic FTR-NNN is registered but epic.md was not found" in Section 8 and continue. Do not read the children's feature.md files.
2. **`Parent:` present**: this is a child. Record the epic ID as a split relationship in Section 8. `Depends on:` lists sibling IDs; record each as a dependency. `Depends on: none` means no sibling dependency (the first child).
3. **Neither `Parent:` nor `Depends on:` present**: a standalone entry. Read it exactly as before (Keywords, Summary, Status drive the relevance scan). Record no split relationship. Entries written before these lines existed are read this way. Their absence is not an error.
4. **`Status` other than `defined`, `completed` or `epic`**: leave the entry untouched. It is not a relevance source, not an epic, and not reported as an error.
5. **Malformed `Parent:` or `Depends on:` value** (unknown ID, empty value): treat the line as absent and note the malformed value in Section 8 as an assumption. Never stop generation for it.
```

## Tests

Test file: `tests/frontmatter/registry-reader-tolerance.test.js` (TEST, already in the component index). It also covers the sibling `gaia-generate-tech-spec.md` reader rules.

Key cases:
- **Frontmatter unchanged:** `name`, `model: haiku` and `tools: Read, Glob, Grep` parse correctly. No Bash is added unless Gate 1 decides otherwise, in which case this assertion changes with it.
- **Section present:** the body contains the "Registry Reader Rules" heading and all five rules, keyed on `epic`, `Parent:`, `Depends on: none`, the standalone case, and other statuses.
- **Epic recognised:** the body names `epic.md` and the Glob pattern `<ID>-*/epic.md`, and states that children's feature.md files are not read.
- **Detail ignored:** the body states that `Detail` is never followed.
- **No hard-coded path (D-22):** the body contains neither `docs/features/REGISTRY.md` nor `internal_docs/features/`.
- **Output contract intact:** the Output Structure headings 1 to 9 and the 4-column AC header `| ID | Criterion | Related UC | Priority |` are unchanged versus the pre-change snapshot.
- **Fixture registry:** a fixture with one standalone entry, a child pair (`Depends on: none` for the first child, the sibling ID for the second), one epic and one `Status: archived` entry. The test's parser helper reads it into the expected classes: standalone, child, epic and skipped.

Automated tests check the prompt text and the fixture parsing only. Whether the model's Section 8 output follows the rules is checked by manual review of a generated skeleton against the fixture.