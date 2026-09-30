# FTR-018 — Technical Specification

Version: 2.0 — consolidated 2026-09-20.
Status: DESIGN FOR REVIEW; GATE 1 BLOCKED by E-01 and E-02.
Authority: approved feature.md, then Requirements v2.0. This document does not approve gates.
Previous drafts and spike narratives are preserved under history/. Their claims of zero gaps,
successful agent identity verification and absence of orphans are superseded, not erased.

## 1. Baseline, scope and architectural decision

Inspected checkout: develop, 5e4e64d9ba2730fa14007b7f4f07373e86c6da85, package 0.12.0.
This is a repository observation, not a claim about published versions.
Node 20/CommonJS, Jest 29, existing bin/cli.js entry point and npm distribution.
No production changes have been made for this revision.

Select Path C: an external Node coordinator invokes a Claude CLI subprocess.
Do not call workflow agent() to read files, resolve identity, run Git or persist state.
The coordinator imports existing Node modules directly. The restrictions on require apply
to the workflow sandbox, not to Node. There is no task-executor workflow duplicating the core.

The normal user-facing entry remains implement-feature: after human Gate 2 it presents/launches
one explicit executor start command through the host's ordinary terminal capability.
That initial launch may be requested from the main assistant; no subagent orchestrates the run
and no assistant is required for each task transition. If the host cannot launch a durable
external command, show the exact command for the user to run in a terminal.
The external process has its own persisted lifecycle and may outlive the chat.
No fallback to pm-phase3 grouping is permitted in the new path.

The dispatch adapter is the only platform-dependent seam. It receives a verified invocation
descriptor, not an untrusted agent name chosen by an LLM. The Node core decides task order,
concurrency, verification, retry, integration and recovery. Agents implement or review only.

## 2. Evidence and Gate 1 prerequisites

| ID | Observation or required proof | Current status |
|---|---|---|
| E-00 | Historical generic synchronous CLI query returned structured JSON and usage | Reported by prior spike; not rerun here |
| E-01 | Same successful run: operational registry resolution, exact loaded definition, assigned worktree, result and Node persistence; local/global and foreign-config controls | OPEN: named-agent test exhausted budget; cache-token differences do not prove identity |
| E-02 | Async process supervision, coordinator crash, worker/child liveness, no duplicate attempt on resume, Windows and supported Linux behavior | OPEN: synchronous timeout status is insufficient |
| E-03 | Parser and ledger contracts | Source-inspected in this revision; implementation tests still to be written |
| E-04 | Final real-feature trial and full failure matrix | Post-implementation acceptance; not a pre-Gate-1 claim |

Keep OQ-01 open until E-01/E-02 have durable evidence. Do not regenerate the design repeatedly
to compensate for missing experiments. A feasible design is not a passed spike.

Required evidence bundle for each spike: executable script, exact CLI/Node/OS versions,
redacted argv/environment policy, fixture hashes, timestamps, exit/result schema, process
identities and liveness observations, output files and SHA-256. No credentials or full secret
environment dumps. Test costs require an explicit authorized limit; the historical limit is
not an authorization to increase it. No paid invocation was performed for this revision.

