'use strict';

// Git checkpoint/integration module (FTR-018).
//
// Implemented here: checkpoint intent persistence (US-05-TASK-BE-01),
// controlled staging with path enumeration (US-05-TASK-BE-02), commit
// creation with task trailers (US-05-TASK-BE-03), and serial, dispatch-order
// integration of N>1 technical-branch commits onto the feature branch
// (US-08-TASK-BE-03, integrateAttempt — see its own file section below).
// SHA registration outside the tracked worktree (US-05-TASK-BE-04) and
// original/integrated SHA field tracking (US-08-TASK-BE-04) are both
// implemented in store.js (registerCommitSHA / registerIntegratedSHA), not
// here — this module hands createTaskCommit's returned, re-inspected
// commitSha, and integrateAttempt's returned integratedSha, to those
// functions; it does not register either itself. See integrateAttempt's own
// doc comment for the exact scope boundary against registerIntegratedSHA.
// Still pending: commit/ledger reconciliation and task completion
// (US-05-TASK-BE-05 — actually landed separately in index.js's
// finalizeTaskCheckpoint). See FTR-018-Tech-Spec.md section 8 ("Checkpoint
// intent ... Persist before commit." / "Integration is serialized by
// dispatch sequence...").

const fs = require('fs');
const { spawnSync } = require('child_process');
const store = require('./store');

// ── persistCheckpointIntent (US-05-TASK-BE-01) ──────────────────────────────

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const CHANGE_TYPES = ['add', 'modify', 'delete'];

// Attempt stages this function may be called against: 'reviewed' is the real
// precondition (BR-09: "review persisted before checkpoint" — mirrors
// store.js's own persistVerificationReviewOutcome, which is the only writer
// that ever puts an attempt into 'reviewed'). 'checkpoint-prepared' is
// accepted too, but only as an idempotent replay of the exact same intent
// (see the alreadyRecorded check below) — never as a way to re-derive a
// second, different intent for the same attempt.
const ALLOWED_SOURCE_STAGES = ['reviewed', 'checkpoint-prepared'];

function _err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function _fail(field, reason) {
  throw _err(
    'CHECKPOINT_INTENT_VALIDATION_ERROR',
    'persistCheckpointIntent: ' + field + ' ' + reason
  );
}

function _requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    _fail(field, 'must be a non-empty string');
  }
}

function _requirePositiveInt(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    _fail(field, 'must be a positive integer');
  }
}

function _requireSha(value, field) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    _fail(field, 'must be a 40-character hex SHA-1 string');
  }
}

// "exact changed path/object inventory ... must be an explicit enumerated
// list, not a wildcard" — enforced here so US-05-TASK-BE-02 (controlled
// staging) has a concrete, non-empty list of {path, changeType} entries to
// stage against and validate the resulting tree with, never a glob.
function _validateChangedPaths(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    _fail('changedPaths', 'must be a non-empty array (explicit enumeration — never a wildcard)');
  }
  changedPaths.forEach(function (entry, index) {
    const prefix = 'changedPaths[' + index + ']';
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      _fail(prefix, 'must be an object with "path" and "changeType"');
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      _fail(prefix + '.path', 'must be a non-empty string');
    }
    if (CHANGE_TYPES.indexOf(entry.changeType) === -1) {
      _fail(prefix + '.changeType', 'must be one of: ' + CHANGE_TYPES.join(', '));
    }
  });
}

function _validateReceiptIdArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    _fail(field, 'must be a non-empty array of receipt ids');
  }
  value.forEach(function (id, index) {
    if (typeof id !== 'string' || id.length === 0) {
      _fail(field + '[' + index + ']', 'must be a non-empty string');
    }
  });
}

// Builds the exact commit trailer values (AI-Toolkit-Run/Task/Attempt/Plan)
// this checkpoint intends to use. Derived here from the already-validated
// intent fields — never accepted redundantly from the caller — so there is
// exactly one source of truth for trailer values and US-05-TASK-BE-03
// (commit creation) commits with EXACTLY what was persisted here, never
// improvised at commit time.
function _buildTrailers(intent) {
  return {
    'AI-Toolkit-Run':     String(intent.runId),
    'AI-Toolkit-Task':    String(intent.taskId),
    'AI-Toolkit-Attempt': String(intent.attemptNumber),
    'AI-Toolkit-Plan':    String(intent.planDigest),
  };
}

// Validates every required field is present and well-formed. Throws
// CHECKPOINT_INTENT_VALIDATION_ERROR (fail closed) on the first problem
// found — called before any persistence is attempted, so a partial/
// incomplete intent is never written.
function _validateIntent(runId, intent) {
  if (intent == null || typeof intent !== 'object' || Array.isArray(intent)) {
    _fail('intent', 'must be an object');
  }

  _requireNonEmptyString(intent.featureId, 'featureId');
  _requireNonEmptyString(intent.runId, 'runId');
  if (intent.runId !== runId) {
    _fail('runId', 'must match the runId argument ("' + runId + '"), got ' + JSON.stringify(intent.runId));
  }
  _requireNonEmptyString(intent.taskId, 'taskId');
  _requirePositiveInt(intent.attemptNumber, 'attemptNumber');
  _requireNonEmptyString(intent.planDigest, 'planDigest');
  _requireNonEmptyString(intent.featureRef, 'featureRef');
  _requireNonEmptyString(intent.taskRef, 'taskRef');
  _requireSha(intent.parentSha, 'parentSha');
  _requireSha(intent.expectedTreeSha, 'expectedTreeSha');
  _validateChangedPaths(intent.changedPaths);
  _validateReceiptIdArray(intent.verificationReceiptIds, 'verificationReceiptIds');
  _requireNonEmptyString(intent.reviewReceiptId, 'reviewReceiptId');
  _requireNonEmptyString(intent.outcomeReceiptId, 'outcomeReceiptId');
  _requireNonEmptyString(intent.commitMessage, 'commitMessage');
}

