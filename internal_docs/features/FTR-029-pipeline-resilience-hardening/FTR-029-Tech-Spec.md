# Technical Specification — Pipeline Resilience Hardening (Round 2)

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-029 |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Draft |

## 1. Overview

Four independent resilience fixes, each confirmed against real pipeline failures: (1) relax
`gaia-validate-feature-docs`'s worker schema so a logically-complete response is no longer
discarded over two optional boolean fields, plus a bounded secondary retry for a genuinely
unrecoverable response; (2) validate the Requirements Acceptance-Criteria table's column header
before any positional parsing; (3) recover an unclosed whole-response fence wrap in
`extractMarkdownDocument`; (4) validate a per-component/per-UC generation result immediately after
its own dispatch, with one bounded retry, instead of only on a later invocation or at final
assembly.

## 2. Architecture

### 2.1 System Context

No new system boundary. Changes: `lib/workflow-control.js` (worker dispatch + Markdown recovery),
`req-skeleton-check.js`/`req-graph-checks.js`/`req-assembler.js` (Requirements structural
pre-check), `gaia-generate-requirements.md` (stale example correction), `pm-phase1.js` (per-item
generation loops). No new script, no new CLI command, no new agent, no new installer catalog entry.

### 2.2 Component Diagram

```
Before (today):
  worker(): retries ONLY a transient API error; "no structured output" throws unconditionally
            after the loop, even if the candidate is one optional-field short of valid
  req-skeleton-check.js: parseAcTable's positional destructure runs on ANY table shape
  extractMarkdownDocument: recovers a CLOSED whole-response fence wrap only
  pm-phase1.js: per-component/per-UC loops write whatever the worker returns, unconditionally

After (this feature):
  worker(): schema no longer requires needsRequirementsFix/needsTechSpecFix (properties only);
            ALSO retries once more, with a corrective nudge, if still unrecoverable after that
  req-skeleton-check.js: AC table header validated (ID|Criterion|Related UC) BEFORE parseAcTable
  extractMarkdownDocument: + strips an unclosed leading fence opener, re-validates the remainder
  pm-phase1.js: per-component/per-UC loops validate + bounded-retry immediately after dispatch,
                fail fast and attributably on a second failure
```

### 2.3 Sequence Diagrams

**UC-01, per schema-required `worker()` call:**
```
worker(): dispatch attempt -> clean exit, structured_output empty?
  extractDelimitedStructuredOutput(text, RELAXED schema) -> recovers (needsRequirementsFix/
    needsTechSpecFix absent, no longer required) -> used as-is, no retry (common case now)
  still null -> retry with corrective nudge appended, up to WORKER_MAX_ATTEMPTS
  still null after all attempts -> existing "Worker returned no structured output" error
```

**UC-02, per `req-skeleton-check.js` invocation:**
```
req-skeleton-check.js: parseUseCaseIndexTable -> findSectionRange(7) -> parseTableHeader
  -> checkAcTableHeader(headerCells)
    header malformed -> MALFORMED_AC_TABLE_HEADER error; acTable treated as [] for this run
    header OK -> parseAcTable (unchanged) -> existing graph checks run as today
```

**UC-03, per non-schema `worker()` call:**
```
extractMarkdownDocument(text):
  _hasUnfencedHeading(text)? yes -> return as-is (unchanged)
  _unwrapWholeResponseFence(text) -> closed fence found + reveals heading? -> return it (unchanged)
  _stripUnclosedLeadingFence(text) -> first line opens a fence, NO close anywhere -> strip it
    -> reveals heading? -> return the stripped remainder (NEW)
  none of the above -> return text unchanged (unchanged)
```

**UC-04, per per-component/per-UC loop iteration:**
```
pm-phase1.js: dispatch worker -> isValidComponentDetail(detail) / isValidUseCaseFile(detail, id)?
  valid -> write to disk, continue to next item (unchanged happy path)
  invalid -> retry once (identical prompt) -> valid this time? -> write, continue
                                            -> still invalid -> throw, naming the specific item
```

## 3. Backend

### lib/workflow-control.js

## Algorithm

**Edit 1 — the attempt loop** (replaces `lib/workflow-control.js:185-206`):