Documentation consulted 2026-09-20:
- [Claude programmatic execution](https://code.claude.com/docs/en/headless): print mode and structured results.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference): flags and agent configuration.
- [Node child_process](https://nodejs.org/api/child_process.html): asynchronous spawn and process lifecycle.

These documents describe supported interfaces, not proof of the installed binary's behavior.
The earlier statement that bare mode universally excludes Foundry is not established:
current documentation describes provider credentials in bare mode. Validate the exact installed
version and enterprise configuration; do not silently change authentication or billing.

## 3. Module interface and files

Proposed implementation, only after Gates 1 and 2:

| Module | Responsibility |
|---|---|
| lib/task-executor/index.js | Public execute/status/reconcile/replan interface, lifecycle orchestration |
| lib/task-executor/plan.js | Lossless approved-plan parsing, normalization, digest, pure ready queue |
| lib/task-executor/store.js | Versioned state, receipts, serialized writes and recovery |
| lib/task-executor/ownership.js | Repo lease, recovery guard, owner/worker identity checks |
| lib/task-executor/claude-process.js | Async CLI adapter and runtime capability checks |
| lib/task-executor/git.js | Scope validation, checkpoint and integration intent/reconciliation |
| lib/task-executor/ledger.js | Existing ledger integration and idempotent activity receipts |

These internal modules are not separate public APIs. Tests use the public interface and
inject process, clock and failure hooks; no alternate scheduler implementation in test helpers.
bin/cli.js delegates executor commands to index.js and keeps its require.main guard.
No new npm dependency is assumed. Any needed process-supervision dependency requires review
before declaring E-02 closed.

Changed existing files: bin/cli.js, implement-feature/SKILL.md, user docs, package distribution
tests, ledger module/tests for the explicit additive operation in section 6.
The CLI package ships lib/ through package.json. lib/ is not copied into .claude/ just because
runtime asset categories exist. Preserve the FTR-015 asset catalog; only new actual assets
belong there. Do not distribute tests, history, feature dossiers or fixtures.
No new workflow or agent is required. Existing pm-phase1/2 and assessment remain unchanged
except proven necessary consumer compatibility edits, separately reviewed.

## 4. Approved plan, parser and scheduler

Input paths are resolved from explicit --feature <absolute-or-project-relative-feature.md>.
Derive the feature directory, PREFIX and exact MD/CSV siblings; reject ambiguous identity.
Read feature, Requirements, Tech Spec, approvals, WB Markdown and CSV without writing first.
Gate record existence or a heading alone is not approval: require recorded affirmative human
decision for the relevant gate and document revision. Refuse rejected/pending/ambiguous records.

Use the current wb-render.js Task Details section as authoritative task content.
Preserve all 14 fields: ID, title, outcome, domain, agentType, dependsOn, acceptanceCriteria,
agentMinutes, tokens, outputCount, groupingRationale, commit type/scope/subject, plus ordered
verification command blocks. Commands are byte-preserved; dynamic fences are parsed by
opening delimiter length, not by splitting on arbitrary triple backticks.
Outside fenced commands parse fixed field markers in renderer order. Multiline raw values
continue until the next expected marker. Duplicate markers, ambiguous embedded delimiters
or malformed blocks cause PLAN_FORMAT_UNSUPPORTED, never guessed interpretation.
This limitation must have fixtures and remediation guidance; a new renderer format is not
introduced silently in FTR-018.

CSV has eight pipe-separated columns. Its depends_on contains external PHASE IDs aggregated
by wb-render.js, not task edges. Match each task with its CSV phase. Validate task ID/domain/
agentType and title using the renderer's current sanitation rules; compare phase dependency
aggregation computed from MD task edges with CSV, not raw task IDs.
Validate phase title and phase commit against the MD phase sections.
Reject malformed/empty required rows (apart from blank lines), duplicate IDs, unknown edges,
self-cycles, missing verification, empty outcome or conflicting mappings.
Do not trim command contents or reconstruct missing fields through an LLM.

Digest: SHA256 over length-prefixed UTF-8 raw MD bytes followed by length-prefixed raw CSV
bytes and parser format version. Also persist independent file hashes. The approved context
hashes and effective execution configuration are bound to the run.
Read-only snapshot = normalized validated task objects + raw-input hashes; immutable for
the run. JSON is internal state, not another editable Work-Breakdown deliverable.
Changing any bound input stops the run; parser version changes require explicit migration.

Ready queue: stable Kahn topological ordering, ties by source phase index then source task
index then ID. Dispatch from ready tasks only. Record a monotonically assigned dispatch
sequence; integration follows that sequence, never completion timing. Independent tasks may
finish out of order but do not overtake earlier dispatched tasks in integration.
N counts reserved task slots through verification/review/commit/integration; a full slot is
released only when consolidated or safely stopped. This bounds unintegrated work as well.
Two runs with identical plan, state and available results make the same scheduling decisions.
Runtime timings may change ready availability; do not claim a universal identical wall-clock trace.

## 5. State, ownership and durability

Discover absolute worktree root and common Git directory through Git, not root/.git string
concatenation. State root: <absolute-common-git-dir>/ai-toolkit/execution/.
One repo-wide execution lease prevents simultaneous coordinators for different features
from corrupting the same branch/index. It is stricter than a per-feature lock.

Layout:
- owner.json: exclusive coordinator identity and lease generation.
- ownership-guard/: short-lived atomic mkdir guard for all lease acquisition/release/reclaim.
- runs/<runId>/manifest.json: immutable plan/config/baseline identity.
- runs/<runId>/state.json and state.previous.json: current and previous validated generation.
- runs/<runId>/receipts/<activityId>.json: immutable activity result/usage receipts.
- runs/<runId>/intents/: immutable checkpoint/integration descriptors.
- runs/<runId>/workers/: per-attempt registration, lifecycle and termination evidence.
- runs/<runId>/control/: uniquely named stop requests, created exclusively.
- runs/<runId>/logs/: bounded redacted stdout/stderr, linked by digest.

State schema v1: runId, featureId, repo/commonDir identity, featureRef, baseSha, expectedHead,
planDigest, contextHashes, config, generation, previousDigest, runStatus, task map,
dispatch/integration sequence, receipt references and protocolVersion.
Task: taskId, dependencies, status, attempts. Attempt: number, unique identity, baseSha,
worktree/ref, process identity, stage, verification/review evidence refs, intent IDs,
original/integrated SHA and terminal reason. Totals are not authoritative state fields.

Run statuses: running, stopping, paused, blocked, completed, superseded.
Task statuses: pending, active, checkpointed, integrated, skipped, blocked.
Attempt stages: prepared, dispatching, running, implementation-recorded, verified, reviewed,
checkpoint-prepared, committed, integrated; failed/interrupted are terminal alternatives.
State is mutable by generation; completed attempt evidence is immutable. A completed task
does not freeze the entire run's state file.

Atomic writes: serialize through coordinator; same-directory exclusive temp, complete write,
file flush, close, rename, directory flush where supported, read-back schema/checksum.
Do not describe read-back as proof of stable-media persistence. Preserve a validated previous
generation; never default corrupted state to an empty run. Crash may leave an orphan temp;
explicit reconcile classifies it without automatically selecting an uncertain newer state.
Acknowledgment means protocol flush steps succeeded within the qualified filesystem envelope.
Local NTFS/ext4 are qualification targets, not already-tested guarantees. Network shares and
unsupported durability semantics fail capability checks. Disk loss, storage-controller lies
and destruction of all state copies are outside scope.

Lease owner: random nonce, host identity, PID, OS process start identity, runId, generation.
Liveness results: same live process / confirmed absent / unknown. Access denied, unavailable
start identity and a PID alone are unknown, not permission to reclaim.
All ownership transitions acquire ownership-guard first, then compare lease nonce/generation;
write/reclaim/release under the guard. Normal entrants never unlink another owner's lease.
Stale recovery requires dead owner AND all registered workers confirmed inactive; otherwise
block. Never recover by time age. An orphaned guard is not automatically stolen: explicit
operator maintenance after excluding other toolkit processes is required. This conservative
case is a documented recoverable stop, not a reason to run duplicate workers.
Use the same rules for ledger locks; existing age-based ledger lock logic is not assumed
sufficient for new executor writes.

## 6. Ledger and activity protocol

Current real interface:
open(dir,prefix,agent,phase,model,attempt,metadata)
close(dir,prefix,agent,tokens,attempt)
fail(dir,prefix,agent,error,attempt)
skip(dir,prefix,agent,phase,model,attempt)
computeOperationId = first 32 hex chars of SHA256(JSON.stringify([prefix,agent,attempt])).
Use the module function; do not independently implement this hash in the executor.

agent key: executor:<runId>:<taskId>:<kind>; attempt is an integer.
Kinds: task, implementation, verification-<index>, review. Rework increments attempt; no
overwriting previous attempts. Each invocation has one ledger activity, not a group.
The task activity carries null token usage (reason: control-only) and closes after checkpoint
and, for N>1, verified integration. Implementation/review activities close as soon as their
results have been durably received. Thus cost is not lost if later verification fails.

Source observation: open on an existing operation resets status to running. close/fail
replace terminal timestamps. Existing fail has no tokens argument.
Therefore replaying these calls blindly is NOT an idempotent executor protocol.

Explicit additive ledger interface to implement:
finalizeActivity(dir,prefix,agent,attempt,{status,tokens,reason,completedAt})
- status done/failed/skipped; exact operation_id required, no name-only fallback;
- first finalization records known tokens even on failure, or null plus optional usage_reason;
- terminal replay of identical data returns existing entry unchanged;
- conflicting terminal data fails without write; preserves unknown legacy fields and metadata;
- adds no second ledger and changes no existing caller signature or ID algorithm;
- lock acquisition/recovery uses ownership rules above for this new path;
- versioned tests prove all old consumer behavior remains unchanged.
The optional usage_reason is an additive ledger field, not an open metadata whitelist key.
No private _writeLedger usage or direct JSON editing by the coordinator.

Activity sequence: persist intent → exact-ID lookup/open if absent → read back running identity
→ dispatch. On result: persist immutable receipt → finalizeActivity → read back → next stage.
Receipt holds source result and usage provenance for replay, not an alternative reporting total.
Reports sum only ledger phase_delta_tokens; never add receipt totals.
Terminal task activity is distinct from a successfully completed implementation activity.
If receipts/ledger disagree, stop. Missing/corrupted ledger is not rebuilt wholesale.

Usage: choose one qualified CLI usage field set per version; retain raw result in receipt.
Never sum both usage and modelUsage, or add thinking/cache counters without proving whether
they overlap. If a complete non-overlapping total is not observable, tokens=null with reason.
No guessed price conversion; reported cost is a runtime estimate, not a billing invoice.
For deterministic verification, zero LLM tokens may be recorded if known; for this authoring
session token totals are unavailable, not zero.
Elapsed timestamps and monotonic duration segments are distinct; after crash active duration
is null unless observed, never includes downtime.

## 7. Claude subprocess adapter and qualification

Production uses asynchronous spawn with shell:false, argv array, explicit cwd and validated
executable identity/version. Resolve .exe on Windows and an actual executable on Linux;
do not blindly execute an npm .cmd shim with shell:true.
Feed task prompt through stdin; no string-built shell command or credentials in argv/logs.
Drain stdout/stderr with bounded buffering; persist result before any review.
Exit 0 is necessary, not sufficient: validate outer result, terminal reason and structured
output schema independently. Malformed/schema-coerced/missing output cannot pass.

Before EACH implementation and review invocation: operational resolveAgent for canonical ID,
record nativeName/path/sha256/manifestPath/toolkitVersion/scope, reread definition hash.
Resolve for the actual execution directory or explicitly materialized, verified runtime there.
A worktree does not automatically inherit an untracked local .claude installation.
Any runtime materialization uses the catalog installer with provenance and no personal config copy.

E-01 must qualify an explicit context-loading profile: agent definition, allowed project
instructions, settings sources, hooks/plugins/MCP and authentication sources. No automatic
permission bypass or indiscriminate inherited settings. Either establish controlled loading
with documented flags supported by the pinned CLI, or stop as unsupported.
Compare effective definition with the registry result; token counts and self-reported model
identity are not identity evidence. Check collisions and before/after file hashes. Exact-byte
loading through a supported explicit-definition mechanism is an option only if its mapping
of frontmatter/body is proven; do not silently drop tools/model constraints.
Only the verified nativeName is passed as agent selector. Nested worker delegation is disabled
or excluded by qualified tool policy so a task does not become an untracked multi-agent group.
A directory restriction is not an OS sandbox: do not claim hostile-code containment.

E-02 must establish the supervision mechanism on supported OSes before coding the productive
adapter. Required protocol: durable launch intent before spawn; an attempt supervisor registers
identity and waits for durable coordinator acknowledgment BEFORE spawning Claude. If the
coordinator dies before registration, an unacknowledged supervisor cannot dispatch.
Supervisor persists PID/start identity and process-tree evidence; it does not write ledger/Git.
On coordinator loss, no fresh work is launched. Existing workers are either allowed to finish
into receipts or terminated via the qualified mechanism; unknown liveness blocks replacement.
Test crash in registration/ack/spawn windows, worker children, reused PID and access denial.
Do not claim process.kill(pid,0) proves identity or an entire tree is gone.

stop graceful: stop new task and review dispatches; collect already-running results, checkpoint
only if verification/review evidence is already sufficient; otherwise pause at that stage.
stop immediate: request termination of the owned process tree; wait for confirmed terminal
state. Timeout escalations may affect only identity-verified owned processes.
Timeout is configurable and not inherited as a fixed 180 seconds from the old workflow.
If termination cannot be established, return WORKER_LIVENESS_UNKNOWN and retain locks/evidence.
A review result must say passed=true with no blocking finding. Review cannot modify task files.

## 8. Checkpoint and parallel integration

Before an attempt: baseline index empty except explicitly classified coordinator artifacts;
capture expected HEAD and file hashes. Do not use path membership alone to attribute changes.
Workers cannot commit/stage or mutate coordinator state. Inventory changed paths including
untracked files, compare baseline and authorized task scope; unknown changes stop the run.
No reset, clean, stash, destructive checkout or automatic repair of user edits.

Verification commands come from approved fenced blocks, preserve exact bytes and declared shell
semantics. Existing Bash commands run under an explicitly available Bash, not silently converted
to PowerShell. Unsupported shell fails preflight. Execute independently and require each exit 0;
generic npm test success cannot hide an individual failure. Approved test runs may generate
known artifacts; unexpected tracked changes invalidate the reviewed diff.

Checkpoint intent includes feature/run/task/attempt, planDigest, featureRef/taskRef, parent SHA,
expected full tree SHA, exact changed path/object inventory, review/verification receipts and
planned commit message/trailers. Persist before commit. Stage only enumerated paths using argv
and literal path handling; verify resulting tree equals intent. Hooks may fail or change index:
reinspect tree/parent/trailers after commit, block on mismatch without discarding anything.
Commit trailers: AI-Toolkit-Run, AI-Toolkit-Task, AI-Toolkit-Attempt, AI-Toolkit-Plan.
Persist resulting SHA in state outside tracked worktree; then finalize the task activity when
consolidated. No recursive commit to put a commit's SHA inside itself.

Recovery of missing SHA: search reachable commits from recorded task/feature refs; match exact
trailers, parent, full tree and path inventory against the persisted intent. One exact candidate
is recoverable; zero means no proved commit; multiple/incompatible candidates block.
A trailer alone or git show success is insufficient.

N=1: task commit is on feature branch and integratedSha=originalSha after verification.
N>1: each attempt has unique branch ai-toolkit/<runId>/<taskId>/<attempt> and an external
worktree path under a validated run-owned root; no reused slot names.
Base = last verified integrated feature HEAD at dispatch. Commit remains on technical ref
until integration; slots bound the amount of pending work.

Integration is serialized by dispatch sequence. Use cherry-pick --no-commit into a dedicated
run-owned integration worktree at expected feature HEAD, then inspect candidate diff and run
integration checks. This changes no user worktree. On conflict leave state/worktree for
diagnosis; never automatically abort/reset it.
Persist integration intent with original SHA, feature-parent, candidate tree and message.
Create integration commit there, verify, then advance the feature ref only by compare-and-swap
against expected HEAD. The feature branch must not be checked out elsewhere in parallel mode;
preflight requests the user select a clean coordination checkout/branch if necessary.
Record both SHAs and verify reachability. Never force-move a branch or overwrite a user's index.
Crash after commit but before ref update: locate candidate by intent and complete CAS if valid.
Crash after ref update before state: verify actual HEAD/ancestry/tree and record missing state.
A later external branch edit blocks automatic repair.
Task dependents unlock only after integration checks, ref update and ledger confirmation.
Integration conflict stops new starts; running tasks may finish into preserved evidence.
Shared test resources require explicit isolation or serial resource locks.

No-op tasks: require verifications and review proving outcome at the current baseline.
Record skipped with evidence, no empty commit. Revalidate if integration baseline changed.
A later replan cannot silently remove dependencies using skipped status.
Phase integration review is separately recorded; blockers do not erase task checkpoints.
Subsequent corrective tasks require an approved replan once original tasks are consolidated.

Coordinator ledger/log artifacts are explicitly classified and never assigned to worker commits.
At run pause/end, a separate metadata checkpoint may commit ONLY approved dossier artifacts
(e.g. ledger) using the current expected branch head. It is not a task completion proof and
never includes .git state, credentials or unknown edits. Its intent is recoverable like other
commits. Until then, these known artifacts remain classified dirty; do not mistake them for
user edits or pretend the worktree is completely clean.

## 9. Resume, rework and replan

status/diagnose never mutate. reconcile/resume require no live competing coordinator.
Reconcile applies idempotent repairs supported by existing intents; it does not dispatch,
integrate new pending work, reinterpret approvals or clean resources.
Resume reconciles first, then continues only stages whose evidence is valid.

| Evidence | Action |
|---|---|
| Integrated commit + valid intent and receipts | Keep completion, no new agent |
| Commit exists but SHA not recorded | Exact intent reconciliation |
| Integration commit/ref exists but state missing | Intent and expected-parent/ref reconciliation |
| Review passed, no commit | Recheck unchanged tree then finish checkpoint |
| Implementation result persisted | Continue verification, not implementation |
| Worker still live or unknown | No replacement; diagnose/pause |
| Dead worker, partial diff | Preserve and attribute; new attempt within retry policy |
| Failed verification/review | New attempt if initial+one rework limit permits |
| Completed task but unreachable/mismatched commit | Block without rewriting history |
| Corrupted/missing evidence | Block; no empty defaults or blanket ledger rebuild |
| Plan/config changed | Block until approved successor plan |

One initial implementation + one automatic rework (two total per task). Review rejections and
implementation failures consume attempts when new implementation is invoked. Resuming verification,
ledger projection or an existing commit does not. A task beyond policy is blocked: replan-required.

Replan does not grant approval. First produce a proposed successor plan and human decision outside
the executor. Then replan command validates new Gate 2/revision evidence and records old→new digest
and task mapping. Original run becomes superseded only after no live workers and evidence retained.
Carry completion only for unchanged task/context with reachable verified checkpoints and explicit
approved mapping; otherwise require a new task identity. No data deletion, automatic branch rewrite
or reset of failed-attempt counters to evade policy.

## 10. CLI contract (all proposed, none implemented yet)

Common selector: --project <path>. start additionally --feature <path>. All other commands
require --run-id <uuid>; no implicit last-run selection. Output --format json or text (default).
JSON stdout is one versioned result object; logs/errors go to stderr, never contaminate stdout.

| Command | Additional arguments | Effect |
|---|---|---|
| start | --feature, --max-concurrency N (default 1), --claude-path, --task-timeout-ms, --agent-budget-usd | Validate gates/config/profile, acquire ownership, create immutable run, execute |
| status | --run-id | Read-only summary and counts, ledger is sole cost source |
| diagnose | --run-id | Read-only detailed evidence/ownership/repair suggestions |
| stop | --run-id, --mode graceful or immediate (default graceful) | Persist request, acknowledge request only, not claim termination |
| reconcile | --run-id | Repair proven gaps only, no dispatch or new integrations |
| resume | --run-id | Reconcile then continue bound plan/config |
| replan | --run-id, --feature (approved successor plan) | Record approved successor, no implicit start or abandonment deletion |

No --force*, lock/state path overrides, implicit --abandon or runtime concurrency adjustment.
Config source is explicit start flags, persisted unchanged. Budget and timeout must be explicitly
provided for real model invocations; no hidden currency/default spend assumption.
Invalid N (non-integer, <=0, unsafe integer), invalid budget/timeout, unsupported executable/profile
fail before mutation. Requested N=effective N; if host cannot support it, reject, never downgrade.
Windows and Linux are target platforms; each requires E-02 qualification.
Budget flags are runtime limits, not a guarantee of exact invoiced maximum.
Stopping a run returns accepted request state; status confirms when it actually paused.

Exit codes: 0 successful operation/request; 1 unexpected I/O; 2 invalid config/input;
3 ownership/live worker conflict; 4 evidence/plan/approval mismatch; 5 worker/verification/review
failure; 6 integration conflict; 7 runtime not qualified; 8 paused awaiting human decision.
No command prompts inside a worker. Codes, JSON reason and actionable diagnostic are consistent
across CLI, documentation and tests. Errors do not expose credentials.

## 11. Test and delivery plan

Tests under tests/task-executor/ exercise real modules with temporary Git repos and injected
workers. Scope fixture home, Git config, hooks, executable and environment explicitly; npm test
must not contact paid services or read real home/auth. Actual Claude qualification is a separate
authorized manual suite, never an implicit npm test side effect.

Required families:
T01 parser roundtrip with actual renderer output, multiline/pipe/backtick/ambiguous marker cases;
T02 CSV phase mapping vs task graph, tampering MD only/CSV only, approved context digest;
T03 sequential scheduling and blocked deps; T04 N=2/3 out-of-order completion/integration;
T05 two coordinators, different feature same repo, stale/unknown owner, orphaned ownership guard;
T06 receipt/ledger idempotency including failed tokens, terminal replays and legacy consumers;
T07 every dispatch registration/ack window and coordinator crash with surviving descendants;
T08 failure before/after verification, review, intent, commit, state write and ledger finalization;
T09 integration candidate/ref-CAS/state windows, duplicate intent matches and external ref drift;
T10 dirty index, unrelated files, hook mutations, spaces/Unicode paths, .git file worktree;
T11 stop modes, repeated resume, no-op, replan approval/mapping, retry limits;
T12 local/global package install and absence of tests/fixtures; CLI result/exit contract;
T13 filesystem qualification on supported Windows/Linux, corruption retains diagnostics;
T14 authorized real-feature run via official entry, documented limits/cost/identity evidence.

Fault tests assert no false completion and preservation of already-written artifacts. Process-kill
tests do not alone prove physical power-loss behavior; filesystem guarantees remain bounded.
No universal "zero data loss" claim for unflushed buffers or destroyed media.

Nine implementation increments retain feature order: qualification, parser/scheduler, state/ledger,
sequential lifecycle, Git checkpoint, resume/replan, isolated concurrency, entry/distribution,
full tests and real-feature acceptance. They are NOT pre-generated WB tasks or approvals.

Bootstrap for delivering FTR-018: after Gates 1/2, use the explicitly supervised task-by-task
procedure, maxConcurrency=1, verified agents, per-task existing ledger activities and commits.
Do not call old grouped pm-phase3 as bootstrap, and do not execute unfinished executor against its
own delivery. This manual delivery exception is documented, not claimed to satisfy the new
executor guarantees. The completed executor's real-feature trial uses a separately approved target.

## 12. OQ disposition

| OQ | Design decision | Evidence status |
|---|---|---|
| OQ-01 | External async Claude CLI with qualified identity/context and supervisor | OPEN: E-01/E-02; blocks Gate 1 |
| OQ-02 | Versioned state/receipts/intents, flush+readback, bounded filesystem envelope | Defined for review; qualification tests required |
| OQ-03 | Existing IDs and additive finalizeActivity, receipts not counted twice | Defined against actual source, tests required |
| OQ-04 | Lossless MD task details + CSV phase projection, digest of both | Defined against actual renderer, tests required |
| OQ-05 | Common-dir repo lease + conservative recovery guard and worker liveness | Defined; OS process mechanism qualification is part of E-02 |
| OQ-06 | Seven commands, immutable start config, stable exits | Defined for review |

No approver has approved this revision. No executable production adapter, cancellation guarantees
or successful end-to-end runtime identity test is claimed by this document.