// Persists the full pre-commit checkpoint intent for one task attempt:
// feature/run/task/attempt identifiers, planDigest (as produced by
// createPlanSnapshot, US-01-TASK-BE-04 — supplied by the caller, never
// recomputed here), featureRef/taskRef, the parent SHA this checkpoint is
// relative to, the expected full tree SHA, an explicit enumerated changed-
// path inventory, the review/verification receipt ids that already
// authorized this checkpoint (US-04-TASK-BE-01/03 — accepted and referenced,
// never recomputed or re-verified here), and the planned commit message plus
// the exact AI-Toolkit-Run/Task/Attempt/Plan trailer values.
//
// Persisted BEFORE any commit is attempted. This function never touches
// Git — no staging, no commit, no SHA computation: that is
// US-05-TASK-BE-02 (staging) and US-05-TASK-BE-03 (commit creation).
//
// Reuses store.js's writeIntent immutable-record primitive (INFRA-TASK-BE-01)
// for the actual persistence rather than inventing a new one. The intentId is
// deterministic: "<taskId>-attempt<attemptNumber>-checkpoint".
//
// Preconditions (fail closed, nothing partial is ever written):
//   - every required intent field above must be present and well-formed, or
//     CHECKPOINT_INTENT_VALIDATION_ERROR is thrown before writeIntent runs;
//   - the target attempt must already be at stage 'reviewed' — the terminal
//     success stage persistVerificationReviewOutcome writes — or
//     CHECKPOINT_INTENT_STAGE_ERROR is thrown. A prior identical call that
//     already advanced the attempt to 'checkpoint-prepared' is accepted as an
//     idempotent replay (same intentId, same content); anything else at that
//     stage is rejected rather than silently re-deriving a second intent.
//
// On success, the attempt's stage is advanced to 'checkpoint-prepared' and
// its intentIds list gains this intentId (both durably written via
// store.writeState) before this function returns.
function persistCheckpointIntent(executionRoot, runId, intent) {
  _validateIntent(runId, intent);

  const intentId = intent.taskId + '-attempt' + intent.attemptNumber + '-checkpoint';
  const trailers = _buildTrailers(intent);

  const record = {
    featureId:              intent.featureId,
    runId:                  intent.runId,
    taskId:                 intent.taskId,
    attemptNumber:          intent.attemptNumber,
    planDigest:             intent.planDigest,
    featureRef:             intent.featureRef,
    taskRef:                intent.taskRef,
    parentSha:              intent.parentSha,
    expectedTreeSha:        intent.expectedTreeSha,
    changedPaths:           intent.changedPaths,
    verificationReceiptIds: intent.verificationReceiptIds,
    reviewReceiptId:        intent.reviewReceiptId,
    outcomeReceiptId:       intent.outcomeReceiptId,
    commitMessage:          intent.commitMessage,
    trailers:               trailers,
  };

  let state = store.readState(executionRoot, runId);
  const task = state.tasks[intent.taskId];
  if (!task) {
    throw _err('STATE_TASK_NOT_FOUND', 'persistCheckpointIntent: task "' + intent.taskId + '" not found');
  }
  const attempt = task.attempts.find(function (a) { return a.number === intent.attemptNumber; });
  if (!attempt) {
    throw _err(
      'STATE_ATTEMPT_NOT_FOUND',
      'persistCheckpointIntent: attempt ' + intent.attemptNumber + ' not found for task "' + intent.taskId + '"'
    );
  }
  if (ALLOWED_SOURCE_STAGES.indexOf(attempt.stage) === -1) {
    throw _err(
      'CHECKPOINT_INTENT_STAGE_ERROR',
      'persistCheckpointIntent: attempt ' + intent.attemptNumber + ' of task "' + intent.taskId + '" is at stage "' +
        attempt.stage + '"; a checkpoint intent may only be persisted once verification and review have both ' +
        'passed (expected stage "reviewed", or "checkpoint-prepared" for an idempotent replay)'
    );
  }

  // Throws INTENT_CONFLICT if a prior intent exists under this id with
  // different content — never silently overwrites a differing record.
  const written = store.writeIntent(executionRoot, runId, intentId, record);

  const existingIntentIds = Array.isArray(attempt.intentIds) ? attempt.intentIds : [];
  const alreadyRecorded = attempt.stage === 'checkpoint-prepared' && existingIntentIds.indexOf(intentId) !== -1;
  if (alreadyRecorded) {
    return { intentId: intentId, intent: written }; // idempotent no-op — no generation bump for a repeated call
  }

  const mergedIntentIds = existingIntentIds.indexOf(intentId) === -1
    ? existingIntentIds.concat([intentId])
    : existingIntentIds;

  state = state.updateAttempt(intent.taskId, intent.attemptNumber, {
    stage:     'checkpoint-prepared',
    intentIds: mergedIntentIds,
  });
  store.writeState(executionRoot, runId, state);

  return { intentId: intentId, intent: written };
}

// ── stageTaskFiles (US-05-TASK-BE-02) ───────────────────────────────────────
//
// Stages ONLY the enumerated task-attributable paths into the Git index via
// argv-based `git add -- <path...>` (literal `--` separator, argv array, no
// shell, no globbing — Tech-Spec section 8: "Stage only enumerated paths
// using argv and literal path handling").
//
// Real git behavior was verified in an isolated tmp repo (never against this
// project's own working tree) before writing this, per the delivery
// constraint that this area must never be assumed:
//   - a plain `git add -- <path>` DOES correctly stage a deletion when a
//     previously tracked path is missing from the working tree — there is
//     no need for a separate `git rm --cached` branch for changeType
//     'delete';
//   - a path that does not match a tracked or existing file makes the WHOLE
//     `git add` invocation fail atomically (exit 128, "did not match any
//     files") without staging any of the other paths passed in the same
//     call.
// Both were confirmed by direct experiment, not assumed from documentation.
//
// This function does NOT know or compare against the checkpoint intent's
// expectedTreeSha (that lives in the intent persisted by
// persistCheckpointIntent, US-05-TASK-BE-01) — it only stages, then reports
// the resulting tree SHA and the full list of currently-staged paths so the
// CALLER (US-05-TASK-BE-03, commit creation) can compare against the
// persisted intent. Keeping that comparison out of this function is
// deliberate: "stage exactly these paths, report what happened", nothing
// more.
//
// Two failure modes this function DOES own, because they can only be
// detected from inside the staging step itself:
//   - STAGING_MISMATCH: an enumerated path did not end up staged the way its
//     declared changeType implies (e.g. a 'delete' entry that is not staged
//     as a deletion, or an 'add'/'modify' entry that ended up staged as a
//     deletion instead, or a path that git add silently left untouched).
//   - UNEXPECTED_INDEX_CHANGE: a `git status` snapshot taken immediately
//     before staging is compared against one taken immediately after; any
//     path OUTSIDE the enumerated list whose status differs is reported here
//     rather than silently folded into the resulting tree. This is the
//     "hooks may fail or change index" case the Tech-Spec warns about
//     (section 8) surfacing at the staging step; commit-time hook mutation
//     (post-commit tree/parent/trailer re-inspection) is a separate concern
//     owned by US-05-TASK-BE-03.
// Neither failure mode resets, cleans, or discards anything — the index is
// left exactly as git produced it; only an error is thrown so the caller can
// decide what to do (Tech-Spec: "block on mismatch without discarding
// anything").

// fnLabel identifies the calling function in error messages (e.g.
// 'stageTaskFiles', 'createTaskCommit') — shared by every function in this
// module that spawns git rather than each duplicating its own spawn logic.
// opts is optional and merged into the spawnSync options (e.g. { input }
// to pipe a commit message to git commit-tree's stdin).
function _runGitSync(fnLabel, cwd, args, opts) {
  const spawnOpts = Object.assign(
    {
      cwd: cwd,
      shell: false, // never true: argv array + literal paths only, no shell interpolation/globbing
      encoding: 'utf8',
      windowsHide: true,
    },
    opts || {}
  );
  const res = spawnSync('git', args, spawnOpts);
  if (res.error) {
    throw _err(
      'GIT_SPAWN_FAILED',
      fnLabel + ': failed to spawn "git ' + args.join(' ') + '": ' + res.error.message
    );
  }
  return res;
}

function _runGitOrThrow(fnLabel, cwd, args, code, label, opts) {
  const res = _runGitSync(fnLabel, cwd, args, opts);
  if (res.status !== 0) {
    throw _err(
      code,
      fnLabel + ': ' + label + ' failed ("git ' + args.join(' ') + '", exit ' + res.status + '): ' +
        (res.stderr || '').trim()
    );
  }
  return res;
}

// Parses `git status --porcelain=v1 -z --no-renames --untracked-files=all`
// output into a Map<path, "XY"> (the two raw porcelain status characters).
// --no-renames and -z together guarantee exactly one NUL-terminated "XY path"
// record per entry — no rename-pair ambiguity, no quoting/escaping surprises
// for paths containing spaces or non-ASCII characters.
function _statusSnapshot(cwd) {
  const res = _runGitOrThrow(
    'stageTaskFiles',
    cwd,
    ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'],
    'GIT_STATUS_FAILED',
    'capturing status snapshot'
  );
  const map = new Map();
  res.stdout.split('\0').forEach(function (record) {
    if (record.length === 0) return;
    const statusCode = record.slice(0, 2);
    const filePath = record.slice(3);
    map.set(filePath, statusCode);
  });
  return map;
}

function _stagingFail(field, reason) {
  throw _err('STAGING_VALIDATION_ERROR', 'stageTaskFiles: ' + field + ' ' + reason);
}

function _validateStagingInputs(cwd, changedPaths) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    _stagingFail('cwd', 'must be a non-empty string');
  }
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch (err) {
    _stagingFail('cwd', 'does not exist (' + err.code + ')');
  }
  if (!stat.isDirectory()) {
    _stagingFail('cwd', 'must be a directory');
  }

  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    _stagingFail('changedPaths', 'must be a non-empty array (explicit enumeration — never a wildcard)');
  }
  const seen = new Set();
  changedPaths.forEach(function (entry, index) {
    const prefix = 'changedPaths[' + index + ']';
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      _stagingFail(prefix, 'must be an object with "path" and "changeType"');
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      _stagingFail(prefix + '.path', 'must be a non-empty string');
    }
    if (CHANGE_TYPES.indexOf(entry.changeType) === -1) {
      _stagingFail(prefix + '.changeType', 'must be one of: ' + CHANGE_TYPES.join(', '));
    }
    if (seen.has(entry.path)) {
      _stagingFail(prefix + '.path', 'is duplicated in changedPaths ("' + entry.path + '")');
    }
    seen.add(entry.path);
  });
}

