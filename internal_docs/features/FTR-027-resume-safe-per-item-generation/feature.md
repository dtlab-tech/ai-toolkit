# Resume-Safe Per-Item Generation

## Feature ID
FTR-027

## Summary
Hardens `pm-phase1.js`'s and `pm-phase2.js`'s existing resume-by-existence mechanism (FTR-021/
FTR-024/FTR-020) so a retry after a worker failure never gets permanently stuck replaying the same
broken output. Today, resume-by-existence checks only whether a per-item file (`req/use-cases/
{UC-ID}.md`, `spec/components/{fileSlug}.md`, `wbs/tasks/{TASK_ID}.md`) **exists on disk** —
never whether its content is actually well-formed. A file that was written successfully but is
structurally invalid (missing its required sections, echoing the wrong item, or otherwise
unusable by the deterministic parser that consumes it later) is treated as "already done" forever
— every subsequent retry skips regenerating it, so the same downstream failure (today, most often
`tech-spec-assembler.js`'s "component file is missing its ## Change section", itself only fixed
for one specific cause — a whole-response fence wrap — by a separate, already-shipped fix) repeats
identically on every retry, burning a full pipeline run's worth of LLM cost each time without ever
making progress past that one broken item.

## Problem Statement
A real production incident (`Fincantieri.CommonLibraries.MFExample`, FTR-003) hit exactly this:
Tech-Spec component generation for a ~56-component feature crashed partway through, due to a
headless-worker permission issue (separately fixed). Multiple retries each regenerated the
feature from a fresh pipeline invocation; per-item resume correctly skipped every component file
already present on disk — but one of those present files was itself malformed (its real content
had ended up inside an agent-added outer code fence, since fixed), so the SAME final-assembly
error recurred on every single retry, with no way for the pipeline to recover automatically: the
only way out was manually deleting the one broken file so resume-by-existence would regenerate it.

This is a real resilience gap, independent of what originally corrupts a given item (the
fence-wrap bug is fixed, but any other cause of a structurally-invalid-yet-successfully-written
item — a truncated response, a model that ignores its own template contract, a future regression
— would hit the exact same dead end). Resume-by-existence's only question today is "does this path
exist as a file", never "is this file actually valid for what it claims to be". This feature adds
that second question, reusing each item type's own already-established structural-validity
definition (no new parsing contracts invented), so a broken existing item is regenerated on the
very next retry instead of persisting indefinitely.

## Actors
N/A — internal/technical feature

## Core Flow (Happy Path)
This is an internal tooling change to three existing per-item generation loops; the execution path
is described below, per item type.

1. **Tech-Spec components (`pm-phase1.js`'s `generateTechSpec()`).** The per-component
   resume-by-existence check (`if (!regenSkeleton && c.exists(compPath)) continue`) gains a second
   condition: the existing file must also parse successfully via `tech-spec-assembler.js`'s own
   `parseComponentDetail()` (already the authoritative definition of "a valid component file" —
   requires a real `## Change` and `## Tests` heading, in that order). A file that exists but fails
   this parse is treated the same as a missing file: regenerated, not skipped. The outer regen gate
   (`anyComponentFileMissing`-style check, which already triggers a resume pass when a file is
   absent) gains the identical condition, so a broken file is noticed even on the very next pipeline
   entry, not only inside the per-component loop itself.
2. **Requirements use cases (`pm-phase1.js`'s `generateRequirements()`).** The per-use-case
   resume-by-existence check, and the Requirements outer regen gate's own symmetric pre-check
   (`anyUcFileMissing`, today presence-only, mirroring `anyComponentFileMissing`), both gain an
   analogous validity condition: the existing file's content must start with the expected
   `### {UC-ID}: ` heading for that row's own ID (the one invariant every real use-case file must
   satisfy, and the one failure mode most likely from a garbled or wrong-item response — a model
   echoing a different UC, or returning something that isn't a use-case file's flow content at
   all). This is intentionally a looser check than the component case: the use-case template's own
   body (Main flow/Postconditions) is deliberately free-form prose, not machine-parsed the way
   Change/Tests are, so there is no stricter existing contract to reuse without inventing one not
   already authoritative elsewhere.
3. **Work Breakdown tasks (`pm-phase2.js`'s per-task dispatch loop).** The resume-by-status check
   (`if (task.status === 'generated' && c.exists(detailPath)) continue`) gains a validity condition
   reusing `wbs-assembler.js`'s own `parseTaskDetailBlock()`: the existing file must parse to a
   non-empty `verificationCommands` array — the task template's own documented parsing contract
   already states this section "Must be non-empty". A task file that exists, is marked `generated`,
   but has no verification commands (e.g. a response that dropped the section entirely) is
   regenerated instead of silently accepted.
4. **None of this changes any item's own generation prompt, template, or parsing/assembly contract**
   — every validity check reuses a function (`parseComponentDetail`, `parseTaskDetailBlock`) or
   invariant (`### {UC-ID}: ` heading) that is already authoritative for that item type elsewhere in
   the pipeline. This feature only widens WHEN a regeneration is triggered, never WHAT gets
   generated or how it's validated once assembled.

## Out of Scope
- Any change to the skeleton-level freshness/completeness checks (`skeletonStale`,
  `missingSections`) — these already check structural completeness, not just mtime, since an
  earlier fix; this feature only extends the equivalent idea to per-item files.
- Any change to `tech-spec-assembler.js`'s `parseComponentDetail`, `wbs-assembler.js`'s
  `parseTaskDetailBlock`, or `req-assembler.js`'s own loading logic — all reused unmodified, as the
  authoritative definition of "valid" for their respective item type.
- A general checkpoint/ownership-token redesign mirroring FTR-018's task-executor (raised
  separately as a larger, distinct idea) — this feature only hardens the EXISTING resume-by-
  existence/resume-by-status mechanisms already present in `pm-phase1.js`/`pm-phase2.js`, not a new
  persistence architecture.
- Any change to how a worker failure itself is reported, retried, or rate-limited — unchanged.
- Validating anything about a file's semantic quality (does the Change description actually make
  sense) — only structural well-formedness, the same boundary every existing parser already draws.

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| A component file exists, parses successfully, skeleton still fresh | Resume-by-existence skips it, unchanged from today |
| A component file exists but is missing its `## Change`/`## Tests` section (e.g. a fence-wrap, a truncated response) | Treated as missing: regenerated on the next run, not silently accepted forever |
| A component file is missing entirely | Regenerated, unchanged from today (already covered) |
| A use-case file exists and starts with the correct `### {UC-ID}: ` heading | Resume-by-existence skips it, unchanged from today |
| A use-case file exists but starts with a different UC's heading, or no recognizable heading at all | Treated as missing: regenerated |
| A task file exists, status is `generated`, and has at least one verification command | Resume-by-status skips it, unchanged from today |
| A task file exists, status is `generated`, but has zero verification commands | Treated as not generated: regenerated |
| `--force` is passed | Unchanged: bypasses resume entirely for every item type, exactly as today |
| A needsRequirementsFix/needsTechSpecFix revision cycle | Unchanged: already forces full regeneration, never a resume, for both requirements and tech-spec |