```js
// Retry a bounded number of times, for either of two recognizable, safe-to-retry conditions:
// (a) a transient CLI/SDK-level infrastructure failure ("API Error: ..."), or (b) — added by
// FTR-029 — a schema-required attempt that comes back a clean exit but with no usable structured
// output even after the existing extractDelimitedStructuredOutput fallback. (b) was, until this
// feature, treated as a permanent content defect never worth retrying — confirmed EMPIRICALLY
// WRONG for at least one real, reproducible case: gaia-validate-feature-docs consistently replies
// with a logically-complete JSON candidate (valid/findings/report present) that simply omits two
// now-optional boolean fields (needsRequirementsFix/needsTechSpecFix) the schema used to require
// unconditionally — relaxing the schema (see Edit 2 in components/pm-phase1.js.md) already fixes
// THAT specific case on the first attempt, with zero retry; this retry trigger is deliberately
// kept as defense in depth for a genuinely different, not-yet-evidenced failure shape (e.g.
// `report` itself missing, or no JSON embedded anywhere). Confirmed safe to retry for the same
// reason the transient-API-error retry already is: every agent dispatched through this path is
// read-only by design, so there is no partial side effect to clean up.
let result;
let accumulatedTokens = 0;
const attempts = [];
let currentPrompt = prompt;
for (let attempt = 1; attempt <= WORKER_MAX_ATTEMPTS; attempt++) {
  result = await (options.dispatch || spawnClaudeAgent)({
    claudePath: options.claudePath, cwd: root, args: cliArgs, prompt: currentPrompt,
    taskTimeoutMs: options.taskTimeoutMs || 1800000,
  });
  const usage = result.result?.usage;
  const counts = usage && [usage.input_tokens, usage.output_tokens,
    usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0];
  const tokens = counts && counts.every(n => Number.isInteger(n) && n >= 0)
    ? counts.reduce((a, b) => a + b, 0) : null;
  const attemptTokens = Number.isSafeInteger(tokens) && tokens > 0 ? tokens : null;
  if (attemptTokens) accumulatedTokens += attemptTokens;
  attempts.push({ attempt, exitCode: result.exitCode, isError: result.result?.is_error ?? null,
    resultPreview: typeof result.result?.result === 'string' ? result.result.result.slice(0, 300) : null,
    tokens: attemptTokens });
  evidence.save({ attempts });
  const transientApiError = _isTransientWorkerApiError(result);
  const missingStructuredOutput = !!opts.schema && _isMissingStructuredOutput(result, opts.schema);
  if ((!transientApiError && !missingStructuredOutput) || attempt === WORKER_MAX_ATTEMPTS) break;
  if (missingStructuredOutput) {
    currentPrompt = `${prompt}\n\n${STRUCTURED_OUTPUT_RETRY_NUDGE}`;
    await _sleep(STRUCTURED_OUTPUT_RETRY_BACKOFF_MS);
  } else {
    await _sleep(WORKER_RETRY_BACKOFF_MS[attempt - 1]);
  }
}
```

**Implementation refinements found while coding (not anticipated at Tech-Spec time):**

