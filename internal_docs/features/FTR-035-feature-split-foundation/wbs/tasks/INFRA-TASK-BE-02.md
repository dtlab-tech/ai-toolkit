<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Add facade entry point with single-JSON stdout and exit contract
- **Outcome:** feature-split.js has a main facade that dispatches the apply and register commands, prints exactly one JSON object on stdout, exits 0 on success, and on FeatureSplitError or operational error prints { error: { code, key, file, message } } and exits 1.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split facade stdout and exit contract

**Implementation notes:**

Scope: append a facade to `src/claude/scripts/feature-split.js` (created by INFRA-TASK-BE-01). Do not implement `apply` or `register` here. Their bodies belong to later tasks (apply in Implementation Order steps 6–7, register in step 8). This task only wires the dispatch and the output contract.

Source of the contract: Tech-Spec §2 "Interface contract (feature-wide)" (stdout is exactly one JSON object; success exits 0 with the command's object; failure exits 1 with `{ "error": { "code", "key", "file", "message" } }`; NFR-05, AC-36) and Flow D step 10 for the apply success shape.

Things the spec does not define, which this task must handle and which need a Gate decision:
1. **Argument parsing.** The spec gives the invocation `ai-toolkit run-asset scripts/feature-split.js --project <root> -- <command> [options]` but does not say how `run-asset` passes argv to the script. Assume the command is the first element of `process.argv.slice(2)` and the remaining elements are its arguments. Confirm this against `run-asset` before merging.
2. **Code for non-FeatureSplitError failures** (unknown command, missing command, unexpected exceptions). The feature's code list has no generic code. Use `UNEXPECTED_ERROR` with `key: null, file: null`, and flag it for addition to the Tech-Spec interface contract.
3. **Stub handlers.** `apply` and `register` do not exist yet. Declare them as stubs that throw a plain `Error`. The facade then reports them as operational errors (exit 1) until the later tasks replace the stubs.

Constructor: BE-01 defines `FeatureSplitError`. Use its actual constructor signature. The sketch below assumes `new FeatureSplitError(code, message, { key, file })`; adjust it to match BE-01.

Code to append:

```javascript
const fs = require('fs');

const UNEXPECTED_CODE = 'UNEXPECTED_ERROR'; // not in the feature code list; flagged in Notes

// Replaced by later tasks (apply: steps 6-7; register: step 8).
function runApply(args, readStdin) {
  throw new Error('apply is not implemented yet');
}
function runRegister(args) {
  throw new Error('register is not implemented yet');
}

const COMMANDS = { apply: runApply, register: runRegister };

function errorPayload(err) {
  if (err instanceof FeatureSplitError) {
    return { error: { code: err.code, key: err.key ?? null, file: err.file ?? null, message: err.message } };
  }
  return { error: { code: UNEXPECTED_CODE, key: null, file: null, message: String((err && err.message) || err) } };
}

// Pure: returns { exitCode, payload }. Never writes to stdout.
function main(argv, readStdin) {
  const [command, ...rest] = argv;
  try {
    if (!command || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
      throw new Error(`unknown or missing command: ${command || '(none)'}; expected apply or register`);
    }
    return { exitCode: 0, payload: COMMANDS[command](rest, readStdin) };
  } catch (err) {
    return { exitCode: 1, payload: errorPayload(err) };
  }
}

function run(argv = process.argv.slice(2)) {
  const readStdin = () => fs.readFileSync(0, 'utf8'); // read lazily; only apply uses it
  const { exitCode, payload } = main(argv, readStdin);
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exitCode = exitCode; // not process.exit(): on Windows, exit can truncate piped stdout
}

if (require.main === module) run();

module.exports.main = main;
module.exports.run = run;
```

Rules to keep:
- Only `run()` writes to stdout, and it writes exactly one `JSON.stringify` line. No `console.log` or warnings anywhere in the module.
- The library exports from BE-01 stay unchanged. Add `main` and `run` alongside them. Do not replace the exports object.
- `require.main === module` keeps the module importable by tests without running it.

Estimate basis: about 60 lines appended to one file, plus reading BE-01 and checking `run-asset`. About 15 minutes.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node src/claude/scripts/feature-split.js; test $? -eq 1
```

```
node src/claude/scripts/feature-split.js 2>/dev/null | node -e "const o=JSON.parse(require('fs').readFileSync(0,'utf8'));if(Object.keys(o).join()!=='error'||!o.error.code)process.exit(1)"
```

```
npm test
```