// Expected porcelain index-status letter (X, the first character) for a
// declared changeType: 'delete' must land as 'D'; 'add'/'modify' must land
// as anything staged EXCEPT 'D' (or the "not staged"/"untracked" markers ' '
// and '?'). Exact 'A' vs 'M' is deliberately not distinguished further — a
// caller-declared 'add' landing as 'M' (or vice versa) is not itself treated
// as a sign of the wrong path; only the delete/non-delete distinction is
// authoritative here.
function _indexStatusMatchesChangeType(indexChar, changeType) {
  if (changeType === 'delete') {
    return indexChar === 'D';
  }
  return indexChar !== 'D' && indexChar !== ' ' && indexChar !== '?';
}

/**
 * Stages exactly the enumerated task-attributable paths and reports the
 * resulting tree. Does not commit, does not compare against a persisted
 * checkpoint intent's expectedTreeSha (that is the caller's job) — see the
 * file comment above for the full design.
 *
 * @param {string} cwd - absolute path to the Git worktree to stage in.
 * @param {Array<{path: string, changeType: 'add'|'modify'|'delete'}>} changedPaths
 *   - explicit enumerated inventory (same shape persisted by
 *   persistCheckpointIntent) — never a wildcard, must be non-empty.
 * @returns {{ treeSha: string, stagedPaths: string[] }} the SHA of the tree
 *   `git write-tree` produces against the resulting index, and the full list
 *   of paths git reports as currently staged (`git diff --cached --name-only`).
 * @throws {Error} STAGING_VALIDATION_ERROR for malformed input;
 *   GIT_SPAWN_FAILED if git itself cannot be spawned; GIT_ADD_FAILED,
 *   GIT_STATUS_FAILED, GIT_WRITE_TREE_FAILED, GIT_DIFF_FAILED for a non-zero
 *   exit from the corresponding git command; STAGING_MISMATCH when an
 *   enumerated path did not end up staged consistently with its declared
 *   changeType; UNEXPECTED_INDEX_CHANGE when staging altered the status of a
 *   path outside the enumerated list (hook/external mutation).
 */
function stageTaskFiles(cwd, changedPaths) {
  _validateStagingInputs(cwd, changedPaths);

  const enumeratedPaths = changedPaths.map(function (e) { return e.path; });
  const enumeratedSet = new Set(enumeratedPaths);

  const before = _statusSnapshot(cwd);

  _runGitOrThrow('stageTaskFiles', cwd, ['add', '--'].concat(enumeratedPaths), 'GIT_ADD_FAILED', 'staging enumerated paths');

  const after = _statusSnapshot(cwd);

  // UNEXPECTED_INDEX_CHANGE: any path outside the enumerated list whose
  // status differs between the before/after snapshots — covers a path that
  // newly appears, disappears, or changes status code as a side effect of
  // this staging call. Pre-existing dirty state that is unchanged by our
  // call (same status before and after) is out of scope here.
  const unexpected = [];
  const allPaths = new Set(before.keys());
  after.forEach(function (_statusCode, p) { allPaths.add(p); });
  allPaths.forEach(function (p) {
    if (enumeratedSet.has(p)) return;
    if (before.get(p) !== after.get(p)) {
      unexpected.push({ path: p, before: before.get(p) || null, after: after.get(p) || null });
    }
  });
  if (unexpected.length > 0) {
    throw _err(
      'UNEXPECTED_INDEX_CHANGE',
      'stageTaskFiles: staging changed ' + unexpected.length + ' path(s) outside the enumerated changedPaths ' +
        'list: ' + unexpected.map(function (u) { return u.path + ' (' + (u.before || '--') + ' -> ' + (u.after || '--') + ')'; }).join(', ') +
        ' — index left as-is; nothing discarded'
    );
  }

  // STAGING_MISMATCH: every enumerated path must actually be staged, and its
  // staged index status must be consistent with its declared changeType.
  const mismatches = [];
  changedPaths.forEach(function (entry) {
    const statusCode = after.get(entry.path);
    if (!statusCode) {
      mismatches.push(entry.path + ': not staged at all after "git add"');
      return;
    }
    const indexChar = statusCode.charAt(0);
    if (!_indexStatusMatchesChangeType(indexChar, entry.changeType)) {
      mismatches.push(
        entry.path + ': declared changeType "' + entry.changeType + '" but staged index status is "' + indexChar + '"'
      );
    }
  });
  if (mismatches.length > 0) {
    throw _err(
      'STAGING_MISMATCH',
      'stageTaskFiles: staged result does not match declared changedPaths intent: ' + mismatches.join('; ') +
        ' — index left as-is; nothing discarded'
    );
  }

  const treeRes = _runGitOrThrow('stageTaskFiles', cwd, ['write-tree'], 'GIT_WRITE_TREE_FAILED', 'computing resulting tree');
  const treeSha = treeRes.stdout.trim();

  const stagedRes = _runGitOrThrow(
    'stageTaskFiles',
    cwd,
    ['diff', '--cached', '--name-only', '-z', '--no-renames'],
    'GIT_DIFF_FAILED',
    'listing staged paths'
  );
  const stagedPaths = stagedRes.stdout.split('\0').filter(function (p) { return p.length > 0; });

  return { treeSha: treeSha, stagedPaths: stagedPaths };
}

// ── detectChangedPaths (US-07-TASK-BE-01) ───────────────────────────────────
//
// Detects which files an implementation agent actually changed in the
// worktree, producing the {path, changeType} inventory persistCheckpointIntent
// and stageTaskFiles both already require as an explicit, non-wildcard input
// (see their own comments above). This function has NO OTHER RESPONSIBILITY —
// no staging, no intent-building, only detection/reporting. The run loop
// (lib/task-executor/index.js's execute(), US-07-TASK-BE-01) calls it exactly
// once per attempt, immediately after the implementation agent has run and
// BEFORE any staging happens, then reuses the same result both for the review
// diff and for the later checkpoint staging call — so this function must
// never mutate the index or working tree, only read `git status`.
//
// Reuses stageTaskFiles's own proven `git status --porcelain=v1 -z
// --no-renames --untracked-files=all` invocation (see _statusSnapshot above)
// rather than diverging with a second parsing strategy — same flags, same
// NUL-terminated "XY path" record shape, same spawn discipline (shell:false,
// argv array, windowsHide).
//
// Status-code -> changeType mapping (XY: X = index/staged column, Y =
// worktree column; --no-renames guarantees no rename-pair ambiguity — a
// rename shows up as a separate 'D' record for the old path and a separate
// untracked/'A' record for the new path, which is the expected, documented
// behavior per the Work Breakdown outcome, not a bug):
//   '??'                          -> 'add'    (untracked)
//   either column is 'D'          -> 'delete'
//   either column is 'A'          -> 'add'    (newly staged / intent-to-add)
//   anything else (M, R, C, U, ...) -> 'modify' (the documented default for
//     any other porcelain code this function does not special-case above,
//     rather than silently guessing per call site)
function detectChangedPaths(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw _err('DETECT_CHANGED_PATHS_VALIDATION_ERROR', 'detectChangedPaths: cwd must be a non-empty string');
  }
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch (err) {
    throw _err('DETECT_CHANGED_PATHS_VALIDATION_ERROR', 'detectChangedPaths: cwd "' + cwd + '" does not exist (' + err.code + ')');
  }
  if (!stat.isDirectory()) {
    throw _err('DETECT_CHANGED_PATHS_VALIDATION_ERROR', 'detectChangedPaths: cwd "' + cwd + '" must be a directory');
  }

  const res = _runGitOrThrow(
    'detectChangedPaths',
    cwd,
    ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'],
    'GIT_STATUS_FAILED',
    'capturing status snapshot'
  );

  const changedPaths = [];
  res.stdout.split('\0').forEach(function (record) {
    if (record.length === 0) return;
    const statusCode = record.slice(0, 2);
    const filePath = record.slice(3);
    const indexChar = statusCode.charAt(0);
    const worktreeChar = statusCode.charAt(1);

    let changeType;
    if (statusCode === '??') {
      changeType = 'add';
    } else if (indexChar === 'D' || worktreeChar === 'D') {
      changeType = 'delete';
    } else if (indexChar === 'A' || worktreeChar === 'A') {
      changeType = 'add';
    } else {
      changeType = 'modify';
    }

    changedPaths.push({ path: filePath, changeType: changeType });
  });

  return changedPaths;
}

