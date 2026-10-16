<a id="task-INFRA-TASK-BE-02"></a>
### INFRA-TASK-BE-02

- **Task ID:** INFRA-TASK-BE-02
- **Title:** Create wbs-assembler.js with loadWorkBreakdown and detail block parse/render
- **Outcome:** src/claude/scripts/wbs-assembler.js exists exporting loadWorkBreakdown(inputPath) (dispatches on file vs. directory input, returns the existing {schemaVersion, feature, phases:[{...,tasks:[...]}]} shape), parseTaskDetailBlock(text)/renderTaskDetailBlock(task), and parsePhaseDetailBlock(text)/renderPhaseDetailBlock(phase) for the phase tier, all independently reimplemented (not imported from lib/task-executor/plan.js)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 40000
- **Output count:** 1
- **Grouping rationale:** loadWorkBreakdown and its four helper functions (parseTaskDetailBlock, renderTaskDetailBlock, parsePhaseDetailBlock, renderPhaseDetailBlock) form one cohesive, mutually-dependent module — loadWorkBreakdown calls both parse functions internally and none is independently testable or meaningful without the others.
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add wbs-assembler.js with directory/legacy loader and detail block codec

**Implementation notes:**

Four building blocks, in this order:

**1. Field/fence regexes** — reuse the exact conventions already proven in
`lib/task-executor/plan.js` (`_parseTaskFields`/`_FENCE_RE`), reimplemented independently here
(do not `require('../../../lib/task-executor/plan')` — that module is out of scope, see
feature.md):
```js
const DASH = '—'; // '—'
const FIELD_LINE_RE = /^- \*\*(.+?):\*\*[ \t]?(.*)$/;   // single-line test, NOT /gm — see note below
const FENCE_RE = /^(`{3,})\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm;
const listOrEmpty = v => v === DASH ? [] : v.split(',').map(s => s.trim()).filter(Boolean);
const numberOrNull = v => v === DASH ? null : Number(v);
const stringOrNull = v => v === DASH ? null : v;
```

**IMPORTANT — do not naively regex-scan the whole file for field lines.** A task's
"Implementation notes" section may legitimately *illustrate* this exact block format inside a
fenced code example (several tasks in this very feature do, e.g. `US-03-TASK-INFRA-01.md`'s
"Output" example) — a global `FIELD_LINE_RE.exec()` over the whole text would pick up those
illustrative lines too and silently overwrite the real field values with whatever placeholder
text the example uses. Verified empirically during this feature's own definition: a naive global
scan over `US-03-TASK-INFRA-01.md` produced duplicate/wrong values for `Task ID`, `Title`, and
`Commit subject`. Fix: only read the **contiguous run** of field lines that starts immediately
after the task's heading, and stop at the first line that doesn't match — don't keep scanning
past it:

```js
function parseFieldBlock(text) {
  const lines = text.split(/\r?\n/);
  const fields = {};
  let i = 0;
  while (i < lines.length && !FIELD_LINE_RE.test(lines[i])) i++;   // skip <a id=...>/heading/blank
  for (; i < lines.length; i++) {
    const m = lines[i].match(FIELD_LINE_RE);
    if (!m) break;                                                 // first non-field line ends the run
    fields[m[1].trim()] = m[2].trim();
  }
  return fields;
}
```

**2. Task detail codec:**
```js
function parseTaskDetailBlock(text) {
  const fields = parseFieldBlock(text);
  const marker = '**Verification commands:**';
  const idx = text.lastIndexOf(marker);   // LAST occurrence — the real section is always the
  // final one in a well-formed file; an earlier occurrence could be inside an illustrative
  // example in the Implementation notes section (same collision risk as the field lines above)
  const verifPart = idx === -1 ? '' : text.slice(idx + marker.length);
  const commands = [];
  let m; FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(verifPart))) commands.push(m[2]);
  return { groupingRationale: stringOrNull(fields['Grouping rationale']), verificationCommands: commands };
}

