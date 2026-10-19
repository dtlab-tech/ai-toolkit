# src/claude/workflows/pm-phase2.js — Modified

## Change

One addition: a local `hasVerificationCommands(content)`, duplicating `wbs-assembler.js`'s own
`_parseVerificationCommands` algorithm (same "last occurrence of the marker wins" rule, to avoid an
illustrative example earlier in Implementation notes being mistaken for the real section), returning
a boolean instead of the parsed array. Wired into the per-task resume-by-status loop's `continue`
condition.

## Algorithm

```js
// Duplicates wbs-assembler.js's _parseVerificationCommands algorithm (last occurrence of the
// marker wins, same reasoning as that file's own comment) — returns a boolean ("does this file
// have at least one verification command") instead of the parsed array, since this call site only
// needs the yes/no signal.
const FENCE_RE_LOCAL = /```[^\n]*\n([\s\S]*?)```/g
function hasVerificationCommands(content) {
  const marker = '**Verification commands:**'
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return false
  const verifPart = content.slice(idx + marker.length)
  FENCE_RE_LOCAL.lastIndex = 0
  return FENCE_RE_LOCAL.test(verifPart)
}

// Per-task loop (today): if (task.status === 'generated' && c.exists(detailPath)) continue
// becomes:
if (task.status === 'generated' && c.exists(detailPath) && hasVerificationCommands(c.read(detailPath))) continue
```

Placed near the top of the file alongside the other duplicated primitives (the template-engine
functions, `parseComponentsTableLocal`), not inline at the loop.

## Tests

`tests/integration/workflow-runtime.test.js` (see that file's own component): a new test marks a
task `generated` with its detail file present but containing zero verification commands, confirms
a resume run regenerates it (dispatches the worker again), and a control case confirms a task with
at least one verification command is still skipped, unchanged from today.