1. **Distinguishing "no JSON at all" from "a candidate exists but fails schema".** The original
   design reused `extractDelimitedStructuredOutput`'s own null result as the sole retry trigger —
   but that function also returns null when a candidate WAS found and parsed as JSON, just didn't
   match the schema (e.g. a `<structured_output>` tag whose JSON has the wrong field names). That
   case is a deterministic content defect (feature.md's own stated boundary: "never retried"), not
   the same as genuinely missing output — confirmed by a real pre-existing test
   (`'a <structured_output> tag that fails schema validation still fails closed'`) that started
   failing (now wrongly retried) without this distinction. Fixed by refactoring candidate
   collection out of `extractDelimitedStructuredOutput` into `_collectJsonCandidates(text)`, and
   adding `_hasAnyParseableJsonCandidate(text)` (same candidates, JSON-parse only, schema-blind) so
   `_isMissingStructuredOutput` only retries when NO JSON-shaped candidate exists anywhere.
2. **A separate, near-zero backoff for this retry trigger.** Reusing `WORKER_RETRY_BACKOFF_MS`
   (5s/20s — designed to wait out a transient network condition) made every genuinely-unrecoverable
   schema-required call cost ~25 real seconds before failing, with no corresponding benefit (there
   is no network condition to wait out for a missing-structured-output retry) — confirmed by a
   pre-existing test timing out at Jest's 5s default. Added `STRUCTURED_OUTPUT_RETRY_BACKOFF_MS = 0`
   as its own constant, used only for this trigger; the transient-API-error retry's own backoff is
   unchanged.

```js
// A clean-exit attempt (never a protocol-level failure — that's handled separately, after the
// loop, by the existing exitCode/parseError/timedOut/is_error check) whose structured_output is
// empty AND whose text contains NO JSON-shaped candidate at all — never a candidate that exists
// but fails schema validation (wrong field names/types), which is a deterministic content defect
// that would just fail the same way again, not worth retrying.
function _isMissingStructuredOutput(result, schema) {
  if (result.exitCode !== 0 || result.parseError || result.timedOut ||
      !result.result || result.result.is_error !== false) return false;
  if (result.result.structured_output != null) return false;
  if (typeof result.result.result !== 'string') return true;
  if (extractDelimitedStructuredOutput(result.result.result, schema) != null) return false;
  return !_hasAnyParseableJsonCandidate(result.result.result);
}

const STRUCTURED_OUTPUT_RETRY_NUDGE = 'Your previous response did not populate the required ' +
  'structured JSON output via the --json-schema tool-call channel. You MUST return your final ' +
  'answer ONLY as that structured output — do not narrate it in prose or wrap it in a Markdown ' +
  'code fence in your visible reply.';
// No network condition to wait out here (unlike a transient API error) — immediate retry.
const STRUCTURED_OUTPUT_RETRY_BACKOFF_MS = 0;
```

Refactor `extractDelimitedStructuredOutput` to share candidate collection:

```js
function _collectJsonCandidates(text) {
  const candidates = [];
  for (const m of [...text.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].reverse()) candidates.push(m[2]);
  for (const m of [...text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)].reverse()) candidates.push(m[1]);
  for (const start of [...text.matchAll(/```json|<json>/gi)].map(m => m.index + m[0].length).reverse()) {
    const tail = text.slice(start);
    const first = tail.indexOf('{');
    const last = tail.lastIndexOf('}');
    if (first !== -1 && last > first) candidates.push(tail.slice(first, last + 1));
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  return candidates;
}
function extractDelimitedStructuredOutput(text, schema) {
  for (const raw of _collectJsonCandidates(text)) {
    const trimmed = raw.trim();
    let parsed;
    try { parsed = JSON.parse(trimmed); }
    catch (e) {
      try { parsed = JSON.parse(_repairUnescapedControlCharsInStrings(trimmed)); }
      catch (e2) { continue; }
    }
    try { validateSchema(parsed, schema); return parsed; }
    catch (e) { /* try the next candidate, or fall through to null */ }
  }
  return null;
}
function _hasAnyParseableJsonCandidate(text) {
  for (const raw of _collectJsonCandidates(text)) {
    const trimmed = raw.trim();
    try { JSON.parse(trimmed); return true; } catch (e) {}
    try { JSON.parse(_repairUnescapedControlCharsInStrings(trimmed)); return true; } catch (e2) {}
  }
  return false;
}
```

Also update the retry loop's own leading comment (currently `lib/workflow-control.js:172-184`,
"Retry a bounded number of times, but ONLY for a recognizable transient infrastructure failure...
never a permission denial, schema violation...") to describe both triggers.

**Edit 2 — `extractMarkdownDocument`** (extends `lib/workflow-control.js:522-543`):

```js
// UC-03: an unclosed whole-response fence wrap (the model opens a ```fence — possibly after some
// conversational preamble, same as the existing closed-fence case already tolerates — but the
// response simply ends without a matching close) defeats _unwrapWholeResponseFence entirely (no
// closing line to match against) AND _hasUnfencedHeading (fence depth never returns to zero,
// hiding every real heading after the opener). Scans for the FIRST fence-open marker ANYWHERE in
// the text (not just the first line — found necessary while testing: a realistic response has
// prose BEFORE the fence opens, mirroring _unwrapWholeResponseFence's own tolerance for preamble).
// If no line anywhere after it closes a fence of that same length, the opener is the only defect —
// strip everything up to and including that line. Same "always re-validate the candidate"
// discipline as the existing unwrap.
function _stripUnclosedLeadingFence(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const openMatch = lines[i].match(/^(`{3,})\S*\s*$/);
    if (!openMatch) continue;
    const fenceLen = openMatch[1].length;
    let closesSomewhere = false;
    for (let j = i + 1; j < lines.length; j++) {
      const closeMatch = lines[j].match(/^(`{3,})\s*$/);
      if (closeMatch && closeMatch[1].length === fenceLen) { closesSomewhere = true; break; }
    }
    if (!closesSomewhere) return lines.slice(i + 1).join('\n').trim() + '\n';
    return null; // the first fence-opener found DOES close somewhere — not this case
  }
  return null;
}
function extractMarkdownDocument(text) {
  if (_hasUnfencedHeading(text)) return text;
  const unwrapped = _unwrapWholeResponseFence(text);
  if (unwrapped != null && _hasUnfencedHeading(unwrapped)) return unwrapped;
  const stripped = _stripUnclosedLeadingFence(text);
  if (stripped != null && _hasUnfencedHeading(stripped)) return stripped;
  return text;
}
```

### src/claude/workflows/pm-phase1.js

## Algorithm

**Edit 1 — validator schema** (the `required` array only; everything else about this call, already
established by FTR-028, is unchanged):

```js
// before:
required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']
// after:
required: ['valid', 'findings', 'report']
```

```js
// needsRequirementsFix/needsTechSpecFix stay declared in `properties` (still type-checked when
// present) but are no longer hard-required — confirmed against three real evidence files that the
// model reasonably omits both when there is nothing to fix; the host's own merge logic already
// treats an absent value as falsy (`result.needsRequirementsFix || ...`, `result.needsTechSpecFix
// || ...`, both already present from FTR-028), so no further change is needed here.
```

**Edit 2 — per-component loop** (replaces `pm-phase1.js:439-445`):

```js
const COMPONENT_RETRY_ATTEMPTS = 2 // fixed, not externally configurable (feature.md precedent)
for (const comp of components) {
  const compPath = `${specDir}/components/${comp.fileSlug}`
  if (!regenSkeleton && c.exists(compPath) && isValidComponentDetail(c.read(compPath))) continue // resume: skip, no dispatch
  let detail, valid = false
  for (let attempt = 1; attempt <= COMPONENT_RETRY_ATTEMPTS && !valid; attempt++) {
    detail = await c.worker(specComponentId, buildComponentPrompt(comp, components, featurePath, componentTemplate),
      { label: `tech-spec-component:${comp.fileSlug}:${attempt}` })
    valid = isValidComponentDetail(detail)
  }
  if (!valid) throw new Error(`Tech-Spec component "${comp.filePath}" (${comp.fileSlug}) failed structural validation after ${COMPONENT_RETRY_ATTEMPTS} attempts — missing a real "## Change"/"## Tests" heading`)
  c.writeOutput(compPath, detail)
}
```

**Edit 3 — per-UC loop** (replaces `pm-phase1.js:193-202`), same shape, reusing
`isValidUseCaseFile`:

```js
const USE_CASE_RETRY_ATTEMPTS = 2 // fixed, not externally configurable
for (const row of ucTable) {
  const ucPath = `${reqDir}/${row.file}`
  if (!regenSkeleton && c.exists(ucPath) && isValidUseCaseFile(c.read(ucPath), row.id)) continue // resume: skip, no dispatch
  let detail, valid = false
  for (let attempt = 1; attempt <= USE_CASE_RETRY_ATTEMPTS && !valid; attempt++) {
    detail = await c.worker(reqUcId, buildUcPrompt(row, ucTable, featurePath, ucTemplate),
      { label: `requirements-use-case:${row.id}:${attempt}` })
    valid = isValidUseCaseFile(detail, row.id)
  }
  if (!valid) throw new Error(`Requirements use case "${row.id}" failed structural validation after ${USE_CASE_RETRY_ATTEMPTS} attempts — missing the required "### ${row.id}: " heading`)
  c.writeOutput(ucPath, detail.trimEnd() + ucCrossReferences(c.read(reqIndexPath), row.id))
}
```

Both retry loops re-send the IDENTICAL prompt on retry (Open Question 2, resolved: no corrective
nudge for this failure shape — matches the existing transient-API-error retry's own convention; no
evidence yet that a nudge helps here specifically). `COMPONENT_RETRY_ATTEMPTS`/
`USE_CASE_RETRY_ATTEMPTS` are placed as top-level constants near the top of the file (alongside
`valId`/`output`), not inline, consistent with this file's own organization.

**Pre-existing tests updated (found while implementing, not anticipated at Tech-Spec time):** 4
tests in `tests/integration/workflow-runtime.test.js` asserted the OLD 5-field `required` array
(`['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']`) either directly
(`expect(schema.required).toEqual([...])`) or via the exact `"expected fields: ..."` substring in
the thrown error message — all 4 updated to the new 3-field array
(`['valid', 'findings', 'report']`), consistent with Edit 1 above. No other existing test asserted
the schema's exact shape.

### src/claude/scripts/req-assembler.js

## Algorithm

Add near `parseTableRows` (currently `req-assembler.js:32-39`):

```js
// Returns the raw header-row cells for the first Markdown table found inside [start, end), or
// null if no table is present at all. Companion to parseTableRows, which deliberately discards
// this same row — UC-02's AC-table header validation needs it back.
function parseTableHeader(lines, start, end) {
  const tableLines = lines.slice(start, end).filter(l => l.trim().startsWith('|'))
  if (tableLines.length < 1) return null
  return tableLines[0].split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
}
```

Export it alongside the existing `findSectionRange`/`parseTableRows`:

```js
module.exports = {
  loadRequirements,
  parseUseCaseIndexTable,
  parseAcTable,
  parseBusinessRulesTable,
  spliceSection2,
  findSectionRange,
  parseTableRows,
  parseTableHeader,
  AssemblyError,
}
```

No change to `parseAcTable`, `loadRequirements`, or any other existing export — this is a pure
addition.

### src/claude/scripts/req-graph-checks.js

## Algorithm

Add near the existing check functions (`checkUniqueUcIds`, `checkUcIdFormat`, etc.):

```js
// UC-02: the AC table's first 3 columns must be exactly "ID", "Criterion", "Related UC" in that
// order — mirrors wb-graph-checks.js's own identical check for the Work-Breakdown-side AC table
// (same names, same order, same "at least 3 columns" tolerance for a missing trailing Priority
// column). Runs BEFORE req-assembler.js's parseAcTable positional destructure, so a malformed
// header is reported as its own distinct, correctly-attributed error instead of a misleading
// downstream DANGLING_AC_UC_REFERENCE (the real incident this closes: a 5-column table shifted
// every cell, silently misattributing "When [...]" text into the Related UC field).
function checkAcTableHeader(headerCells) {
  if (!headerCells || headerCells.length < 3) {
    return [{
      category: 'MALFORMED_AC_TABLE_HEADER', severity: 'error',
      message: `AC table header has fewer than 3 columns (found ${headerCells ? headerCells.length : 0})`,
    }]
  }
  if (headerCells[0] !== 'ID' || headerCells[1] !== 'Criterion' || headerCells[2] !== 'Related UC') {
    return [{
      category: 'MALFORMED_AC_TABLE_HEADER', severity: 'error',
      message: `AC table columns must be "ID", "Criterion", "Related UC" in order; got "${headerCells[0]}", "${headerCells[1]}", "${headerCells[2]}"`,
    }]
  }
  return []
}
```

Export it alongside the existing functions:

```js
module.exports = {
  checkUniqueUcIds,
  checkUcIdFormat,
  checkUcTableFileParity,
  checkCrossReferencesResolve,
  checkAcTableHeader,
}
```

### src/claude/scripts/req-skeleton-check.js

## Algorithm

Replace the current parse block (`req-skeleton-check.js:16, 33-41`):

```js
// before:
const { parseUseCaseIndexTable, parseAcTable, parseBusinessRulesTable } = require('./req-assembler')
...
let ucTable, acTable, businessRules
try {
  ucTable = parseUseCaseIndexTable(indexContent)
  acTable = parseAcTable(indexContent)
  businessRules = parseBusinessRulesTable(indexContent)
} catch (e) {
  console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
  process.exit(2)
}