// ── createTaskCommit (US-05-TASK-BE-03) ─────────────────────────────────────
//
// Creates the task commit for an already-persisted checkpoint intent
// (persistCheckpointIntent, US-05-TASK-BE-01) and an already-staged tree
// (stageTaskFiles, US-05-TASK-BE-02), enforcing every guard the Tech-Spec
// requires (section 8) BEFORE anything irreversible happens, then commits
// with `git commit-tree` rather than `git commit`.
//
// Why commit-tree and not `git commit`: `git commit` re-derives the tree to
// commit from the live index at the moment it runs. We have already
// verified stagingResult.treeSha against the checkpoint intent's
// expectedTreeSha (see TREE_MISMATCH below) — using `git commit` would
// throw that verification away and re-read the index a second time,
// reopening exactly the index-drift race (something touches the index
// between our verification and the commit) that verifying the tree was
// meant to close. `git commit-tree <tree> -p <parent>` takes both as
// explicit SHA arguments, so the object committed is provably the object we
// already verified — no re-read, no window.
//
// Hook-detection note (Tech-Spec: "Hooks may fail or change index:
// reinspect tree/parent/trailers after commit, block on mismatch without
// discarding anything"): `git commit-tree` never runs commit hooks
// (pre-commit, commit-msg, post-commit) at all — those only fire for
// `git commit`. So the specific failure mode the Tech-Spec is guarding
// against (a hook mutating the index after we verified it, so the commit
// silently contains something other than what was reviewed) is structurally
// impossible here, not just handled: there is no index read at commit time
// for a hook to have mutated. The post-commit reinspection below is still
// implemented and still meaningful, but for a narrower reason than hook
// interference: (a) it closes the remaining real race, which is a *ref*
// race — something else moving intent.taskRef between our PARENT_MISMATCH
// check and our own update-ref call — closed with a compare-and-swap
// update-ref plus a post-hoc re-read of what the ref now points at and what
// that commit object actually contains; and (b) it defends against a bug in
// this function's own message/trailer construction by re-parsing the exact
// bytes git stored and comparing them back to intent, independently of the
// code path that built them.
//
// The ref is only ever advanced via compare-and-swap:
//   git update-ref <taskRef> <newSha> <parentSha>
// which git fails atomically if taskRef does not currently point at
// parentSha. That, combined with the pre-commit PARENT_MISMATCH check, is
// what proves "ancestry verified on the correct branch" (AC-05 / Work
// Breakdown outcome): the new commit's sole parent is exactly the SHA
// taskRef pointed at immediately before we moved it, and no other commit
// could have landed on taskRef in between.
//
// Assumes intent.taskRef already exists and currently resolves to some
// commit (normally intent.parentSha) — establishing the ref for a brand-new
// task/attempt is out of scope here; see US-05-TASK-BE-01's checkpoint
// intent and the Tech-Spec's N=1/N>1 branch model (section 8).

const TRAILER_KEYS = ['AI-Toolkit-Run', 'AI-Toolkit-Task', 'AI-Toolkit-Attempt', 'AI-Toolkit-Plan'];

function _commitFail(field, reason) {
  throw _err('COMMIT_VALIDATION_ERROR', 'createTaskCommit: ' + field + ' ' + reason);
}

function _validateCommitInputs(cwd, intent, stagingResult) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    _commitFail('cwd', 'must be a non-empty string');
  }
  let stat;
  try {
    stat = fs.statSync(cwd);
  } catch (err) {
    _commitFail('cwd', 'does not exist (' + err.code + ')');
  }
  if (!stat.isDirectory()) {
    _commitFail('cwd', 'must be a directory');
  }

  if (intent == null || typeof intent !== 'object' || Array.isArray(intent)) {
    _commitFail('intent', 'must be an object');
  }
  if (typeof intent.taskRef !== 'string' || intent.taskRef.length === 0) {
    _commitFail('intent.taskRef', 'must be a non-empty string');
  }
  if (typeof intent.parentSha !== 'string' || !SHA_PATTERN.test(intent.parentSha)) {
    _commitFail('intent.parentSha', 'must be a 40-character hex SHA-1 string');
  }
  if (typeof intent.expectedTreeSha !== 'string' || !SHA_PATTERN.test(intent.expectedTreeSha)) {
    _commitFail('intent.expectedTreeSha', 'must be a 40-character hex SHA-1 string');
  }
  if (typeof intent.commitMessage !== 'string' || intent.commitMessage.length === 0) {
    _commitFail('intent.commitMessage', 'must be a non-empty string');
  }
  if (intent.trailers == null || typeof intent.trailers !== 'object' || Array.isArray(intent.trailers)) {
    _commitFail('intent.trailers', 'must be an object with AI-Toolkit-Run/Task/Attempt/Plan');
  }
  TRAILER_KEYS.forEach(function (key) {
    if (typeof intent.trailers[key] !== 'string' || intent.trailers[key].length === 0) {
      _commitFail('intent.trailers["' + key + '"]', 'must be a non-empty string');
    }
  });

  if (stagingResult == null || typeof stagingResult !== 'object' || Array.isArray(stagingResult)) {
    _commitFail('stagingResult', 'must be an object');
  }
  if (typeof stagingResult.treeSha !== 'string' || !SHA_PATTERN.test(stagingResult.treeSha)) {
    _commitFail('stagingResult.treeSha', 'must be a 40-character hex SHA-1 string');
  }
}

// Appends the four trailers in fixed key order as a standard git trailer
// block: the (trailing-whitespace-trimmed) message, a blank line, then one
// "Key: value" line per trailer.
function _buildCommitMessageWithTrailers(commitMessage, trailers) {
  const base = commitMessage.replace(/\s+$/, '');
  const trailerBlock = TRAILER_KEYS.map(function (key) {
    return key + ': ' + trailers[key];
  }).join('\n');
  return base + '\n\n' + trailerBlock + '\n';
}

// Parses `git cat-file -p <commitSha>` output into { tree, parents, message }.
function _parseCommitObject(raw) {
  const lines = raw.split('\n');
  let tree = null;
  const parents = [];
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '') {
      i += 1;
      break;
    }
    if (line.indexOf('tree ') === 0) {
      tree = line.slice(5).trim();
    } else if (line.indexOf('parent ') === 0) {
      parents.push(line.slice(7).trim());
    }
  }
  return { tree: tree, parents: parents, message: lines.slice(i).join('\n') };
}

// Reads the trailing "Key: value" paragraph back out of a commit message
// (the mirror image of _buildCommitMessageWithTrailers) for post-commit
// reinspection.
function _extractTrailingTrailers(message) {
  const trimmed = message.replace(/\s+$/, '');
  const paragraphs = trimmed.split(/\n\n+/);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const map = {};
  lastParagraph.split('\n').forEach(function (line) {
    const idx = line.indexOf(': ');
    if (idx === -1) return;
    map[line.slice(0, idx)] = line.slice(idx + 2);
  });
  return map;
}

/**
 * @param {string} cwd - absolute path to the Git worktree/repo to commit in.
 * @param {object} intent - the checkpoint-intent record shape produced by
 *   persistCheckpointIntent: parentSha, expectedTreeSha, commitMessage,
 *   trailers { AI-Toolkit-Run/Task/Attempt/Plan }, taskRef, ... — read back
 *   from store or the direct return value of persistCheckpointIntent, never
 *   re-derived here.
 * @param {{treeSha: string, stagedPaths: string[]}} stagingResult - the
 *   return value of stageTaskFiles for this same attempt.
 * @returns {{commitSha: string, treeSha: string, parentSha: string}}
 * @throws {Error} COMMIT_VALIDATION_ERROR for malformed input;
 *   TREE_MISMATCH if the staged tree does not match the intent's
 *   expectedTreeSha; PARENT_MISMATCH if intent.taskRef does not currently
 *   resolve to intent.parentSha; GIT_COMMIT_TREE_FAILED, REF_UPDATE_FAILED,
 *   GIT_CAT_FILE_FAILED for a non-zero exit from the corresponding git
 *   command; COMMIT_REINSPECTION_MISMATCH if the commit git actually stored
 *   does not match the intended tree/parent/trailers (defensive — see the
 *   file comment above for why this is not expected to fire in practice).
 *   None of these paths discard or reset anything already on disk.
 */
