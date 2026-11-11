<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Wire the check-definition command into feature-split.js
- **Outcome:** feature-split.js exposes a read-only check-definition command, backed by exported checkDefinition and runCheckDefinition, registered in COMMANDS. It returns status skipped without reading stdin when isNewFeature reports the feature is not new, validates the feature id, and loads minimums through loadConfig. The unknown-command message now lists check-definition.
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
- **Commit subject:** add check-definition command to feature-split

**Implementation notes:**

**Precondition (blocker to check first).** This task consumes `parseGrillingRecord` and `evaluateDefinition`, which INFRA-TASK-BE-01 must export. In the current `src/claude/scripts/feature-split.js` (1218 lines) neither function exists yet. Confirm BE-01 has landed, and read the actual exported signature of `evaluateDefinition` before writing the call below. If the signature differs, adapt only the call site in `checkDefinition`, not the contract. If BE-01 has not landed, stop and report it. Do not implement the parsing or evaluation logic here.

Also note: `isOverThreshold` and `meetsMinimum` are already in the file (lines 82–84), and `isNewFeature` (line 631) returns `{ isNew, reason }` with reasons `not-created`, `epic`, `approvals`, `wbs`, `no-markers`.

**1. Add the two functions after `runRegister` (after line 1147).**

```js
const FEATURE_ID = /^[A-Z]+-\d+$/;

// Read-only. Returns { status: 'skipped', reason } without reading stdin when the feature is not new.
// Otherwise parses the grilling record from stdin and evaluates it against definitionSignals.
// config is optional: when omitted, it is loaded lazily, after the skip test.
function checkDefinition({ featuresRoot, featureId, readStdin, config }) {
  if (typeof featureId !== 'string' || !FEATURE_ID.test(featureId))
    fail('FEATURE_INVALID', `feature id "${featureId}" must match ^[A-Z]+-\\d+$`, { key: String(featureId) });
  const featureDir = findParentDir(featuresRoot, featureId);   // name === ID or starts with ID-; ambiguous -> PARENT_INVALID
  const newness = isNewFeature(featureDir);
  if (!newness.isNew) return { status: 'skipped', reason: newness.reason };   // stdin is NOT read on this path
  const record = parseGrillingRecord(readStdin());                            // BE-01
  const { definitionSignals } = config ?? loadConfig();
  return evaluateDefinition(record, definitionSignals);                       // BE-01; adapt to its real signature
}

function runCheckDefinition(args, readStdin) {
  const flags = parseFlags(args);
  const featuresRoot = required(flags, 'features-root');
  const featureId = required(flags, 'feature-id');
  return checkDefinition({ featuresRoot, featureId, readStdin });
}
```

Notes on this block:
- The ID check runs before any path is built, so a malformed ID never reaches `findParentDir`.
- `findParentDir` already implements the ambiguous-match rule and fails with `PARENT_INVALID` when more than one folder matches. Reuse it; do not write a second matcher.
- A missing folder gives `isNewFeature` → `not-created` → new, so evaluation proceeds.
- `loadConfig()` defaults to `process.cwd()` for the project override. Pass no project root here.

**2. Register the command (line 1149).**

Before:
```js
const COMMANDS = { apply: runApply, register: runRegister };
```
After:
```js
const COMMANDS = { apply: runApply, register: runRegister, 'check-definition': runCheckDefinition };
```

**3. Update the unknown-command message (line 1162).**

Before:
```js
throw new Error(`unknown or missing command: ${command || '(none)'}; expected apply or register`);
```
After:
```js
throw new Error(`unknown or missing command: ${command || '(none)'}; expected apply, register or check-definition`);
```

**4. Export the new functions (append after line 1217).**

```js
module.exports.checkDefinition = checkDefinition;
module.exports.runCheckDefinition = runCheckDefinition;
```

**Scope limits.** Do not add `validate-proposal` (INFRA-TASK-BE-03). Do not change `apply`, `register` or the config file. Do not write any file from this command.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');if(typeof m.checkDefinition!=='function'||typeof m.runCheckDefinition!=='function'){process.exit(1)}"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const fs=require('fs'),os=require('os'),path=require('path');const r=fs.mkdtempSync(path.join(os.tmpdir(),'fs-'));fs.mkdirSync(path.join(r,'FTR-001'));fs.writeFileSync(path.join(r,'FTR-001','epic.md'),'x');const out=m.main(['check-definition','--features-root',r,'--feature-id','FTR-001'],()=>{throw new Error('stdin read')});console.log(JSON.stringify(out));if(out.payload.status!=='skipped'){process.exit(1)}"
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');const out=m.main(['bogus'],()=>'');if(!out.payload.error.message.includes('check-definition')){process.exit(1)}"
```

```
npx jest tests/scripts/feature-split.test.js
```