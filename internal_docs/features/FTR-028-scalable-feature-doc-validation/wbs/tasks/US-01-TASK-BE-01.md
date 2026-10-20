<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Swap the validator's Tech-Spec input from the fully assembled document to the skeleton
- **Outcome:** pm-phase1.js's validation-cycle prompt uses c.read(specIndexPath) instead of assembledTechSpec for the Tech-Spec label; gaia-validate-feature-docs.md's Phase 1 step 3 is reworded to describe the skeleton-only contract
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01
- **Estimate — agent minutes:** 16
- **Estimate — tokens:** 20000
- **Output count:** 2
- **Grouping rationale:** The prompt-construction change and its agent-contract wording are the same conceptual edit (what Tech-Spec text this call receives) split across two files that must agree — grouped in one task so they land atomically.
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** bound the feature-doc validator's Tech-Spec input to the skeleton, not the fully assembled document

**Implementation notes:**

In `src/claude/workflows/pm-phase1.js`, inside the validation cycle's `c.worker(valId, ...)` call
(currently `pm-phase1.js:449`), change only the Tech-Spec half of the prompt string:

```js
// before:
`${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\n` +
// after:
`${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${c.read(specIndexPath)}\n\n` +
```

Do NOT touch `assembledTechSpec`'s own computation (`let assembledTechSpec = assembleTechSpec()`,
line 439, and its reassignment after a `needsTechSpecFix` cycle, line 467) — it is still required,
unchanged, for `docsDigest` (line 475). This task only changes what text is handed to THIS one
worker call.

In `src/claude/agents/gaia-validate-feature-docs.md`, replace Phase 1 step 3 (lines 18-23) with:

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

No other phase of `gaia-validate-feature-docs.md` changes in this task (Phase 3's table and the
schema's `needsComponentDetail` field are US-03-TASK-BE-01's responsibility).

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```
