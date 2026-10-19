'use strict'

// Pure orchestration predicates extracted from pm-phase2 for testability

function wbValidatorPassed(validateFailed, wbValidatorReport) {
  return !validateFailed
    && wbValidatorReport !== null
    && wbValidatorReport.valid === true
    && Array.isArray(wbValidatorReport.errors)
    && wbValidatorReport.errors.length === 0
}

function canRunSemantic(validateFailed, wbValidatorReport) {
  return wbValidatorPassed(validateFailed, wbValidatorReport)
}

function canRunRender(validateFailed, wbValidatorReport, semanticFailed) {
  return wbValidatorPassed(validateFailed, wbValidatorReport) && !semanticFailed
}

function gate2IsBlocked(validateFailed, wbValidatorReport, semanticFailed, renderFailed, semanticResult) {
  return validateFailed
    || !wbValidatorPassed(validateFailed, wbValidatorReport)
    || semanticFailed
    || renderFailed
    || Boolean(semanticResult && semanticResult.findings && semanticResult.findings.some(f => f.blocking))
}

// Mirrors pm-phase2.js's per-task resume-by-status selection (FTR-020 UC-04, hardened by
// FTR-027): a task is skipped (not dispatched) only when its recorded status is "generated", its
// detail file actually exists on disk, AND isValidFn(detailPath) confirms the file is
// structurally valid (pm-phase2.js's own hasVerificationCommands check) — status and existence
// alone are never trusted. Returns task IDs in the same phase-then-taskIds order pm-phase2.js's
// own loop iterates, since dispatch order matters.
function selectPendingTaskIds(index, wbsDir, existsFn, isValidFn) {
  const pending = []
  for (const phase of index.phases) {
    for (const taskId of phase.taskIds) {
      const task = index.tasks[taskId]
      const detailPath = `${wbsDir}/${task.detailFile}`
      if (task.status === 'generated' && existsFn(detailPath) && isValidFn(detailPath)) continue
      pending.push(taskId)
    }
  }
  return pending
}

module.exports = { wbValidatorPassed, canRunSemantic, canRunRender, gate2IsBlocked, selectPendingTaskIds }