function createTaskCommit(cwd, intent, stagingResult) {
  _validateCommitInputs(cwd, intent, stagingResult);

  if (stagingResult.treeSha !== intent.expectedTreeSha) {
    throw _err(
      'TREE_MISMATCH',
      'createTaskCommit: staged tree ' + stagingResult.treeSha + ' does not match checkpoint intent\'s ' +
        'expectedTreeSha ' + intent.expectedTreeSha + ' — nothing committed'
    );
  }

  const currentTipRes = _runGitSync('createTaskCommit', cwd, ['rev-parse', '--verify', intent.taskRef + '^{commit}']);
  if (currentTipRes.status !== 0) {
    throw _err(
      'PARENT_MISMATCH',
      'createTaskCommit: could not resolve taskRef "' + intent.taskRef + '" to a commit (' +
        (currentTipRes.stderr || '').trim() + ') — expected it to point at parentSha ' + intent.parentSha +
        ' — nothing committed'
    );
  }
  const currentTip = currentTipRes.stdout.trim();
  if (currentTip !== intent.parentSha) {
    throw _err(
      'PARENT_MISMATCH',
      'createTaskCommit: taskRef "' + intent.taskRef + '" currently points at ' + currentTip + ', not the ' +
        'checkpoint intent\'s parentSha ' + intent.parentSha + ' — the ref moved since the intent was persisted; ' +
        'nothing committed'
    );
  }

  const fullMessage = _buildCommitMessageWithTrailers(intent.commitMessage, intent.trailers);

  const commitTreeRes = _runGitOrThrow(
    'createTaskCommit',
    cwd,
    ['commit-tree', stagingResult.treeSha, '-p', intent.parentSha],
    'GIT_COMMIT_TREE_FAILED',
    'creating commit object',
    { input: fullMessage }
  );
  const newSha = commitTreeRes.stdout.trim();

  // Compare-and-swap: fails atomically if taskRef no longer points at
  // parentSha (moved between the check above and here). Nothing is
  // discarded either way — on failure the new commit object is simply
  // unreferenced (harmless, eligible for eventual gc), and taskRef is left
  // exactly where it was.
  _runGitOrThrow(
    'createTaskCommit',
    cwd,
    ['update-ref', intent.taskRef, newSha, intent.parentSha],
    'REF_UPDATE_FAILED',
    'moving taskRef "' + intent.taskRef + '" to the new commit (compare-and-swap against expected old value ' +
      intent.parentSha + ')'
  );

  // Post-commit reinspection (see file comment above for what this does and
  // does not guard against with commit-tree).
  const catFileRes = _runGitOrThrow(
    'createTaskCommit',
    cwd,
    ['cat-file', '-p', newSha],
    'GIT_CAT_FILE_FAILED',
    'reinspecting the created commit'
  );
  const parsed = _parseCommitObject(catFileRes.stdout);

  if (parsed.tree !== stagingResult.treeSha) {
    throw _err(
      'COMMIT_REINSPECTION_MISMATCH',
      'createTaskCommit: commit ' + newSha + ' tree ' + parsed.tree + ' does not match the intended tree ' +
        stagingResult.treeSha + ' — taskRef already moved to ' + newSha + '; not discarding anything, blocking'
    );
  }
  if (parsed.parents.length !== 1 || parsed.parents[0] !== intent.parentSha) {
    throw _err(
      'COMMIT_REINSPECTION_MISMATCH',
      'createTaskCommit: commit ' + newSha + ' parents [' + parsed.parents.join(', ') + '] do not match the ' +
        'intended single parent ' + intent.parentSha + ' — taskRef already moved to ' + newSha + '; not discarding ' +
        'anything, blocking'
    );
  }
  const actualTrailers = _extractTrailingTrailers(parsed.message);
  const trailerMismatches = TRAILER_KEYS.filter(function (key) {
    return actualTrailers[key] !== intent.trailers[key];
  });
  if (trailerMismatches.length > 0) {
    throw _err(
      'COMMIT_REINSPECTION_MISMATCH',
      'createTaskCommit: commit ' + newSha + ' trailers do not match intent for: ' + trailerMismatches.join(', ') +
        ' — taskRef already moved to ' + newSha + '; not discarding anything, blocking'
    );
  }

  return { commitSha: newSha, treeSha: stagingResult.treeSha, parentSha: intent.parentSha };
}

// ── integrateAttempt (US-08-TASK-BE-03) ─────────────────────────────────────
//
// Serial, dispatch-order integration of one N>1 attempt's already-verified,
// already-committed technical-branch commit onto the feature branch.
// Tech-Spec section 8 (N>1 branch model): "each attempt has unique branch
// ai-toolkit/<runId>/<taskId>/<attempt> ... Commit remains on technical ref
// until integration." / "Integration is serialized by dispatch sequence. Use
// cherry-pick --no-commit into a dedicated run-owned integration worktree at
// expected feature HEAD, then inspect candidate diff and run integration
// checks. This changes no user worktree. On conflict leave state/worktree
// for diagnosis; never automatically abort/reset it. Persist integration
// intent with original SHA, feature-parent, candidate tree and message.
// Create integration commit there, verify, then advance the feature ref only
// by compare-and-swap against expected HEAD ... Record both SHAs and verify
// reachability. Never force-move a branch or overwrite a user's index."
//
// DEVIATION FROM THE DISPATCHED TASK PROMPT — read before changing anything
// here: the task prompt that requested this function described `cwd` as
// "the MAIN project worktree, where integration lands" and its conflict
// handling as "abort cleanly (`git cherry-pick --abort`) and fail closed".
// Both of those are inconsistent with the actual approved artifacts:
//   - The Work Breakdown's own outcome text for this task says
//     "cherry-picks from attempt branch to integration worktree" (not the
//     main project worktree), and the Tech-Spec is explicit that
//     integration "changes no user worktree" and happens in "a dedicated
//     run-owned integration worktree".
//   - The Tech-Spec is equally explicit that on conflict the correct
//     behavior is "leave state/worktree for diagnosis; never automatically
//     abort/reset it" — the exact opposite of an automatic
//     `cherry-pick --abort`.
// This implementation follows the Work Breakdown/Tech-Spec (the approved,
// authoritative documents) rather than the task prompt's paraphrase in both
// respects. `cwd` here is therefore the dedicated, run-owned INTEGRATION
// worktree (checked out on featureRef, kept at the expected feature HEAD
// between calls) — never the user's own main project checkout. See the
// scope-boundary note below the function for what creating/maintaining that
// integration worktree itself is (and is not) responsible for here.
//
// Cherry-pick approach chosen: a REAL `git cherry-pick --no-commit -x`
// (rather than a fully hand-rolled plumbing equivalent). Unlike
// createTaskCommit's feature-branch commit (which deliberately avoids
// `git commit` to prevent re-deriving a tree from a live index it did not
// just verify), the tree this function ultimately commits is NEVER taken
// from cherry-pick's own working state on faith: after `--no-commit`
// finishes cleanly, `git write-tree` is called to capture the resulting
// tree as an explicit SHA (identical discipline to stageTaskFiles), and the
// actual commit object is still built with `git commit-tree <tree> -p
// <parent>` — never with `git commit` or `git cherry-pick`'s own commit
// step. So the "never commit from an unverified live index" rule is fully
// preserved; `git cherry-pick --no-commit` is used only for the one thing
// there is no existing plumbing-only equivalent for in this codebase: three-
// way-merging a commit's diff onto a different parent tree and reporting a
// conflict if it does not apply cleanly. Reimplementing that merge algorithm
// by hand would duplicate Git's own merge machinery for no safety benefit —
// the tree it produces is independently verified via write-tree before
// anything is committed, exactly like every other tree this file commits.
//
// SCOPE BOUNDARY vs US-08-TASK-BE-04 ("tracks originalSha ... and
// integratedSha ... separately; updates integration attempt record"): this
// function does NOT write attempt.originalSha or attempt.integratedSha —
// those attempt-record fields are US-08-TASK-BE-04's own, separate job
// (store.js's registerIntegratedSHA, DONE). This function DOES call store.js's existing
// recordIntegration(taskId, attemptNumber) — a different, already-
// implemented piece of state (the top-level integrationSequence array, not
// the per-attempt SHA fields) that this task's own instructions explicitly
// call out for reuse so integrationSequence reflects real dispatch-serial
// integration order. Calling it here (rather than leaving it to a not-yet-
// existing caller) is deliberate: unlike createTaskCommit/registerCommitSHA
// (where a real caller — index.js's N=1 path — already exists and owns the
// follow-up registration call), no execute()-level N>1 caller exists yet for
// this standalone primitive (same "not yet wired into execute()'s main
// loop" status as createTaskWorktree/createSlotPool), so leaving
// recordIntegration to an as-yet-nonexistent caller would mean it is never
// actually exercised until a future wiring task lands. recordIntegration
// only touches integrationSequence, never attempt.originalSha/integratedSha,
// so calling it here cannot collide with US-08-TASK-BE-04's later field work.
//
// SCOPE BOUNDARY — integration worktree lifecycle: this function assumes its
// `cwd` argument is ALREADY an existing, dedicated, run-owned Git worktree
// checked out on `featureRef`, kept at the expected feature HEAD across
// calls (Tech-Spec: "a clean coordination checkout/branch"). Creating,
// provisioning, or re-synchronizing that worktree is explicitly OUT OF SCOPE
// here — it is a future wiring concern (analogous to how createTaskWorktree,
// US-08-TASK-BE-01, only creates PER-ATTEMPT worktrees, not this shared
// integration one). This function only verifies the worktree it is handed is
// in the expected state (clean, on featureRef, at expectedParentSha) before
// touching it, and fails closed otherwise.
//
// "Run integration checks" (Tech-Spec: "...then inspect candidate diff and
// run integration checks") is ALSO out of scope here: this is a git.js
// primitive, not the run loop — it has no mechanism for invoking arbitrary
// verification commands (that is index.js's runVerifications, an
// LLM/process-orchestration concern this module has never touched). This
// function performs the git-level mechanics only (cherry-pick, tree/parent/
// trailer verification, CAS ref-advance); running additional integration
// checks against the candidate tree before it is committed is left to a
// future caller, exactly like this file's own createTaskCommit leaves
// "review" to index.js's runReview rather than performing it itself.

