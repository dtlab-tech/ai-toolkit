<a id="task-US-06-TASK-BE-01"></a>
### US-06-TASK-BE-01

- **Task ID:** US-06-TASK-BE-01
- **Title:** Add registry reader rules to requirements generator agent
- **Outcome:** src/claude/agents/gaia-generate-requirements.md has a Registry Reader Rules section, and Process step 2 reads the registry from the host-supplied path. The rules cover standalone entries with no Parent: or Depends on:, Status epic as a parent record, epic.md recognition with no epic requirements generated, Depends on: none, and skipping entries with any other status. The Detail line is ignored and the output structure is unchanged.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-43, AC-44, AC-45, AC-46
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add registry reader rules to requirements generator agent

**Implementation notes:**

This is a prompt-only edit to one existing file, `src/claude/agents/gaia-generate-requirements.md`. Make two edits and leave everything else as it is. Read-side only: the agent never writes the registry and never follows `Detail` links. The Output Structure, the 4-column AC table, the Output Filename rule, the Clarification Protocol, the Guidelines and the skeleton-plus-UC-index contract are not changed. The agent's frontmatter (`model: haiku`, `tools: Read, Glob, Grep`) is not changed either. Do not add Bash.

Open items to resolve before or at Gate 1. They do not block the edit, but the text must not be finalised until they are checked:

- **AC text not supplied.** The excerpt gives only the AC IDs (AC-43 to AC-46). The rules below are derived from feature.md D-18, D-19, D-20 and Scope. Confirm the ACs match.
- **Registry line format is ASSUMED and conflicts with a sibling task.** This task assumes `## FTR-NNN: Title` (colon). INFRA-TASK-BE-04 specifies `## FTR-NNN — Title` (em dash). Check the live `REGISTRY.md` and use whichever it actually uses. The rule text below says "`## FTR-NNN: Title`" and must be corrected if the live file differs.
- **Features root.** The host supplies the registry path. The features root used by the Glob in rule 1 is taken as the registry file's parent directory.
- **Current step 2 wording is not in the excerpt.** Locate it with `grep -n "REGISTRY.md" src/claude/agents/gaia-generate-requirements.md` and replace the whole step.

**Edit 1: Process step 2.** Replace the hard-coded `docs/features/REGISTRY.md` reference with:

```
2. Read the registry at the path the host supplies in the dispatch prompt (resolved with `ai-toolkit resolve-features-root`). If no path is supplied or the file does not exist, skip this step silently.
```

**Edit 2: insert a new section directly after the "Input" section and before the next `##` heading:**

```markdown
## Registry Reader Rules

The registry path is supplied by the host, already resolved. Read it with the Read tool. This agent never writes the registry and never follows `Detail` links.

Each entry is a `## FTR-NNN: Title` heading followed by bold-key lines: `**Keywords:**`, `**Status:**`, `**Summary:**`, `**Detail:**`, and for children `**Parent:**` and `**Depends on:**`.

Apply these rules per entry:

1. **`Status: epic`**: the entry is the parent record of a split. Record it as a parent in Section 8. Confirm its epic record exists with Glob `<features-root>/<ID>-*/epic.md`. If none is found, note "epic FTR-NNN is registered but epic.md was not found" in Section 8 and continue. Do not generate requirements for the epic. Do not read the children's feature.md files.
2. **`Parent:` present**: this is a child. Record the epic ID as a split relationship in Section 8. `Depends on:` lists sibling IDs; record each as a dependency. `Depends on: none` means no sibling dependency (the first child).
3. **Neither `Parent:` nor `Depends on:` present**: a standalone entry. Read it exactly as before (Keywords, Summary, Status drive the relevance scan). Record no split relationship. Entries written before these lines existed are read this way. Their absence is not an error.
4. **`Status` other than `defined`, `completed` or `epic`**: leave the entry untouched. It is not a relevance source, not an epic, and not reported as an error.
5. **Malformed `Parent:` or `Depends on:` value** (unknown ID, empty value): treat the line as absent and note the malformed value in Section 8 as an assumption. Never stop generation for it.

The `**Detail:**` line is ignored by this agent in all cases.
```

Relationships from rules 1 and 2 are written into Section 8 (Dependencies & Assumptions). Nothing else in the output changes.

**Verification steps:** the commands below check the presence of the section and the removal of the hard-coded path, and confirm the AC table header is unchanged. They are structural checks only. Whether the model's output follows the rules is a manual review step.

**Verification commands:**

```
grep -n "## Registry Reader Rules" src/claude/agents/gaia-generate-requirements.md
```

```
! grep -q "docs/features/REGISTRY.md" src/claude/agents/gaia-generate-requirements.md
```

```
! grep -q "internal_docs/features/" src/claude/agents/gaia-generate-requirements.md
```

```
grep -q "Depends on: none" src/claude/agents/gaia-generate-requirements.md && grep -q "epic.md" src/claude/agents/gaia-generate-requirements.md
```

```
grep -q "| ID | Criterion | Related UC | Priority |" src/claude/agents/gaia-generate-requirements.md
```

```
npm test
```