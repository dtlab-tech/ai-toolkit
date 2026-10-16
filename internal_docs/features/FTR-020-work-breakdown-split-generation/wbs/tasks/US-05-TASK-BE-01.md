<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Wire wb-render.js to load input via wbs-assembler.loadWorkBreakdown
- **Outcome:** wb-render.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); renderMarkdown, renderCsv, computePhaseDependsOn, sanitizeField, fencedCommandBlock, and taskAnchor are unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire wb-render.js to accept split-directory or legacy-JSON input via wbs-assembler

**Implementation notes:**

Same pattern as `US-02-TASK-BE-02`, applied to `wb-render.js` instead:

```js
// Before (current lines ~20-48):
const jsonPath = process.argv[2];
const prefix = process.argv[3];
if (!jsonPath || !prefix) { process.stderr.write('Usage: ...\n'); process.exit(1); }
let raw;
try { raw = fs.readFileSync(jsonPath, 'utf8'); }
catch (err) { process.stderr.write(`Error: cannot read file "${jsonPath}": ${err.message}\n`); process.exit(1); }
let wb;
try { wb = JSON.parse(raw); }
catch (err) { process.stderr.write(`Error: "${jsonPath}" is not valid JSON: ${err.message}\n`); process.exit(1); }
if (wb.schemaVersion !== 2) { process.stderr.write(`Error: schemaVersion must be 2, got ...\n`); process.exit(2); }
if (!Array.isArray(wb.phases)) { process.stderr.write('Error: "phases" must be an array\n'); process.exit(2); }

// After:
const { loadWorkBreakdown } = require('./wbs-assembler');
const jsonPath = process.argv[2];
const prefix = process.argv[3];
if (!jsonPath || !prefix) { process.stderr.write('Usage: ...\n'); process.exit(1); }
let wb;
try { wb = loadWorkBreakdown(jsonPath); }
catch (err) { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); }
```
`loadWorkBreakdown` already enforces `schemaVersion === 2`/`Array.isArray(phases)` on the
legacy-file path and the equivalent structural shape on the directory path, so those two checks
collapse into the one `try`/`catch` — do not duplicate them after the call. Everything from
`const mdPath = ...` (destination path computation) through `renderMarkdown`/`renderCsv`
themselves is untouched.

**Verification commands:**

```
node --check src/claude/scripts/wb-render.js
```
