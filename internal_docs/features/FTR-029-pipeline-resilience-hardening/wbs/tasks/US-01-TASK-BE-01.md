<a id="task-US-01-TASK-BE-01"></a>
### US-01-TASK-BE-01

- **Task ID:** US-01-TASK-BE-01
- **Title:** Add a bounded, nudge-retried second trigger for a missing-structured-output response
- **Outcome:** lib/workflow-control.js's worker() attempt loop gains _isMissingStructuredOutput(result, schema) and STRUCTURED_OUTPUT_RETRY_NUDGE; a clean-exit attempt with no usable structured output (even after extractDelimitedStructuredOutput) is retried, bounded by the existing WORKER_MAX_ATTEMPTS/WORKER_RETRY_BACKOFF_MS, with the nudge appended to the next attempt's prompt
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-03, AC-04
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 26000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** workflow-control
- **Commit subject:** retry a schema-required worker once when structured output is missing, with a corrective nudge

**Implementation notes:**

Full diff per `spec/components/workflow-control.js.md`'s "Edit 1". Replace the attempt loop
(`lib/workflow-control.js:185-206`) with the version shown there (adds `currentPrompt`, computes
`transientApiError`/`missingStructuredOutput` per attempt, breaks on neither being true or on
exhausting `WORKER_MAX_ATTEMPTS`, appends the nudge only when `missingStructuredOutput` triggered
the retry). Add `_isMissingStructuredOutput(result, schema)` near the existing
`_isTransientWorkerApiError` (`lib/workflow-control.js:362-365`), reusing
`extractDelimitedStructuredOutput` itself (not a cheaper proxy) so this retry decision and the
post-loop fallback extraction can never disagree. Add the `STRUCTURED_OUTPUT_RETRY_NUDGE` string
constant near the other retry constants (`WORKER_MAX_ATTEMPTS`/`WORKER_RETRY_BACKOFF_MS`). Update
the retry loop's own leading comment (`lib/workflow-control.js:172-184`) to describe both retry
triggers — do not leave the old "ONLY for a recognizable transient infrastructure failure... never
a... schema violation" wording in place, since it is now only half-true.

Do NOT touch anything after the loop (the permission-denial check, the exitCode/is_error throw, the
schema/non-schema payload extraction, `validateSchema`) — all unchanged, this task only changes
WHEN a retry happens, never what happens after the loop exits.

**Verification commands:**

```
npm test -- tests/cli/workflow-worker-contract.test.js
```
