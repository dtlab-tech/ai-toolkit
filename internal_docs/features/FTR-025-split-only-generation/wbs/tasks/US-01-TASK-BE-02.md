<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Compute in-memory assembly for the Gate 1 validator prompt and docsDigest
- **Outcome:** pm-phase1.js gains assembleRequirements()/assembleTechSpec() helpers (same req-assembler.js/tech-spec-assembler.js subprocess calls, never written to disk); the Gate 1 validator's prompt is built as featurePath + inlined 'Requirements:'/'Tech-Spec:' labeled text instead of just featurePath; docsDigest = c.hash(assembledRequirements + NUL + assembledTechSpec); both are recomputed after any needsRequirementsFix/needsTechSpecFix revision cycle
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 32000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** compute Requirements/Tech-Spec assembly in-memory for Gate 1 validation and docsDigest

**Implementation notes:**

Add two small helpers near the top-level orchestration:
```js
function assembleRequirements() {
  return c.command(['run-asset', 'scripts/req-assembler.js', '--project', c.root, '--', reqDir]).stdout
}
function assembleTechSpec() {
  return c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root, '--', specDir]).stdout
}
```
Call both unconditionally right before the validation loop starts (cheap, deterministic, no LLM
cost — safe to run every time, even when nothing regenerated). Replace the validator's prompt
(currently `featurePath + '\nValidate...'`) with
`` `${featurePath}\n\nRequirements:\n${assembledRequirements}\n\nTech-Spec:\n${assembledTechSpec}\n\nValidate...` ``
— same ordering/labeling `pm-phase2.js`'s existing `buildTaskPrompt` already uses to inline the
Tech-Spec text into the per-task prompt, so this introduces no new prompt-construction convention.
Change the `outputs:`/`fresh()` input arrays for `Validation-Report` from
`[featurePath, file('Requirements'), file('Tech-Spec')]` to `[featurePath, reqIndexPath, specIndexPath]`.
Replace `docsDigest = c.hash(c.read(file('Requirements')) + '\u0000' + c.read(file('Tech-Spec')))`
with `c.hash(assembledRequirements + '\u0000' + assembledTechSpec)` — same meaning, no file read.
After `if (result.needsRequirementsFix) await generateRequirements(true)`, add
`assembledRequirements = assembleRequirements()`; the analogous line for `needsTechSpecFix`/
`assembledTechSpec`. Update the returned `requirements.path`/`tech_spec.path` to `reqIndexPath`/
`specIndexPath`.

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase1-source.test.js
```

```
node --check src/claude/workflows/pm-phase1.js
```