const INTEGRATED_FROM_TRAILER_KEY = 'AI-Toolkit-Integrated-From';

function _integrationFail(field, reason) {
  throw _err('INTEGRATION_VALIDATION_ERROR', 'integrateAttempt: ' + field + ' ' + reason);
}

function _requireIntegrationString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    _integrationFail(field, 'must be a non-empty string');
  }
}

function _requireIntegrationSha(value, field) {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value)) {
    _integrationFail(field, 'must be a 40-character hex SHA-1 string');
  }
}

function _validateIntegrationInputs(args) {
  if (args == null || typeof args !== 'object' || Array.isArray(args)) {
    _integrationFail('args', 'must be an object');
  }
  _requireIntegrationString(args.executionRoot, 'args.executionRoot');
  _requireIntegrationString(args.runId, 'args.runId');
  _requireIntegrationString(args.taskId, 'args.taskId');
  if (!Number.isInteger(args.attemptNumber) || args.attemptNumber < 1) {
    _integrationFail('args.attemptNumber', 'must be a positive integer');
  }
  _requireIntegrationString(args.cwd, 'args.cwd');
  let stat;
  try {
    stat = fs.statSync(args.cwd);
  } catch (err) {
    _integrationFail('args.cwd', 'does not exist (' + err.code + ')');
  }
  if (!stat.isDirectory()) {
    _integrationFail('args.cwd', 'must be a directory');
  }
  _requireIntegrationString(args.featureRef, 'args.featureRef');
  _requireIntegrationSha(args.expectedParentSha, 'args.expectedParentSha');
  _requireIntegrationString(args.attemptBranch, 'args.attemptBranch');
  _requireIntegrationSha(args.commitSha, 'args.commitSha');
}

// Same merge-base-based reachability check index.js's finalizeTaskCheckpoint
// already uses (_isCommitReachableOnRef) — duplicated locally (git.js does
// not import from index.js; index.js imports FROM git.js) rather than
// restructured into a shared module, matching this module's existing
// tolerance for small, private, single-purpose duplicates over introducing a
// new shared-utility file for one helper (see index.js's own
// _readCommitObjectSummary comment for the identical trade-off already made
// in this codebase).
function _isCommitAncestorOf(cwd, sha, ref) {
  const res = _runGitSync('integrateAttempt', cwd, ['merge-base', '--is-ancestor', sha, ref]);
  if (res.status === 0) return true;
  if (res.status === 1) return false;
  throw _err(
    'GIT_MERGE_BASE_FAILED',
    'integrateAttempt: "git merge-base --is-ancestor ' + sha + ' ' + ref + '" in "' + cwd + '" failed unexpectedly: ' +
      (res.stderr || '').trim()
  );
}

function _requireCommitVerifiedOnAttemptBranch(cwd, commitSha, attemptBranch) {
  const existsRes = _runGitSync('integrateAttempt', cwd, ['cat-file', '-e', commitSha + '^{commit}']);
  if (existsRes.status !== 0) {
    throw _err(
      'INTEGRATION_SOURCE_NOT_FOUND',
      'integrateAttempt: commitSha "' + commitSha + '" does not resolve to a commit object in "' + cwd + '" — nothing integrated'
    );
  }
  if (!_isCommitAncestorOf(cwd, commitSha, attemptBranch)) {
    throw _err(
      'INTEGRATION_SOURCE_NOT_ON_BRANCH',
      'integrateAttempt: commitSha "' + commitSha + '" is not reachable from attemptBranch "' + attemptBranch +
        '" — refusing to integrate an unverified commit; nothing integrated'
    );
  }
}

// The dispatch-order CAS precondition: featureRef's CURRENT tip must already
// be expectedParentSha before anything else runs. Failing this means an
// earlier-dispatched attempt has not integrated yet — per the Tech-Spec's
// "do not overtake earlier dispatched tasks in integration" rule, this
// function never reorders, retries, or forces past that; it fails closed and
// leaves it to the caller to retry integration once dispatch order actually
// allows it.
function _requireFeatureRefAtExpectedParent(cwd, featureRef, expectedParentSha) {
  const res = _runGitSync('integrateAttempt', cwd, ['rev-parse', '--verify', featureRef + '^{commit}']);
  if (res.status !== 0) {
    throw _err(
      'INTEGRATION_PARENT_MISMATCH',
      'integrateAttempt: could not resolve featureRef "' + featureRef + '" to a commit in "' + cwd + '" (' +
        (res.stderr || '').trim() + ') — expected it to point at expectedParentSha ' + expectedParentSha +
        ' — nothing integrated'
    );
  }
  const currentTip = res.stdout.trim();
  if (currentTip !== expectedParentSha) {
    throw _err(
      'INTEGRATION_PARENT_MISMATCH',
      'integrateAttempt: featureRef "' + featureRef + '" currently points at ' + currentTip + ', not the expected ' +
        'parent ' + expectedParentSha + ' — an earlier-dispatched attempt has not integrated yet; this attempt must ' +
        'not overtake it. Nothing integrated; retry in dispatch order.'
    );
  }
}