function renderTaskDetailBlock(task) {
  const cmds = task.verification?.commands ?? [];
  const cmdBlocks = cmds.length
    ? cmds.map(c => '```\n' + c + '\n```').join('\n\n')
    : '_No verification commands._';
  return [
    `<a id="task-${task.id}"></a>`, `### ${task.id}`, '',
    `- **Task ID:** ${task.id}`, `- **Title:** ${task.title}`, `- **Outcome:** ${task.outcome}`,
    `- **Domain:** ${task.domain}`, `- **Agent type:** ${task.agentType}`,
    `- **Dependencies:** ${task.dependsOn.length ? task.dependsOn.join(', ') : DASH}`,
    `- **Acceptance criteria:** ${task.acceptanceCriteria.length ? task.acceptanceCriteria.join(', ') : DASH}`,
    `- **Estimate — agent minutes:** ${task.estimate.agentMinutes}`,
    `- **Estimate — tokens:** ${task.estimate.tokens}`,
    `- **Output count:** ${task.outputCount}`,
    `- **Grouping rationale:** ${task.groupingRationale ?? DASH}`,
    `- **Commit type:** ${task.commit.type}`, `- **Commit scope:** ${task.commit.scope ?? DASH}`,
    `- **Commit subject:** ${task.commit.subject}`, '',
    '**Verification commands:**', '', cmdBlocks, '',
  ].join('\n');
}
```
(Only the fields this module actually needs back are parsed — title/outcome/domain/etc. are
re-derived from `index.json`'s skeleton at assembly time, not from the task file; see
`loadWorkBreakdown` below. `renderTaskDetailBlock` is the inverse, used by
`US-04-TASK-BE-03`'s per-task write step and by tests for round-trip verification.)

**3. Phase detail codec** (simpler — no fenced section, but same collision risk and same fix:
use `parseFieldBlock`, not a global scan):
```js
function parsePhaseDetailBlock(text) {
  const fields = parseFieldBlock(text);
  return { title: fields['Title'], commit: { type: stringOrNull(fields['Commit type']),
    scope: stringOrNull(fields['Commit scope']), subject: stringOrNull(fields['Commit subject']) } };
}

function renderPhaseDetailBlock(phase) {
  return [
    `<a id="phase-${phase.id}"></a>`, `### ${phase.id}`, '',
    `- **Phase ID:** ${phase.id}`, `- **Type:** ${phase.type}`, `- **Title:** ${phase.title}`,
    `- **Commit type:** ${phase.commit.type}`, `- **Commit scope:** ${phase.commit.scope ?? DASH}`,
    `- **Commit subject:** ${phase.commit.subject}`,
  ].join('\n');
}
```

**4. The loader** — see Tech-Spec §4 for the full pseudocode; the essential shape:
```js
function loadWorkBreakdown(inputPath) {
  if (fs.statSync(inputPath).isDirectory()) {
    const index = JSON.parse(fs.readFileSync(path.join(inputPath, 'index.json'), 'utf8'));
    if (index.schemaVersion !== 3) throw new Error('expected schemaVersion 3');
    const phases = index.phases.map(phaseSkeleton => {
      const phaseDetailPath = path.join(inputPath, phaseSkeleton.detailFile);
      if (!fs.existsSync(phaseDetailPath)) throw new Error(`phase "${phaseSkeleton.id}" has no detail file at ${phaseDetailPath}`);
      const phaseDetail = parsePhaseDetailBlock(fs.readFileSync(phaseDetailPath, 'utf8'));
      const tasks = phaseSkeleton.taskIds.map(taskId => {
        const skeletonTask = index.tasks[taskId];
        if (!skeletonTask) throw new Error(`index.json references unknown task "${taskId}"`);
        const detailPath = path.join(inputPath, skeletonTask.detailFile);
        if (!fs.existsSync(detailPath)) throw new Error(`task "${taskId}" has no detail file at ${detailPath}`);
        const detail = parseTaskDetailBlock(fs.readFileSync(detailPath, 'utf8'));
        return { id: taskId, ...skeletonTask, groupingRationale: detail.groupingRationale,
          verification: { commands: detail.verificationCommands } };
      });
      return { id: phaseSkeleton.id, type: phaseSkeleton.type, title: phaseDetail.title,
        commit: phaseDetail.commit, tasks };
    });
    return { schemaVersion: 2, feature: index.feature, phases };
  }
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (raw.schemaVersion !== 2) throw new Error('expected schemaVersion 2');
  return raw;
}
```
Every thrown error must name the exact offending path (AC-07) — do not swallow and rethrow a
generic message.

**Verification commands:**

```
node --check src/claude/scripts/wbs-assembler.js
```
