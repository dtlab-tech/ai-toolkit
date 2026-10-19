<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire generateTechSpec() to assemble via tech-spec-assembler.js and replace the old techSpec() call sites
- **Outcome:** generateTechSpec() calls tech-spec-assembler.js via c.command(['run-asset', ...]) against the spec/ directory and writes the assembled document to file('Tech-Spec') via c.writeOutput; the old techSpec = () => c.worker(specId, featurePath, { outputs: [...] }) binding is removed, and both its call sites (initial generation, needsTechSpecFix branch) now call generateTechSpec(force) / generateTechSpec(true) respectively, mirroring generateRequirements's exact pattern
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 20000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase1.js Tech-Spec generation to assemble via tech-spec-assembler.js

**Implementation notes:**

Completes `generateTechSpec()` (`US-04-TASK-BE-01`/`BE-02`/`BE-03`):

```js
  // ... (skeleton call, tech-spec-ac-check, per-component loop already in place) ...

  const assembled = c.command(['run-asset', 'scripts/tech-spec-assembler.js', '--project', c.root,
    '--', specDir]).stdout
  c.writeOutput(file('Tech-Spec'), assembled)
}
```

Two changes to the surrounding, otherwise-unchanged `pm-phase1.js` body:

1. **Remove** `const techSpec = () => c.worker(specId, featurePath, { outputs: [output('Tech-Spec',
   [featurePath, file('Requirements')])] })` (current line 37) entirely.
2. **Replace both existing call sites:**
   - Current line 142 (`await techSpec()`, inside the `if (force || changed || !fresh(file('Tech-Spec'), ...))`
     block) becomes `await generateTechSpec(force)` — mirrors line 136's
     `await generateRequirements(force)` exactly.
   - Current line 183 (`if (result.needsTechSpecFix) await techSpec()`) becomes
     `if (result.needsTechSpecFix) await generateTechSpec(true)` — mirrors line 182's
     `await generateRequirements(true)` exactly.

`assertCompleteSections('Tech-Spec', c.read(file('Tech-Spec')), 12)` (current line 144),
`docsDigest` (current line 191), and every other line in the function body outside
`generateTechSpec()` itself are **untouched** — they already read `file('Tech-Spec')` by path,
and that path now simply contains assembled rather than directly-generated content, exactly as
`generateRequirements`'s own equivalent guarantee already established for Requirements.

`AC-04` ("assembler reconstructs the exact 12-section shape") is NOT cited here even though this
task is what *invokes* the assembler — it's scoped to `US-05`, the assembler's own phase. `AC-07`
("none of these [existing scripts] are modified, except one new call site") IS legitimately
citable here: its `Related UC` is "All UCs" (unscoped), and this task is precisely the one new
call site it refers to (`tech-spec-assembler.js`'s invocation, newly added to `pm-phase1.js`).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase1.js
```