// Verifies the integration worktree itself is exactly where this function
// requires it before it ever touches it: clean (no pending changes of any
// kind), HEAD resolves to expectedParentSha, and — when HEAD is attached —
// the checked-out branch is featureRef itself, never some other branch.
function _requireIntegrationWorktreeReady(cwd, featureRef, expectedParentSha) {
  const statusRes = _runGitOrThrow(
    'integrateAttempt', cwd,
    ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'],
    'GIT_STATUS_FAILED', 'checking integration worktree cleanliness'
  );
  if (statusRes.stdout.length > 0) {
    throw _err(
      'INTEGRATION_WORKTREE_NOT_CLEAN',
      'integrateAttempt: integration worktree "' + cwd + '" is not clean — refusing to cherry-pick into it; nothing integrated'
    );
  }

  const headRes = _runGitOrThrow('integrateAttempt', cwd, ['rev-parse', '--verify', 'HEAD'], 'GIT_REV_PARSE_FAILED', 'resolving integration worktree HEAD');
  const headSha = headRes.stdout.trim();
  if (headSha !== expectedParentSha) {
    throw _err(
      'INTEGRATION_WORKTREE_STATE_MISMATCH',
      'integrateAttempt: integration worktree "' + cwd + '" HEAD (' + headSha + ') does not match expectedParentSha (' +
        expectedParentSha + ') — refusing to cherry-pick into a worktree that is not at the expected feature HEAD'
    );
  }

  const symRes = _runGitSync('integrateAttempt', cwd, ['symbolic-ref', '-q', '--short', 'HEAD']);
  if (symRes.status !== 0) {
    throw _err(
      'INTEGRATION_WORKTREE_STATE_MISMATCH',
      'integrateAttempt: integration worktree "' + cwd + '" HEAD is detached; expected it checked out on featureRef "' + featureRef + '"'
    );
  }
  const shortRef = symRes.stdout.trim();
  const featureShort = featureRef.indexOf('refs/heads/') === 0 ? featureRef.slice('refs/heads/'.length) : featureRef;
  if (shortRef !== featureShort) {
    throw _err(
      'INTEGRATION_WORKTREE_STATE_MISMATCH',
      'integrateAttempt: integration worktree "' + cwd + '" is checked out on "' + shortRef + '", not featureRef "' +
        featureRef + '" — refusing to cherry-pick into the wrong branch'
    );
  }
}

