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

module.exports = { wbValidatorPassed, canRunSemantic, canRunRender, gate2IsBlocked }
