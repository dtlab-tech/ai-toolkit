# src/claude/agents/gaia-validate-feature-docs.md — Modified

## Change

Phase 1 ("Load Documents") is rewritten for the new inlined-prompt contract: the agent is told the
Requirements/Tech-Spec text is supplied directly in its prompt (not files on disk it must locate
and read itself), and explicitly instructed not to attempt to find
`{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` on disk — they are not guaranteed to exist (both
documents are generated and stored in a split, per-item format by default). The failure-mode
wording in Phase 1 step 3 changes from "If an input document is missing" to "If either inlined
document's text is empty or missing" (same fail-closed outcome: `valid: false`, skip checks
requiring it). The `tools: Read, Glob, Grep` grant is unchanged — still usable for `feature.md`
and any other codebase exploration the agent needs; only the Requirements/Tech-Spec reading
mechanism changes.

## Service Interface

```markdown
<!-- BEFORE -->
\## Phase 1 — Load Documents

1. Extract the prefix from the folder name (`FTR-001-user-management` → `FTR-001`)
2. Read all three documents fully:
   - `feature.md` — source of truth
   - `{PREFIX}-Requirements.md`
   - `{PREFIX}-Tech-Spec.md`
3. If an input document is missing, record a finding identifying it, skip checks that require it,
   and complete Phases 6 and 7 with `valid: false`. Never claim full coverage when an input could
   not be read.

<!-- AFTER -->
\## Phase 1 — Load Documents

1. Extract the prefix from the folder name (`FTR-001-user-management` → `FTR-001`)
2. Read `feature.md` fully — its path is given to you first; use your Read tool.
3. The Requirements and Tech-Spec document text is included directly below, inlined into this
   prompt under `Requirements:` and `Tech-Spec:` labels — do NOT attempt to locate or Read
   `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md` on disk; they are not guaranteed to exist
   (both documents are generated and stored in a split, per-item format by default — `req/`,
   `spec/` — and only assembled into a single file when a user explicitly requests it). Use the
   inlined text as the complete, authoritative content of each document for this validation pass.
4. If either inlined document's text is empty or missing, record a finding identifying it, skip
   checks that require it, and complete Phases 6 and 7 with `valid: false`. Never claim full
   coverage when an input could not be read.
```

Phase 3's subsection headings ("### Requirements coverage (against `{PREFIX}-Requirements.md`)" /
"### Tech-Spec coverage (against `{PREFIX}-Tech-Spec.md`)") are softened to "against the inlined
Requirements text" / "against the inlined Tech-Spec text" — labels only, no behavior change. Phase
6's persisted report template keeps its existing `{PREFIX}-Requirements.md`/`{PREFIX}-Tech-Spec.md`
row labels unchanged (purely a document-naming convention inside the always-real, always-written
`{PREFIX}-Validation-Report.md`, unaffected by this feature).

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): the mock dispatch for
`gaia-validate-feature-docs` asserts the received `options.prompt` contains `Requirements:` and
`Tech-Spec:` labeled sections with the expected inlined content, instead of assuming the agent
reads files from disk; no test depends on a monolithic Requirements/Tech-Spec file existing on
disk at the point this worker is dispatched.
