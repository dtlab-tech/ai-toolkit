# src/claude/agents/gaia-generate-work-breakdown.md — Modified

## Change

Step 1 ("Load and Cross-Reference") is rewritten: instead of mandating a full Read of both
`{PREFIX}-Requirements.md` and `{PREFIX}-Tech-Spec.md`, the agent Reads `req/index.md`+
`spec/index.md` first — both small, authoritative summary documents (Use Cases/Business
Rules/Acceptance Criteria tables; the Components table with Domain/Addresses/Spec routing) — and is
told to drill into specific `req/use-cases/{UC-ID}.md`/`spec/components/{file-slug}.md` files, via
its existing `Read, Glob, Grep` tools, only where the index's own summary tables are insufficient for
a given phase/task decision. This is the one agent in the pipeline that plausibly needs the broadest
cross-cutting context (it builds the entire phase/task graph in one call), so the change is
deliberately conservative: it narrows the *mandatory minimum* read, not the agent's own ability to
read as much as it judges necessary. A legacy feature (no `req/`/`spec/`) keeps the full-file-read
instruction unchanged — the agent is told to check for `req/index.md`'s existence first and fall back
to `{PREFIX}-Requirements.md` (same for Tech-Spec) if it's absent.

## Service Interface

```markdown
<!-- BEFORE -->
### Step 1 — Load and Cross-Reference

1. Read `{PREFIX}-Requirements.md` fully — extract all Use Cases (UC-XX), acceptance criteria
   (AC-XX), business rules (BR-XX), NFRs
2. Read `{PREFIX}-Tech-Spec.md` fully — extract architecture, file inventory, implementation
   order, data model, API endpoints, frontend components

<!-- AFTER -->
### Step 1 — Load and Cross-Reference

1. Check whether `req/index.md` exists (the split Requirements format, FTR-021). If it does:
   - Read `req/index.md` fully — it already contains the full Use Cases index table, all Business
     Rules, all Acceptance Criteria, and all NFRs (FTR-021 kept these feature-wide, not per-UC)
   - For any UC whose own full flow description you need beyond the index's short Title/Actor
     summary, Read `req/use-cases/{UC-ID}.md` directly
   If `req/index.md` does not exist (a legacy feature), Read `{PREFIX}-Requirements.md` fully instead
   — extract the same information from the monolithic file.
2. Check whether `spec/index.md` exists (the split Tech-Spec format, FTR-024). If it does:
   - Read `spec/index.md` fully — it already contains Architecture, Section 9's complete File
     Inventory/Components table (with Domain/Addresses routing), Implementation Order, and Risks
   - For any component whose own Backend/Frontend/design detail you need beyond the Components
     table's one-line Purpose/Addresses summary, Read `spec/components/{file-slug}.md` directly —
     the `Spec` column in Section 9's table gives you the exact path
   - If, after reading the index, you cannot determine from its own summary tables which per-item
     files are relevant to a given phase/task decision, fall back to reading every file under
     `spec/components/` rather than proceeding with incomplete context
   If `spec/index.md` does not exist (a legacy feature), Read `{PREFIX}-Tech-Spec.md` fully instead
   — extract the same information from the monolithic file.
```

Steps 2 onward (Derive User Stories from Use Cases, and everything after) are unchanged — they
already operate on the *extracted information*, not on which file it came from.

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): since
`gaia.agent.planner.work-breakdown`'s own dispatch call in `pm-phase2.js` is unchanged (still just
`featurePath` as the prompt — this component doesn't change the call site, only the agent's own
internal instructions), no new mock-dispatch assertion is needed for the call site itself; this
component's own correctness is covered by the agent's prompt-content review during Gate 1/Gate 2 of
FTR-026's own implementation, same convention used for every other agent-prompt-only change in this
toolkit's lineage (e.g. `gaia-validate-feature-docs.md`'s FTR-025 rewrite had no dedicated unit test
either, for the same reason: a prompt file's own wording isn't exercised by the mocked test suite,
only the shape of what's dispatched to it is).