## Data Model
N/A — internal/technical feature. No new on-disk artifact or schema change; this feature only
changes the CONDITION under which an existing per-item file is treated as already-valid.

## Roles and Permissions
N/A — internal/technical feature

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | A spec/components/{fileSlug}.md file exists but fails `parseComponentDetail()` | `pm-phase1`'s Tech-Spec generation runs (resume path) | The component is regenerated, not skipped | Must |
| AC-02 | A spec/components/{fileSlug}.md file exists and parses successfully | `pm-phase1`'s Tech-Spec generation runs (resume path) | The component is skipped, unchanged from today | Must |
| AC-03 | A spec/components/{fileSlug}.md file is invalid | `pm-phase1` is entered fresh (not mid-loop) | The outer regen gate notices the invalid file and triggers a resume pass for it, the same way it already does for a missing file | Must |
| AC-04 | A req/use-cases/{UC-ID}.md file exists but does not start with that row's own `### {UC-ID}: ` heading | `pm-phase1`'s Requirements generation runs (resume path) | The use case is regenerated, not skipped | Must |
| AC-05 | A req/use-cases/{UC-ID}.md file exists and starts with the correct heading | `pm-phase1`'s Requirements generation runs (resume path) | The use case is skipped, unchanged from today | Must |
| AC-06 | A wbs/tasks/{TASK_ID}.md file exists, status is `generated`, but `parseTaskDetailBlock()` finds zero verification commands | `pm-phase2`'s per-task generation runs | The task is regenerated, not skipped | Must |
| AC-07 | A wbs/tasks/{TASK_ID}.md file exists, status is `generated`, and has at least one verification command | `pm-phase2`'s per-task generation runs | The task is skipped, unchanged from today | Must |
| AC-08 | `--force` is passed, or a needsRequirementsFix/needsTechSpecFix revision cycle is active | Any of the above generation loops run | Every item is regenerated unconditionally, exactly as today — this feature changes nothing about those paths | Must |
| AC-09 | All changes are delivered | `npm test` runs | All tests pass: new regression tests for AC-01 through AC-07, and a full-suite regression | Must |

## MVP vs Deferred

### MVP (must ship)
- `pm-phase1.js`: per-component resume-by-existence and outer regen-gate validity check, reusing
  `parseComponentDetail()`.
- `pm-phase1.js`: per-use-case resume-by-existence validity check (`### {UC-ID}: ` heading match).
- `pm-phase2.js`: per-task resume-by-status validity check, reusing `parseTaskDetailBlock()`'s
  `verificationCommands`.
- Automated tests per AC-09.

### Deferred (next iteration)
- A general checkpoint/ownership-token system mirroring FTR-018 (raised separately, a materially
  larger scope than hardening the existing per-item resume mechanism).
- Any stricter, newly-invented structural contract for use-case files beyond the heading-match
  invariant — would require deciding a new parsing contract for a document type that is
  deliberately free-form today, out of scope for a resume-hardening fix.

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Should the outer regen gate's existing `anyComponentFileMissing`/`anyUcFileMissing`-style checks be renamed to reflect that they now also check validity, not just presence? | **Open — resolve in Tech-Spec** | Naming-only question; no behavior at stake |
| 2 | Exact wording/scope of the use-case heading-match check — exact-match only, or tolerant of a trailing title variation? | **Open — resolve in Tech-Spec** | Lean toward requiring only the `### {UC-ID}: ` prefix (the ID, not the title) to match, since the title itself is free-text the agent may legitimately phrase differently across a retry |

## Dependencies and Assumptions
- FTR-020/FTR-021/FTR-024/FTR-025/FTR-026 (available): the split-generation architecture and its
  existing resume-by-existence/resume-by-status mechanisms, reused and extended, never replaced.
- `tech-spec-assembler.js`'s `parseComponentDetail` and `wbs-assembler.js`'s `parseTaskDetailBlock`
  are treated as fixed, authoritative validity definitions for their respective item types.
- `npm test` is the only verification command; no separate build step exists.
- Directly motivated by a real, reproduced production incident (`Fincantieri.CommonLibraries.MFExample`,
  FTR-003) — not a hypothetical resilience improvement.
