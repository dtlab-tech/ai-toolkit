<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Add loadConfig with default and override merge
- **Outcome:** feature-split.js exports loadConfig({ projectRoot }). It loads the toolkit default, reads the override only from <projectRoot>/feature-split.config.json, and treats an absent override as no error. It overlays the override leaf by leaf, so omitted keys keep their defaults, and returns the full D-02 shape.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01
- **Acceptance criteria:** AC-01, AC-02, AC-03, AC-07
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add loadConfig merging default and project override

**Implementation notes:**

This task adds one function, `loadConfig`, to `src/claude/scripts/feature-split.js` and exports it. It builds on the helpers that US-01-TASK-BE-01 adds (`readConfigFile` and `validateConfig`). Do not change those helpers here. The duplicate check found no conflict: INFRA-TASK-BE-02 is the CLI facade, and no other sibling builds configuration loading.

The Tech-Spec excerpt gives the design for this function. The Acceptance Criteria text for AC-01, AC-02 and AC-03 is not in the excerpt, so the rules below come from the design decisions D-02 to D-05 and the Tech-Spec's `loadConfig` sketch.

Steps:

1. Add the constants if BE-01 has not already defined them: `CONFIG_NAME = 'feature-split.config.json'` and `DEFAULT_CONFIG = path.join(__dirname, CONFIG_NAME)`.
2. Add `loadConfig` with this signature: `function loadConfig({ projectRoot = process.cwd() } = {}) → { thresholds, definitionSignals, minChildren }`. The signature takes only `projectRoot`, as the skeleton specifies. Do not add a `defaultFile` parameter in this task.
3. Read and validate the toolkit default as required. A missing or unreadable default must fail through `readConfigFile(..., true)`.
4. Read the override from `path.join(projectRoot, CONFIG_NAME)` only. An absent override returns `undefined` from `readConfigFile(..., false)` and is not an error. A present override is validated as a partial config.
5. Overlay leaf by leaf. Because each section is flat, spreading each section is enough. `minChildren` is taken from the override only when the override defines it.
6. Export `loadConfig` in `module.exports`. Keep the other exports unchanged.

```javascript
function loadConfig({ projectRoot = process.cwd() } = {}) {
  const base = readConfigFile(DEFAULT_CONFIG, true);              // missing default -> CONFIG_DEFAULT_UNREADABLE
  validateConfig(base, DEFAULT_CONFIG, false);                     // full shape required
  const overrideFile = path.join(projectRoot, CONFIG_NAME);
  const override = readConfigFile(overrideFile, false);            // undefined when absent (not an error)
  if (override !== undefined) validateConfig(override, overrideFile, true);  // partial allowed
  const o = override || {};
  return {
    thresholds: { ...base.thresholds, ...o.thresholds },           // leaf-by-leaf overlay
    definitionSignals: { ...base.definitionSignals, ...o.definitionSignals },
    minChildren: o.minChildren !== undefined ? o.minChildren : base.minChildren,
  };
}
```

Points to check against BE-01's actual code before writing:

- The partial-validation flag in `validateConfig` is taken from the design (`validateConfig(obj, file, partial)`). If BE-01 names or orders this parameter differently, adapt the calls here to match BE-01 and do not change BE-01's helpers.
- The returned object must contain no keys beyond `thresholds`, `definitionSignals` and `minChildren`. Do not return the raw override object.
- Do not hard-code any numeric value. Every value comes from the default file or the override (BR-04).

Test seam note for the host: the Tech-Spec's test list includes "missing toolkit default throws", which needs either a file-path seam or a way to make the default unreadable. This task does not add that seam. If US-01-TASK-TEST-01 needs it, the host must decide that separately.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const f=require('./src/claude/scripts/feature-split.js'); const c=f.loadConfig({projectRoot: require('os').tmpdir()}); if(c.thresholds.useCases!==8||c.definitionSignals.minFlows!==3||c.minChildren!==2||Object.keys(c).sort().join()!=='definitionSignals,minChildren,thresholds') process.exit(1)"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```