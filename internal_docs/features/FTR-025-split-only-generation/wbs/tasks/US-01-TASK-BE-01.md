<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Stop writing assembled Requirements/Tech-Spec; repoint regen/truncation/AC-check gates
- **Outcome:** pm-phase1.js's generateRequirements()/generateTechSpec() no longer call c.writeOutput(file('Requirements'/'Tech-Spec'), assembled...); the top-level regen-freshness gates become fresh(reqIndexPath)/fresh(specIndexPath, [featurePath, reqIndexPath]); assertCompleteSections reads reqIndexPath/specIndexPath; tech-spec-ac-check's Requirements argument becomes reqIndexPath
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 30000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** repoint pm-phase1.js's regen/truncation/AC-check gates at split index files

**Implementation notes:**

Delete the final `c.writeOutput(file('Requirements'), assembled)` line inside `generateRequirements()`
and its analogous `c.writeOutput(file('Tech-Spec'), assembledSpec)` inside `generateTechSpec()` —
both functions keep producing `req/index.md`/`spec/index.md` and their per-item files exactly as
today (FTR-021/FTR-024, unchanged), they just stop computing/writing the monolithic file. In the
top-level orchestration: replace `fresh(file('Requirements'))` with `fresh(reqIndexPath)`, and
`fresh(file('Tech-Spec'), [featurePath, file('Requirements')])` with
`fresh(specIndexPath, [featurePath, reqIndexPath])`. Replace both `assertCompleteSections(...,
c.read(file('Requirements'/'Tech-Spec')), N)` calls with `c.read(reqIndexPath)`/`c.read(specIndexPath)`
— this is functionally identical since the skeleton already carries every top-level `## N. `
heading. The `tech-spec-ac-check` activity's second `c.command(...)` argument changes from
`file('Requirements')` to `reqIndexPath` — `wb-graph-checks.js`'s `parseAcTable` needs no change,
since the AC table (Requirements §7) is cross-cutting and already lives in the index untouched by
the per-UC split.

**Verification commands:**

```
npx jest --testPathPattern=tests/cli/pm-phase1-source.test.js
```

```
node --check src/claude/workflows/pm-phase1.js
```
