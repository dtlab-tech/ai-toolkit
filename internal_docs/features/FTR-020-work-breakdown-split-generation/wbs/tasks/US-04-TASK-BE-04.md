<a id="task-US-04-TASK-BE-04"></a>
### US-04-TASK-BE-04

- **Task ID:** US-04-TASK-BE-04
- **Title:** Wire pm-phase2.js's wb-validate.js/wb-render.js calls to pass the wbs directory
- **Outcome:** pm-phase2.js's existing c.command(['run-asset', 'scripts/wb-validate.js', ...]) and c.command(['run-asset', 'scripts/wb-render.js', ...]) calls receive the wbs directory path instead of the single jsonPath; the rest of the existing report/semantic-validation/render/Gate-2-payload body is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-02-TASK-BE-02, US-05-TASK-BE-01, US-04-TASK-BE-03
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire pm-phase2.js validate/render calls to the wbs directory path

**Implementation notes:**

Single-argument substitution in the two existing `c.command(...)` calls (current `pm-phase2.js`
lines 38–39 and 52) — `jsonPath` becomes `wbsDir` everywhere it is passed to these two scripts.
Nothing else in the surrounding `c.activity('wb-validate', ...)` / `c.activity('wb-render', ...)`
blocks changes — the scripts now resolve `wbsDir` through `loadWorkBreakdown` themselves
(US-02-TASK-BE-02, US-05-TASK-BE-01), so `pm-phase2.js` doesn't need to know or care which format
it's pointing at:

```js
// Before:
const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root, '--', jsonPath, file('Requirements.md')], [0, 1])
// ...
const result = c.command(['run-asset', 'scripts/wb-render.js', '--project', c.root, '--', jsonPath, prefix])

// After:
const res = c.command(['run-asset', 'scripts/wb-validate.js', '--project', c.root, '--', wbsDir, file('Requirements.md')], [0, 1])
// ...
const result = c.command(['run-asset', 'scripts/wb-render.js', '--project', c.root, '--', wbsDir, prefix])
```
Delete the now-unused `const jsonPath = file('Work-Breakdown.json')` line entirely if nothing
else in `pm-phase2.js` still references it (grep the file to confirm before deleting — the
skeleton/resume logic in `US-04-TASK-BE-01` introduced its own `indexPath`/`wbsDir` constants,
which are the ones that matter now).

**Verification commands:**

```
node --check src/claude/workflows/pm-phase2.js
```
