# src/claude/agents/gaia-validate-feature-docs.md — Modified

## Change

Four targeted edits to the existing agent file — no phase renumbering, no change to its overall
7-phase shape:

1. **Phase 1, step 3** reworded: the inlined Tech-Spec text is now explicitly the SKELETON only
   (Section 9's component index table plus every feature-wide section) — the agent is told this
   directly, so it does not expect or go looking for per-component Change/Algorithm/Schema/Tests
   prose that is no longer part of its input.
2. **Phase 3's Tech-Spec coverage-check table** reworded to describe checks answerable from the
   skeleton's own columns (Purpose, Addresses [AC-IDs], Domain, File Inventory), and to introduce
   the `needsComponentDetail` escape hatch for the remaining class of claims that genuinely need a
   component's own design body. The free-prose "Every Use Case ID from Requirements → referenced in
   Implementation Order" row is removed (superseded by the host's own deterministic AC↔component
   check — UC-02 — which is exact-ID-based, not prose-parsing).
3. **Schema (Phase 7)** gains `needsComponentDetail`: an array of `{ claim, fileSlug }` objects.
4. **New guidance** on exactly when to use `needsComponentDetail` versus a normal `findings` entry,
   so the agent does not conflate "I can't tell without the component's body" (drill-down case)
   with "this isn't covered anywhere I can see" (a normal, immediate finding).

## Algorithm

**Edit 1 — Phase 1, step 3** (replaces the current step 3 at `gaia-validate-feature-docs.md:18-23`):

```markdown
3. The Requirements and Tech-Spec document text is included directly below, inlined into this
   prompt under `Requirements:` and `Tech-Spec:` labels. The Requirements text is the FULL document
   (every Use Case's own flow detail included). The Tech-Spec text is its SKELETON ONLY — Section
   9's own component index table (Purpose, Addresses, Domain, Spec-link columns, one row per
   component) plus every feature-wide section (Overview, Architecture, Security, Database,
   Configuration, Implementation Order, Risks). It deliberately does NOT include any component's
   own Change/Algorithm/Schema/Tests design prose — that per-component detail is validated
   separately, on request, via `needsComponentDetail` (Phase 3). Do NOT attempt to locate or Read
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` or any `spec/components/*` file on disk;
   use the inlined skeleton as the complete Tech-Spec-level input for this pass.
```

**Edit 2 — Phase 3's Tech-Spec coverage-check table** (replaces the table at
`gaia-validate-feature-docs.md:65-72`):

```markdown
### Tech-Spec coverage (against the inlined Tech-Spec SKELETON — Section 9's component table and
feature-wide sections only; no per-component design body is available in this pass)

| Check | Pass condition |
|-------|---------------|
| Every new/modified file in feature.md → listed in File Inventory | Row present with matching Purpose/Domain |
| Every external integration → documented in External Integrations (Section 5's own feature-wide prose, if any) | Mentioned explicitly |
| A claim needs exact technical detail not visible in Purpose/Addresses/Domain (e.g. an endpoint's precise method/path/response shape, a schema field, an error code) | Do NOT guess and do NOT mark it a gap outright. Emit a `needsComponentDetail` entry instead (see below) — never silently drop the check |

AC↔component traceability (every Use Case/AC referenced by the right component, and vice versa) is
NOT this agent's responsibility — it is checked deterministically, by exact ID, by the host after
this call returns. Do not attempt it here; a prose-based traceability finding in this pass would
only duplicate or conflict with that exact-ID check.

**When to use `needsComponentDetail` vs a normal finding:** if feature.md describes something a
component row's Purpose plausibly relates to, but you cannot confirm the EXACT technical detail
without reading that component's own design body, emit a `needsComponentDetail` entry naming that
row's own Spec-link `fileSlug` and the specific claim — do not guess, and do not silently treat it
as either covered or missing. If NO component row is even plausibly related to the claim at all,
that is a normal missing-coverage finding, not a drill-down case.
```

**Edit 3 — Schema/Phase 7** (extends the object at `gaia-validate-feature-docs.md:154-168`):

```json
{
  "valid": true,
  "findings": [],
  "needsRequirementsFix": false,
  "needsTechSpecFix": false,
  "report": "# Validation Report — FTR-001\n\n## Summary\n...",
  "needsComponentDetail": []
}
```

Phase 7's own bullet list gains:

```markdown
- `needsComponentDetail` is an array of `{ claim, fileSlug }` objects — one per claim you could not
  confirm from the Tech-Spec skeleton alone, naming the specific component (by its Spec-link
  `fileSlug`) whose Purpose/Domain plausibly covers it. Empty when every claim was resolvable from
  the skeleton (the common case for small/medium features). An entry here is NOT the same as a
  `findings` entry — do not also add a `findings` string for the same claim; the host resolves
  `needsComponentDetail` entries separately and may add its own finding if the drill-down fails.
```

No other phase (2, 4, 5, 6) changes — claim decomposition, the gap report, findings-to-host
handoff, and report composition are all unaffected by this feature.

## Tests

`tests/frontmatter/agents.test.js` continues to structurally validate this file's frontmatter
unmodified (name/description/tools unchanged). `tests/integration/workflow-runtime.test.js`'s new
tests (see that file's own component) exercise the real, reworded contract end-to-end: a fixture
Tech-Spec skeleton with no per-component body text is fed through the real `pm-phase1.js` dispatch
path, confirming the host no longer calls `assembleTechSpec()`'s full output for this one prompt.