// after:
const { parseUseCaseIndexTable, parseAcTable, parseBusinessRulesTable, findSectionRange, parseTableHeader } = require('./req-assembler')
...
let ucTable, acTable, businessRules
const acHeaderErrors = []
try {
  ucTable = parseUseCaseIndexTable(indexContent)
  const { start, end, lines } = findSectionRange(indexContent, 7)
  acHeaderErrors.push(...graphChecks.checkAcTableHeader(parseTableHeader(lines, start, end)))
  acTable = acHeaderErrors.length ? [] : parseAcTable(indexContent)
  businessRules = parseBusinessRulesTable(indexContent)
} catch (e) {
  console.log(JSON.stringify({ valid: false, errors: [{ message: `parse failure: ${e.message}` }] }))
  process.exit(2)
}
```

And fold `acHeaderErrors` into the existing unified `errors` array (`req-skeleton-check.js:49-58`):

```js
const errors = [
  ...acHeaderErrors,
  ...graphChecks.checkUniqueUcIds({ ucIds }),
  ...graphChecks.checkUcIdFormat({ ucIds }),
  ...graphChecks.checkUcTableFileParity({ ucIds }, existingUcFiles),
  ...graphChecks.checkCrossReferencesResolve({
    ucIds,
    acTable: acTable.map(a => ({ id: a.id, relatedUc: a.relatedUc })),
    businessRules: businessRules.map(b => ({ id: b.id, appliesTo: b.appliesTo })),
  }),
]
```

With `acTable` forced to `[]` on a malformed header, `checkCrossReferencesResolve`'s own
`acTable`-related checks correctly produce zero additional (and potentially misleading) findings
for that run — the `MALFORMED_AC_TABLE_HEADER` error is the only signal, not buried among a cascade
of `DANGLING_AC_UC_REFERENCE` noise from garbage-parsed data.

### src/claude/agents/gaia-generate-requirements.md

## Algorithm

Replace the Section 7 example (`gaia-generate-requirements.md:124-130`):

```markdown
# before:
## 7. Acceptance Criteria