// Detects a real merge conflict left behind by `git cherry-pick --no-commit`.
// Verified by direct experiment (not assumed from documentation): with
// --no-commit, a conflicting cherry-pick does NOT write .git/CHERRY_PICK_HEAD
// (that marker is only written when git itself is tracking a pending commit
// for --continue/--abort) — the only real signal left behind is the index
// itself containing unmerged entries. Detected the same way `git status`
// reports them: a porcelain status code of exactly "AA"/"DD", or containing
// "U" in either column (unmerged, both-added, or both-deleted).
function _hasConflictedPaths(cwd) {
  const res = _runGitSync('integrateAttempt', cwd, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all']);
  if (res.status !== 0) return false;
  return res.stdout.split('\0').some(function (record) {
    if (record.length === 0) return false;
    const statusCode = record.slice(0, 2);
    return statusCode === 'AA' || statusCode === 'DD' || statusCode.indexOf('U') !== -1;
  });
}

// Appends exactly one trailer line, same "blank line + Key: value" shape
// _buildCommitMessageWithTrailers already uses for the four checkpoint
// trailers — kept as its own small helper (rather than generalizing
// _buildCommitMessageWithTrailers's fixed TRAILER_KEYS) because the
// integration commit reuses the ORIGINAL commit's message verbatim (it is
// the same change, only re-parented) and adds just this one traceability
// trailer, never the checkpoint's four AI-Toolkit-Run/Task/Attempt/Plan
// trailers again (those already exist, unchanged, earlier in the reused
// message).
function _appendIntegratedFromTrailer(message, commitSha) {
  const base = message.replace(/\s+$/, '');
  return base + '\n\n' + INTEGRATED_FROM_TRAILER_KEY + ': ' + commitSha + '\n';
}

/**
 * Integrates one already-verified, already-committed N>1 attempt commit
 * (living on its private technical branch, `attemptBranch`) onto the feature
 * branch (`featureRef`), serially and in dispatch order. See the file
 * section comment above for the full design/scope rationale.
 *
 * @param {object} args
 * @param {string} args.executionRoot - Absolute path to
 *   <common-git-dir>/ai-toolkit/execution (store.js's run-owned root).
 * @param {string} args.runId - UUID of the current run.
 * @param {string} args.taskId - Task ID this attempt belongs to.
 * @param {number} args.attemptNumber - Positive integer attempt number.
 * @param {string} args.cwd - Absolute path to the dedicated, run-owned
 *   INTEGRATION worktree (never the user's main project worktree) — must
 *   already be a clean checkout of featureRef at expectedParentSha.
 * @param {string} args.featureRef - The feature ref being advanced (e.g.
 *   "refs/heads/main" or the run's configured feature branch).
 * @param {string} args.expectedParentSha - The feature ref's expected
 *   current tip — the dispatch-order CAS precondition; INTEGRATION_PARENT_
 *   MISMATCH if featureRef has moved past this (an earlier-dispatched
 *   attempt has not integrated yet).
 * @param {string} args.attemptBranch - The N>1 technical ref
 *   (ai-toolkit/<runId>/<taskId>/<attempt>, as created by createTaskWorktree)
 *   commitSha must be reachable from.
 * @param {string} args.commitSha - The exact, already-verified commit SHA on
 *   attemptBranch to integrate (never a range, never "branch tip" implicitly).
 * @returns {{taskId: string, attemptNumber: number, originalSha: string,
 *   integratedSha: string, treeSha: string, parentSha: string,
 *   featureRef: string, intentId: string}}
 * @throws {Error} INTEGRATION_VALIDATION_ERROR for malformed input;
 *   INTEGRATION_PARENT_MISMATCH if featureRef has moved past
 *   expectedParentSha (do not overtake earlier-dispatched integrations);
 *   INTEGRATION_WORKTREE_NOT_CLEAN / INTEGRATION_WORKTREE_STATE_MISMATCH if
 *   the integration worktree is not exactly where this function requires it;
 *   INTEGRATION_SOURCE_NOT_FOUND / INTEGRATION_SOURCE_NOT_ON_BRANCH if
 *   commitSha cannot be verified against attemptBranch;
 *   INTEGRATION_CONFLICT if the cherry-pick does not apply cleanly — the
 *   worktree is deliberately left exactly as git left it, for diagnosis,
 *   never auto-aborted/reset (Tech-Spec section 8);
 *   GIT_CHERRY_PICK_FAILED for any other non-conflict cherry-pick failure
 *   (also left untouched, same non-destructive discipline);
 *   GIT_WRITE_TREE_FAILED, GIT_COMMIT_TREE_FAILED, GIT_CAT_FILE_FAILED for a
 *   non-zero exit from the corresponding git command; REF_UPDATE_FAILED if
 *   the compare-and-swap update-ref fails (featureRef moved concurrently);
 *   INTEGRATION_REINSPECTION_MISMATCH if the integration commit git actually
 *   stored does not match the intended tree/parent/trailer — featureRef has
 *   already moved at that point; nothing is reverted, the caller must
 *   diagnose; INTEGRATION_CLEANUP_FAILED if the post-integration
 *   `git cherry-pick --quit` sequencer cleanup fails — this does NOT mean
 *   the integration itself failed (featureRef has already been verified
 *   advanced by this point); it means the caller must manually clear the
 *   integration worktree's cherry-pick sequencer state before the next
 *   serial integration can reuse it.
 */
function integrateAttempt(args) {
  _validateIntegrationInputs(args);

  const executionRoot = args.executionRoot;
  const runId = args.runId;
  const taskId = args.taskId;
  const attemptNumber = args.attemptNumber;
  const cwd = args.cwd;
  const featureRef = args.featureRef;
  const expectedParentSha = args.expectedParentSha;
  const attemptBranch = args.attemptBranch;
  const commitSha = args.commitSha;

  // 1. Dispatch-order CAS precondition — never overtake an earlier-dispatched,
  // not-yet-integrated attempt.
  _requireFeatureRefAtExpectedParent(cwd, featureRef, expectedParentSha);

  // 2. The integration worktree must already be exactly where this function
  // requires it: clean, at expectedParentSha, checked out on featureRef.
  _requireIntegrationWorktreeReady(cwd, featureRef, expectedParentSha);

  // 3. commitSha must be a real commit, verified reachable from attemptBranch
  // — never trust the caller's word alone.
  _requireCommitVerifiedOnAttemptBranch(cwd, commitSha, attemptBranch);

  // 4. Apply the change via a real cherry-pick, without committing —
  // see the file section comment above for why --no-commit is used here
  // (real 3-way merge) but commit-tree still builds the actual commit below
  // (never `git commit`/cherry-pick's own commit step).
  const cherryRes = _runGitSync('integrateAttempt', cwd, ['cherry-pick', '--no-commit', '-x', commitSha]);
  if (cherryRes.status !== 0) {
    if (_hasConflictedPaths(cwd)) {
      throw _err(
        'INTEGRATION_CONFLICT',
        'integrateAttempt: cherry-picking ' + commitSha + ' onto "' + featureRef + '" in "' + cwd + '" conflicted — ' +
          'the integration worktree is left exactly as git left it for diagnosis; nothing was auto-aborted or reset ' +
          '(Tech-Spec section 8: "On conflict leave state/worktree for diagnosis; never automatically abort/reset it").'
      );
    }
    throw _err(
      'GIT_CHERRY_PICK_FAILED',
      'integrateAttempt: "git cherry-pick --no-commit -x ' + commitSha + '" in "' + cwd + '" failed (exit ' +
        cherryRes.status + '): ' + (cherryRes.stderr || '').trim() + ' — nothing was auto-aborted or reset'
    );
  }

  // 5. Capture the resulting candidate tree as an explicit, independently
  // verified SHA — never trust cherry-pick's own live index at commit time.
  const treeRes = _runGitOrThrow('integrateAttempt', cwd, ['write-tree'], 'GIT_WRITE_TREE_FAILED', 'computing the candidate integration tree');
  const candidateTreeSha = treeRes.stdout.trim();

  // 6. Reuse the original commit's own message verbatim (this is the same
  // change, only re-parented) plus one traceability trailer back to it.
  const originalCatRes = _runGitOrThrow('integrateAttempt', cwd, ['cat-file', '-p', commitSha], 'GIT_CAT_FILE_FAILED', 'reading the original commit to integrate');
  const originalParsed = _parseCommitObject(originalCatRes.stdout);
  const integrationMessage = _appendIntegratedFromTrailer(originalParsed.message, commitSha);

  // 7. Persist the integration intent BEFORE creating the integration commit
  // (Tech-Spec: "Persist integration intent with original SHA, feature-
  // parent, candidate tree and message") — same "persist before commit"
  // discipline persistCheckpointIntent already applies to checkpoint
  // commits, giving a crash between here and the CAS ref-advance below a
  // durable, exact record to reconcile against later (full reconciliation
  // logic itself is a separate, later concern — see US-06/US-09 scope notes
  // elsewhere in this codebase).
  const intentId = taskId + '-attempt' + attemptNumber + '-integration';
  const writtenIntent = store.writeIntent(executionRoot, runId, intentId, {
    taskId: taskId,
    attemptNumber: attemptNumber,
    originalSha: commitSha,
    attemptBranch: attemptBranch,
    featureRef: featureRef,
    featureParentSha: expectedParentSha,
    candidateTreeSha: candidateTreeSha,
    message: integrationMessage,
  });
  void writtenIntent; // returned for idempotent-replay parity with persistCheckpointIntent; not otherwise consulted here.

  // 8. Create the integration commit via commit-tree — explicit tree/parent
  // SHAs, never a re-derivation from the live index (identical discipline to
  // createTaskCommit).
  const commitTreeRes = _runGitOrThrow(
    'integrateAttempt', cwd,
    ['commit-tree', candidateTreeSha, '-p', expectedParentSha],
    'GIT_COMMIT_TREE_FAILED', 'creating the integration commit object',
    { input: integrationMessage }
  );
  const integratedSha = commitTreeRes.stdout.trim();

  // 9. Advance featureRef ONLY by compare-and-swap against expectedParentSha
  // — fails atomically if it moved concurrently; never force-moved.
  _runGitOrThrow(
    'integrateAttempt', cwd,
    ['update-ref', featureRef, integratedSha, expectedParentSha],
    'REF_UPDATE_FAILED',
    'advancing featureRef "' + featureRef + '" to the integration commit (compare-and-swap against expected old value ' +
      expectedParentSha + ')'
  );

  // 10. Post-commit reinspection — same discipline as createTaskCommit's own
  // post-commit re-read: re-parse the exact bytes git stored, independent of
  // the code path that built them.
  const newCatRes = _runGitOrThrow('integrateAttempt', cwd, ['cat-file', '-p', integratedSha], 'GIT_CAT_FILE_FAILED', 'reinspecting the created integration commit');
  const newParsed = _parseCommitObject(newCatRes.stdout);
  if (newParsed.tree !== candidateTreeSha) {
    throw _err(
      'INTEGRATION_REINSPECTION_MISMATCH',
      'integrateAttempt: integration commit ' + integratedSha + ' tree ' + newParsed.tree + ' does not match the ' +
        'intended candidate tree ' + candidateTreeSha + ' — featureRef already moved to ' + integratedSha +
        '; not reverting, blocking'
    );
  }
  if (newParsed.parents.length !== 1 || newParsed.parents[0] !== expectedParentSha) {
    throw _err(
      'INTEGRATION_REINSPECTION_MISMATCH',
      'integrateAttempt: integration commit ' + integratedSha + ' parents [' + newParsed.parents.join(', ') +
        '] do not match the intended single parent ' + expectedParentSha + ' — featureRef already moved to ' +
        integratedSha + '; not reverting, blocking'
    );
  }
  const newTrailers = _extractTrailingTrailers(newParsed.message);
  if (newTrailers[INTEGRATED_FROM_TRAILER_KEY] !== commitSha) {
    throw _err(
      'INTEGRATION_REINSPECTION_MISMATCH',
      'integrateAttempt: integration commit ' + integratedSha + ' is missing or has a mismatched "' +
        INTEGRATED_FROM_TRAILER_KEY + '" trailer (expected ' + commitSha + ') — featureRef already moved to ' +
        integratedSha + '; not reverting, blocking'
    );
  }

  // 11. Clear the leftover sequencer/merge-state files (.git/MERGE_MSG,
  // .git/AUTO_MERGE — verified by direct experiment; --no-commit does NOT
  // write CHERRY_PICK_HEAD on a clean apply, only these) left behind by step
  // 4's --no-commit — required so the NEXT serial integration reusing this
  // same worktree does not fail with "you have not concluded your previous
  // cherry-pick". `--quit` only forgets this in-progress sequencer state; it
  // does not touch HEAD, the index, or the working tree (both already
  // correct at this point — the ref/commit are already verified above), so
  // this is not a "reset/clean" in the sense the Tech-Spec forbids elsewhere.
  const quitRes = _runGitSync('integrateAttempt', cwd, ['cherry-pick', '--quit']);
  if (quitRes.status !== 0) {
    throw _err(
      'INTEGRATION_CLEANUP_FAILED',
      'integrateAttempt: integration commit ' + integratedSha + ' was created and featureRef advanced successfully, ' +
        'but "git cherry-pick --quit" failed to clear the sequencer state in "' + cwd + '" (' +
        (quitRes.stderr || '').trim() + ') — the integration itself is NOT rolled back; manually run ' +
        '"git cherry-pick --quit" in the integration worktree before the next serial integration.'
    );
  }

  // 12. Record dispatch-serial integration order (integrationSequence only —
  // never attempt.originalSha/integratedSha; see scope-boundary note above).
  let state = store.readState(executionRoot, runId);
  state = state.recordIntegration(taskId, attemptNumber);
  store.writeState(executionRoot, runId, state);

  return {
    taskId: taskId,
    attemptNumber: attemptNumber,
    originalSha: commitSha,
    integratedSha: integratedSha,
    treeSha: candidateTreeSha,
    parentSha: expectedParentSha,
    featureRef: featureRef,
    intentId: intentId,
  };
}

module.exports = {
  persistCheckpointIntent,
  stageTaskFiles,
  createTaskCommit,
  detectChangedPaths,
  integrateAttempt,
};
