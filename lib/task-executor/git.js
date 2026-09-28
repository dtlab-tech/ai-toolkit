'use strict';

// Git checkpoint/integration module (FTR-018).
//
// Implemented here: checkpoint intent persistence (US-05-TASK-BE-01).
// Still pending: controlled staging with path enumeration (US-05-TASK-BE-02),
// commit creation with task trailers (US-05-TASK-BE-03), SHA registration
// outside the tracked worktree (US-05-TASK-BE-04), commit/ledger
// reconciliation and task completion (US-05-TASK-BE-05), and serialized
// parallel integration (US-08-TASK-BE-03). See FTR-018-Tech-Spec.md section 8
// ("Checkpoint intent ... Persist before commit.").
//
// `integrate` below is still a placeholder — do not add real logic there
// until US-08-TASK-BE-03 lands.

const store = require('./store');

function _notImplemented(fnName, task) {
  const err = new Error(
    'git.' + fnName + ' is NOT_IMPLEMENTED — see Work Breakdown task ' + task
  );
  err.code = 'NOT_IMPLEMENTED';
  err.task = task;
  throw err;
}

function integrate() {
  _notImplemented('integrate', 'US-08-TASK-BE-03');
}

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

module.exports = {
  persistCheckpointIntent,
  integrate,
};