For each use case, define testable acceptance criteria:

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given [context], when [action], then [result] | UC-01 |

# after:
## 7. Acceptance Criteria

For each use case, define testable acceptance criteria. Use the EXACT 4-column shape below — do
not add, remove, split, or reorder columns; the host's positional parser requires this exact shape:

| ID | Criterion | Related UC | Priority |
|----|-----------|-------------|----------|
| AC-01 | Given [context], when [action], then [result] | UC-01 | Must |
```

No other part of this agent's own instructions changes — this is a one-section text correction.

## 4. Frontend

_No components in this category._

## 5. External Integrations

### tests/req-assembler.test.js

## Algorithm

```js
describe('parseTableHeader()', () => {
  test('returns the header cells for a well-formed table', () => {
    const content = '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC | Priority |\n|---|---|---|---|\n| AC-01 | x | UC-01 | Must |\n'
    const { start, end, lines } = findSectionRange(content, 7)
    expect(parseTableHeader(lines, start, end)).toEqual(['ID', 'Criterion', 'Related UC', 'Priority'])
  })

  test('returns null for a section with no table at all', () => {
    const content = '## 7. Acceptance Criteria\n\nNo table here.\n'
    const { start, end, lines } = findSectionRange(content, 7)
    expect(parseTableHeader(lines, start, end)).toBeNull()
  })

  test('excludes the separator row from its result', () => {
    const content = '## 7. Acceptance Criteria\n\n| ID | Criterion | Related UC |\n|---|---|---|\n| AC-01 | x | UC-01 |\n'
    const { start, end, lines } = findSectionRange(content, 7)
    const header = parseTableHeader(lines, start, end)
    expect(header).toEqual(['ID', 'Criterion', 'Related UC'])
    expect(header).not.toContain('---')
  })
})
```

### tests/req-graph-checks.test.js

## Algorithm

```js
describe('checkAcTableHeader()', () => {
  test('a correct 4-column header produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC', 'Priority'])).toEqual([])
  })

  test('a correct 3-column header (no trailing Priority) also produces no errors', () => {
    expect(checkAcTableHeader(['ID', 'Criterion', 'Related UC'])).toEqual([])
  })

  test('fewer than 3 columns produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Criterion'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })

  test('a 5-column header (Given/When/Then split) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(['ID', 'Given', 'When', 'Then', 'Priority'])
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
    expect(errors[0].message).toContain('"ID", "Given", "When"')
  })

  test('null header (no table found) produces one MALFORMED_AC_TABLE_HEADER error', () => {
    const errors = checkAcTableHeader(null)
    expect(errors).toHaveLength(1)
    expect(errors[0].category).toBe('MALFORMED_AC_TABLE_HEADER')
  })
})
```

### tests/integration/workflow-runtime.test.js

## Algorithm

```js
describe('FTR-029 — validator schema no longer requires needsRequirementsFix/needsTechSpecFix', () => {
  test('a clean validator response omitting both fields still reaches Gate 1', async () => {
    const dispatch = async options => {
      if (options.args.includes('gaia-validate-feature-docs')) {
        const r = success('# Result\n');
        r.result.structured_output = { valid: true, findings: [], report: '# Result\n' }; // no needsRequirementsFix/needsTechSpecFix at all
        return r;
      }
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(result.validation.summary).toContain('clean');
  });

  test('a response that DOES include both fields with the correct type is still validated when present', async () => {
    const dispatch = async options => {
      if (options.args.includes('gaia-validate-feature-docs')) {
        const r = success('# Result\n');
        r.result.structured_output = { valid: true, findings: [], needsRequirementsFix: false, needsTechSpecFix: false, report: '# Result\n' };
        return r;
      }
      return phase1Dispatch(options);
    };
    const result = await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(result.validation.summary).toContain('clean');
  });
});

describe('FTR-029 — fail fast on an invalid per-item generation result (UC-04)', () => {
  test('an invalid component on the first attempt, valid on retry, is written and used — no error', async () => {
    let callCount = 0;
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec-component') {
        callCount++;
        return success(callCount === 1
          ? '# a.js — New\n\nNo Change heading here.\n' // invalid: missing "## Change"
          : techSpecComponentDetailDoc()); // valid on retry
      }
      return phase1Dispatch(options);
    };
    await runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch });
    expect(callCount).toBe(2);
    expect(fs.readFileSync(path.join(f.dir, 'spec', 'components', 'a.js.md'), 'utf8')).toContain('## Change');
  });

  test('an invalid component on both attempts throws immediately, naming it, before any later component dispatches', async () => {
    const twoComponentsTable = '### New files\n| Path | Purpose | Addresses | Domain | Spec |\n|---|---|---|---|---|\n'
      + '| a.js | example a | AC-01 | BE | [components/a.js.md](components/a.js.md) |\n'
      + '| b.js | example b | AC-01 | BE | [components/b.js.md](components/b.js.md) |\n\n'
      + '### Modified files\n| Path | Change description | Addresses | Domain | Spec |\n|---|---|---|---|---|\n';
    const twoComponentSkeletonDoc = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      return n === 9 ? `## 9. File Inventory\n\n${twoComponentsTable}` : `## ${n}. Section ${n}\n`;
    }).join('\n');
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-tech-spec') return success(twoComponentSkeletonDoc);
      if (name === 'gaia-generate-tech-spec-component') {
        if (options.prompt.includes('Path: a.js')) return success('# a.js — New\n\nAlways invalid.\n');
        return success(techSpecComponentDetailDoc());
      }
      return phase1Dispatch(options);
    };
    const dispatchFn = jest.fn(dispatch);
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch: dispatchFn }))
      .rejects.toThrow(/a\.js.*failed structural validation after 2 attempts/);
    const calledAgents = dispatchFn.mock.calls.map(([o]) => o.args[o.args.indexOf('--agent') + 1]);
    // b.js must never have been dispatched — the loop stopped at a.js, the item that failed
    expect(dispatchFn.mock.calls.filter(([o]) => o.prompt?.includes('Path: b.js')).length).toBe(0);
  });

  test('an invalid use case on both attempts throws immediately, naming it', async () => {
    const dispatch = async options => {
      const name = options.args[options.args.indexOf('--agent') + 1];
      if (name === 'gaia-generate-requirements-use-case') return success('### UC-02: Wrong use case\n\nAlways invalid.\n');
      return phase1Dispatch(options);
    };
    await expect(runWorkflow('pm-phase1', [f.feature], { ...f.options, dispatch }))
      .rejects.toThrow(/UC-01.*failed structural validation after 2 attempts/);
  });
});
```

### tests/cli/workflow-worker-contract.test.js

## Algorithm

Added to the existing `extractMarkdownDocument` describe block:

```js
test('an unclosed whole-response fence wrap is recovered (opener stripped, real heading revealed)', async () => {
  const unclosed = 'The validation is complete. Here is my component.\n\n```markdown\n'
    + '# src/x.js — New\n\n## Change\n\nExample change.\n\n## Tests\n\nExample tests.\n';
    // deliberately NO closing ``` — the model's turn simply ends
  const c = createControl({ ...f.options, dispatch: async () => response({ result: unclosed }) });
  const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
  expect(detail).toContain('## Change');
  expect(detail).toContain('## Tests');
  expect(detail).not.toContain('Here is my component');
  expect(detail).not.toMatch(/^```/);
});

test('an unclosed fence whose remainder reveals no heading is left unchanged (no false-positive strip)', async () => {
  const noHeadingAfterStrip = '```\njust some code, not a real document, never closed\n';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: noHeadingAfterStrip }) });
  const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
  expect(detail).toBe(noHeadingAfterStrip);
});

test('a closed whole-response fence wrap is still recovered (regression, v0.19.2 behavior unchanged)', async () => {
  const closed = 'Perfect! Let me write this.\n\n```markdown\n# src/z.js — New\n\n## Change\n\nx.\n\n## Tests\n\ny.\n```';
  const c = createControl({ ...f.options, dispatch: async () => response({ result: closed }) });
  const detail = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test'));
  expect(detail).toContain('## Change');
  expect(detail).not.toContain('Perfect! Let me write this');
});
```

New describe block for UC-01's secondary retry (placed near the other `worker()`-level tests in
this file):

```js
describe('worker() missing-structured-output retry (FTR-029)', () => {
  const schema = { type: 'object', properties: { valid: { type: 'boolean' } }, required: ['valid'] };

  test('a clean-exit attempt with no recoverable structured output is retried with a corrective nudge', async () => {
    let callCount = 0;
    const dispatch = async ({ prompt }) => {
      callCount++;
      if (callCount === 1) {
        expect(prompt).not.toContain('did not populate the required');
        return response({ result: 'I need more time to think about this.' }); // no JSON at all
      }
      expect(prompt).toContain('did not populate the required'); // the nudge was appended
      return response({ structured_output: { valid: true } });
    };
    const c = createControl({ ...f.options, dispatch });
    const result = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema }));
    expect(result.valid).toBe(true);
    expect(callCount).toBe(2);
  });

  test('a response recoverable via the existing text fallback is NOT retried', async () => {
    const dispatch = async () => response({ result: '```json\n{"valid": true}\n```' });
    const dispatchFn = jest.fn(dispatch);
    const c = createControl({ ...f.options, dispatch: dispatchFn });
    const result = await c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema }));
    expect(result.valid).toBe(true);
    expect(dispatchFn).toHaveBeenCalledTimes(1);
  });

  test('exhausting every attempt without usable structured output still throws the existing error', async () => {
    const dispatch = async () => response({ result: 'Still no JSON.' });
    const c = createControl({ ...f.options, dispatch });
    await expect(c.run('pm-phase1', f.dir, 'FTR-099', () => c.worker(id, 'test', { schema })))
      .rejects.toThrow('Worker returned no structured output');
  });
});
```

### tests/req-skeleton-check.test.js

## Algorithm

New fixtures under `tests/fixtures/`, mirroring the existing `ftr-021-req-*` naming convention:

- `ftr-029-req-malformed-ac-header/index.md` — Section 7's AC table has 5 columns
  (`ID | Given | When | Then | Priority`), otherwise a clean, complete skeleton (reusing the
  existing `ftr-021-req-clean` fixture's other sections).
- `ftr-029-req-ac-header-no-priority/index.md` — Section 7's AC table has exactly 3 columns
  (`ID | Criterion | Related UC`, no `Priority`) — the BR-03 tolerance case.

```js
test('exits 1 with MALFORMED_AC_TABLE_HEADER on a malformed AC table header, no dangling-reference noise', () => {
  const { exitCode, report } = run('ftr-029-req-malformed-ac-header/index.md')
  expect(exitCode).toBe(1)
  expect(report.valid).toBe(false)
  expect(report.errors.some(e => e.category === 'MALFORMED_AC_TABLE_HEADER')).toBe(true)
  expect(report.errors.some(e => e.category === 'DANGLING_AC_UC_REFERENCE')).toBe(false)
})

