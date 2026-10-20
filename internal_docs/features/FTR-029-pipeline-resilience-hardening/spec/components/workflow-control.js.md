# lib/workflow-control.js — Modified

## Change

Two independent edits:

1. **UC-01's bounded secondary retry.** `worker()`'s attempt loop gains a second retry trigger
   (`_isMissingStructuredOutput`) alongside the existing `_isTransientWorkerApiError`; a retry
   triggered by this new condition appends a corrective nudge to the next attempt's prompt.
2. **UC-03's unclosed-fence recovery.** `extractMarkdownDocument` gains a third recovery strategy,
   `_stripUnclosedLeadingFence`, alongside the existing `_hasUnfencedHeading`/
   `_unwrapWholeResponseFence`.

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

## Tests

See `components/workflow-runtime.test.js.md` (AC-01 through AC-04, end-to-end against the real
`pm-phase1` dispatch path) and `components/workflow-worker-contract.test.js.md` (AC-08/AC-09,
direct unit coverage of `extractMarkdownDocument`'s new strategy; a pre-existing test
(`'structured-output failure retains token usage and raw-response diagnostics'`) was updated — 3
attempts now accumulate instead of 1 — and another
(`'a <structured_output> tag that fails schema validation still fails closed'`) needed no change
once the candidate-vs-schema distinction above was added).
