<a id="task-US-02-TASK-BE-01"></a>
### US-02-TASK-BE-01

- **Task ID:** US-02-TASK-BE-01
- **Title:** Create assemble-docs.js
- **Outcome:** src/claude/scripts/assemble-docs.js exists exporting assembleReq/assembleSpec/assembleWbs(featureDir, prefix), requiring req-assembler.js's loadRequirements and tech-spec-assembler.js's loadTechSpec directly (in-process, no subprocess) and shelling out to wb-render.js for wbs (CLI-only); a require.main CLI entry point takes <feature-dir> <prefix> [req|spec|wbs|all], defaulting to all, exits 1 for a missing/unknown argument and 2 (naming the exact expected path) when a requested split source directory doesn't exist
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-07
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add assemble-docs.js for on-demand single-file Requirements/Tech-Spec/Work-Breakdown views

**Implementation notes:**

Runs as a plain Node CLI outside the sandboxed workflow runtime, so it can `require()`
`req-assembler.js`/`tech-spec-assembler.js` directly — no subprocess round-trip needed for `req`/
`spec`. `assembleReq`/`assembleSpec` do NOT duplicate the existence check `loadRequirements`/
`loadTechSpec` already perform internally (`fs.statSync(inputPath, {throwIfNoEntry:false})`
returning null → a structured `AssemblyError` naming the exact path) — reuse that error, don't
re-wrap it. `assembleWbs` shells out to `wb-render.js` (CLI-only — it writes its own two output
files and exits, no exported function to call in-process), after its own existence check for
`wbs/` (that script has no built-in one). The CLI's top-level try/catch exits 2 only for
`AssemblyError` instances from either assembler module (`ReqAssemblyError`/`SpecAssemblyError`
imports), 1 for anything else (usage errors). No per-file registration needed in
`lib/agent-registry.js` — unlike agents, `src/claude/scripts/*.js` is installed wholesale by the
`scripts` asset category.

**Verification commands:**

```
node --check src/claude/scripts/assemble-docs.js
```