test('exits 0 on an AC table missing only the trailing Priority column', () => {
  const { exitCode, report } = run('ftr-029-req-ac-header-no-priority/index.md')
  expect(exitCode).toBe(0)
  expect(report.valid).toBe(true)
})
```

## 6. Security Considerations

None — internal toolkit workflow change, no new external surface, no new input-validation
boundary beyond UC-02's own structural check (which only ever makes an existing positional parse
MORE strict, never less).

## 7. Database Changes

None.

## 8. Configuration

None — UC-01's secondary retry and UC-04's bounded retry are both fixed code constants (not
environment variables or settings-file options), per `feature.md`'s own "no real evidence yet
justifies external tuning" precedent.

## 9. File Inventory

### New files
| Path | Purpose-or-Change | Addresses |
|---|---|---|


### Modified files
| Path | Purpose-or-Change | Addresses |
|---|---|---|
| lib/workflow-control.js | `gaia-validate-feature-docs`'s schema-required worker handling gains a bounded secondary retry (missing-structured-output trigger + corrective nudge); `extractMarkdownDocument` gains `_stripUnclosedLeadingFence` for an unclosed whole-response fence wrap | AC-03, AC-04, AC-08, AC-09 |
| src/claude/workflows/pm-phase1.js | `gaia-validate-feature-docs`'s worker schema drops `needsRequirementsFix`/`needsTechSpecFix` from `required`; per-component and per-UC generation loops validate immediately after dispatch with one bounded retry, failing fast and attributably on a second failure | AC-01, AC-02, AC-10, AC-11, AC-12 |
| src/claude/scripts/req-assembler.js | New `parseTableHeader(lines, start, end)`, exported alongside the existing `findSectionRange`/`parseTableRows` | AC-05, AC-06 |
| src/claude/scripts/req-graph-checks.js | New `checkAcTableHeader(headerCells)` pure check function, mirroring `wb-graph-checks.js`'s existing AC-table header check | AC-05, AC-06 |
| src/claude/scripts/req-skeleton-check.js | Calls `parseTableHeader`/`checkAcTableHeader` on the AC table BEFORE `parseAcTable`'s positional destructure; folds the result into the existing unified `errors[]` output | AC-05, AC-06 |
| tests/req-assembler.test.js | New direct unit test for `parseTableHeader` | AC-05, AC-06 |
| tests/req-graph-checks.test.js | New direct unit test for `checkAcTableHeader` | AC-05, AC-06 |
| src/claude/agents/gaia-generate-requirements.md | Inline AC-table example corrected from a stale 3-column shape to the real, authoritative 4-column template | AC-07 |
| tests/integration/workflow-runtime.test.js | New tests for AC-01 through AC-04 (schema relaxation + secondary retry), AC-10 through AC-12 (fail-fast per-item validation) | AC-01, AC-02, AC-03, AC-04, AC-10, AC-11, AC-12 |
| tests/cli/workflow-worker-contract.test.js | New tests for AC-08/AC-09 (unclosed-fence recovery) directly against `extractMarkdownDocument`'s own existing describe block | AC-08, AC-09 |
| tests/req-skeleton-check.test.js | New/updated tests for AC-05, AC-06 against the real `req-skeleton-check.js` CLI (or its real exported functions, whichever this file's own existing convention already uses) | AC-05, AC-06 |

## 10. Testing Strategy

### lib/workflow-control.js

See `components/workflow-runtime.test.js.md` (AC-01 through AC-04, end-to-end against the real
`pm-phase1` dispatch path) and `components/workflow-worker-contract.test.js.md` (AC-08/AC-09,
direct unit coverage of `extractMarkdownDocument`'s new strategy; a pre-existing test
(`'structured-output failure retains token usage and raw-response diagnostics'`) was updated — 3
attempts now accumulate instead of 1 — and another
(`'a <structured_output> tag that fails schema validation still fails closed'`) needed no change
once the candidate-vs-schema distinction above was added).

### src/claude/workflows/pm-phase1.js

See `components/workflow-runtime.test.js.md` for the full list of new integration tests
(AC-01, AC-02, AC-10, AC-11, AC-12).

### src/claude/scripts/req-assembler.js

`tests/req-assembler.test.js` (pre-existing, real `require()` of this module — not a mirror) gains
a direct unit test for `parseTableHeader`: returns the header cells for a well-formed table, returns
`null` for a section with no table at all, and correctly excludes the separator row (`|---|---|`)
from its result. Also exercised indirectly through `components/req-skeleton-check.test.js.md`'s
real CLI-level fixtures.

### src/claude/scripts/req-graph-checks.js

`tests/req-graph-checks.test.js` (pre-existing, real `require()` of this module) gains direct unit
tests for `checkAcTableHeader`: a correct 4-column header produces no errors; a correct 3-column
header (no trailing `Priority`) also produces no errors (BR-03's own tolerance); fewer than 3
columns, or the first 3 not exactly `ID`/`Criterion`/`Related UC` in order, each produce exactly one
`MALFORMED_AC_TABLE_HEADER` error with a precise message.

### src/claude/scripts/req-skeleton-check.js

See `components/req-skeleton-check.test.js.md` for the new end-to-end CLI fixture tests.

### tests/req-assembler.test.js

This component *is* the test file — no further test file covers it.

### tests/req-graph-checks.test.js

This component *is* the test file — no further test file covers it.

### src/claude/agents/gaia-generate-requirements.md

`tests/frontmatter/agents.test.js` continues to structurally validate this file's frontmatter
unmodified. See `components/req-skeleton-check.test.js.md` for the deterministic structural check
(UC-02) that is the actual enforcement mechanism regardless of whether this prompt correction alone
fully prevents a future drift.

### tests/integration/workflow-runtime.test.js

This component *is* the test file — no further test file covers it.

### tests/cli/workflow-worker-contract.test.js

This component *is* the test file — no further test file covers it.

### tests/req-skeleton-check.test.js

This component *is* the test file — no further test file covers it.

## 11. Implementation Order

1. `src/claude/scripts/req-assembler.js` — depends on: nothing (`parseTableHeader` is a pure
   addition alongside existing exports)
2. `src/claude/scripts/req-graph-checks.js` — depends on: nothing (`checkAcTableHeader` is a pure,
   standalone function; independent of 1, both needed before 3)
3. `src/claude/scripts/req-skeleton-check.js` — depends on: 1, 2
4. `src/claude/agents/gaia-generate-requirements.md` — depends on: nothing (independent prompt-text
   correction)
5. `lib/workflow-control.js` — depends on: nothing (both its own changes — the secondary retry and
   the unclosed-fence recovery — are independent of the Requirements-side work above)
6. `src/claude/workflows/pm-phase1.js` — depends on: 5 (the schema relaxation is a change to a
   literal this file owns, but conceptually completes UC-01 which 5's retry mechanism also serves)
7. `tests/req-assembler.test.js` — depends on: 1
8. `tests/req-graph-checks.test.js` — depends on: 2
9. `tests/req-skeleton-check.test.js` — depends on: 1, 2, 3
10. `tests/cli/workflow-worker-contract.test.js` — depends on: 5
11. `tests/integration/workflow-runtime.test.js` — depends on: 5, 6

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Relaxing `needsRequirementsFix`/`needsTechSpecFix` out of `required` could mask a genuinely confused model response that omits them for a WRONG reason (not "nothing to fix") | A response treated as having nothing to fix when it actually does | Accepted: `valid`/`findings` are still required and still the authoritative signal; a model reporting `valid: false` with real findings but omitting the fix-routing booleans already falls back safely — the host's `||`-based merge treats an absent flag as `false`, and if NEITHER flag ends up true while gaps remain, the pre-existing "reported gaps on cycle N but flagged neither document for revision" error already fires, unchanged |
| UC-04's bounded retry doubles the worst-case LLM cost for an occasionally-flaky single item | A feature with many already-invalid-on-first-try items could cost up to 2x for those items | Accepted: bounded to exactly 1 retry (not unbounded), and only pays this cost for an item that was ALREADY going to fail the run entirely today — strictly cheaper than today's "every other item gets generated first, THEN the whole run fails anyway" |
| UC-03's unclosed-fence stripping could, in a pathological case, strip a LEGITIMATE leading fence that was never meant to wrap the whole response | Content loss if the real document's own first line coincidentally is an unclosed fence | Mitigated: the stripped candidate is only used if it reveals a real heading (`_hasUnfencedHeading`) — a real Requirements/Tech-Spec/task document always starts with a `#`/`##` heading, never a bare code block, so this re-validation gate makes a false-positive strip exceedingly unlikely in practice, consistent with every other recovery function in this file already accepting this same trade-off |

