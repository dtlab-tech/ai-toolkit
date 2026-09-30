# Deterministic workflow control plane

The toolkit owns workflow execution in Node. An LLM is used only for document
generation, review, and assessment. A workflow script is not a registered worker
agent: never pass `pm-phase1`, `pm-phase2`, `pm-phase3`, `am-phase1`, or `am-phase2`
to `agentType`, `subagent_type`, or Claude's `--agent`.

## Invocation

Reinstall the toolkit runtime assets after upgrading the package. The host rejects
older installed workflows without `controlPlaneVersion: 1`, even if their old
manifest hashes match. Use one installation scope (local or global); ambiguous or
unverified agent installations fail closed.

```text
ai-toolkit workflow run pm-phase1 --project . --claude-path "C:\path\claude.exe" -- "internal_docs/features/FTR-123-example/feature.md"
ai-toolkit workflow run pm-phase2 --project . --claude-path "C:\path\claude.exe" -- "internal_docs/features/FTR-123-example/feature.md"
ai-toolkit workflow run am-phase1 --project . --claude-path "C:\path\claude.exe" -- . --scope=security,devops --prefix ASSESS-123
ai-toolkit workflow run am-phase2 --project . -- --prefix ASSESS-123 --flagged INT-001 --ack "Reviewed by the user"
```

Resolve the actual Claude executable as described in `task-executor-bootstrap.md`.
`--home DIR` is available for explicit installation-scope resolution. Paths are
individual argv elements, never interpolated shell commands. Raw string arguments
in the JavaScript API support quoted paths and preserve Windows backslashes.

Exit 0 returns a JSON payload on stdout. A nonzero exit stops the pipeline; do not
present the next approval gate. Gate 1/Gate 2 and Findings Gate decisions remain in
the main loop. `am-phase2` requires explicit acknowledgement and a validated
intervention selection; it does not invent approval.

`pm-phase3` is a retired compatibility entry point and refuses execution. Since
FTR-018, implementation belongs to `ai-toolkit tasks start/run`, with its task
ownership, checkpoints, verification, review and resume protocol. The old workflow
must not provide a fallback execution path. No JobScheduler feature is involved
in this migration.

## Audit and replacements

| Original location | Deterministic operation formerly delegated to `agent()` | Replacement |
|---|---|---|
| pm-phase1 | agent resolution; self/worker ledger open/close | Verified host dispatch and owned activity lifecycle |
| pm-phase1 | feature discovery, prefix, existence/mtime checks, ledger creation | Direct filesystem operations; freshness includes upstream documents; corrupt ledgers are preserved and rejected |
| pm-phase1 | validation report existence/fabrication, process log writes | Require a nonempty fresh report from the validator; append log directly; structured validation verdict |
| pm-phase2 | resolution and ledger operations | Same host lifecycle; unsuccessful results cannot close the owner as done |
| pm-phase2 | validator/renderer execution, exit/output parsing and file checks | Toolkit CLI subprocess, `shell: false`, argv arrays, actual exit status, JSON parsing and disk reads |
| pm-phase2 | raw pricing read, WB metrics, Token/Effort estimates, process log | Direct JSON reads and deterministic templates; unavailable usage/cost stays unavailable |
| pm-phase3 | resolution, all ledger mutations, raw CSV/ledger/pricing reads, issue counts, test/git/PR commands, actuals writes | Legacy execution removed; implementation and CSV parsing already belong to the FTR-018 executor |
| am-phase1 | discovery CLI, catalog/file reads, scope filtering, estimates/index counts | Canonical assessor map, verified resolution, strict scope filtering and deterministic Markdown parsing/templates |
| am-phase2 | approval file, intervention selection, registry read/write/counts | Deterministic recorder with explicit input and readback |
| FTR-018 process helper | worker identity cache and dispatch identity | Reject orchestrators; require requested canonical ID/native name agreement; cache by project + home + ID |

Architecture, concurrency and quality have dedicated assessors. Security, DevOps,
domain-model and dependencies use the generic assessor with explicit scope
instructions. Multiple generic scopes are combined into one dispatch to avoid
parallel writers overwriting the same report. Remediation agents are recommendations
in intervention documents only; they are never used as assessors.

## Identity, state and ownership

Worker resolution checks the canonical catalog ID, verified status, exact native
name, current definition hash, agent frontmatter name/model, and worker kind.
Workflow resolution is separate and can never authorize worker dispatch.

Every invocation has a unique owner and activity IDs. A per-prefix lock prevents
two workflow runs from writing the same feature/assessment concurrently. The owner
opens before work, drains parallel workers, validates outputs and serializes the
result before its terminal transition. Worker usage and provenance are persisted.
Legacy `open/close/fail/skip/finalizeActivity` calls cannot mutate owned entries;
owned finalization requires the matching owner and a running entry. No name-only
fallback is used for owned transitions. Later invocations cannot reopen an old run.

The ownership token prevents accidental cross-finalization, not hostile filesystem
access: workers and the host still run under the user's OS account. This is not a
security sandbox.

A caught failure produces `failed`. A hard OS/process kill can leave `running`,
never a speculative `done`; workflow automatic resume/reconciliation is not added
by this change. Retrying uses a new owner and preserves the interrupted record.
If persistence itself fails, the error propagates rather than reporting success.

## Verification and limits

Regression tests execute the installed workflow source through the real host,
resolver, filesystem and ledger. Integration tests invoke the actual structural
validator/renderer and workflow CLI; LLM workers are deterministic test doubles.
Coverage includes worker failure, missing outputs, corrupt ledger, late terminal
calls, parallel rejection/drain, identity mismatch, cross-project cache leakage,
negative semantic verdict, unknown scopes, paths with spaces and explicit approval.

The live paid Claude model/permission flow has not been exercised by these tests.
The subprocess adapter reuses FTR-018's existing qualification; no new cross-platform
process-supervision guarantee is claimed. On Windows, the full executor test suite
requires Git Bash ahead of the WSL launcher in PATH. User-level installations are
not modified by running the isolated test fixtures.
