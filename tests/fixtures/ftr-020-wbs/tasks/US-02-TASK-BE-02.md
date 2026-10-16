<a id="task-US-02-TASK-BE-02"></a>
### US-02-TASK-BE-02

- **Task ID:** US-02-TASK-BE-02
- **Title:** Wire wb-validate.js to load input via wbs-assembler.loadWorkBreakdown
- **Outcome:** wb-validate.js's top-of-file fs.readFileSync + JSON.parse pair is replaced with const wb = loadWorkBreakdown(process.argv[2]); the rest of the script (report construction, all checks) is unchanged
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-02, US-02-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire wb-validate.js to accept split-directory or legacy-JSON input via wbs-assembler

**Implementation notes:**

Smallest task in the feature — a direct substitution at the top of `wb-validate.js`:

```js
// Before (current lines ~251-266):
const jsonPath = process.argv[2];
const requirementsPath = process.argv[3];
if (!jsonPath) { process.stderr.write('Error: missing required argument ...\n'); process.exit(2); }
let raw;
try { raw = fs.readFileSync(path.resolve(jsonPath), 'utf8'); }
catch (err) { process.stderr.write(`Error: cannot read file "${jsonPath}": ${err.message}\n`); process.exit(2); }
let wb;
try { wb = JSON.parse(raw); }
catch (err) { process.stderr.write(`Error: "${jsonPath}" is not valid JSON: ${err.message}\n`); process.exit(2); }

// After:
const { loadWorkBreakdown } = require('./wbs-assembler');
const jsonPath = process.argv[2];
const requirementsPath = process.argv[3];
if (!jsonPath) { process.stderr.write('Error: missing required argument ...\n'); process.exit(2); }
let wb;
try { wb = loadWorkBreakdown(path.resolve(jsonPath)); }
catch (err) { process.stderr.write(`Error: ${err.message}\n`); process.exit(2); }
```
`jsonPath` stays the CLI's name for this argument even though it may now be a directory — the
argv contract (`argv[2]` = path, `argv[3]` = optional requirements path) does not change, only
what kind of path is accepted. Everything from `const report = { ... }` onward is untouched.

**Verification commands:**

```
node --check src/claude/scripts/wb-validate.js
```