## Open Questions

| # | Question | Status | Decision / Note |
|---|----------|--------|-----------------|
| 1 | Exact wording of UC-01's secondary corrective-nudge sentence | **Resolved** | See `components/workflow-control.js.md`'s own Algorithm section for the literal text |
| 2 | Should UC-04's bounded retry re-send the IDENTICAL prompt, or also append a corrective nudge? | **Resolved** | Identical prompt — matches today's existing transient-API-error retry convention; no evidence yet that a nudge is needed for this failure mode |
| 3 | Where does UC-02's header-check function live? | **Resolved** | `req-graph-checks.js`, consistent with where every other structural check for this document already lives |

## Dependencies and Assumptions

- FTR-023, FTR-025, FTR-027, FTR-028 (available): reused unmodified as described in `req/index.md`'s
  own Dependencies section.
- `lib/workflow-control.js`, `req-skeleton-check.js`, `req-graph-checks.js`, and `req-assembler.js`
  are normal Node modules; `pm-phase1.js` remains a sandboxed workflow script with no `require()` —
  its own changes are inline, no new duplicated logic needed.
- `npm test` is the only verification command; no separate build step exists.
- UC-01 is grounded in three independent real evidence files, two of which were directly inspected
  (raw JSON read, the exact extraction code run against the raw text) during this feature's own
  Requirements/Tech-Spec authoring — not reproduced synthetically first.
