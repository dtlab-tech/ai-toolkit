'use strict'

function buildGate2Payload(options) {
  const {
    wbValidatorReport = null,
    validateFailed = false,
    semanticResult = null,
    semanticFailed = false,
    renderResult = null,
    renderFailed = false,
  } = options

  const wbValidatorPassed = !validateFailed
    && wbValidatorReport !== null
    && wbValidatorReport.valid === true
    && Array.isArray(wbValidatorReport.errors)
    && wbValidatorReport.errors.length === 0

  return {
    js_validator_report:       wbValidatorReport,
    js_validator_failed:       validateFailed,
    semantic_validator_result: semanticResult,
    semantic_validator_failed: semanticFailed,
    renderer_result:           renderResult,
    renderer_failed:           renderFailed,
    duration_bands:      wbValidatorReport ? wbValidatorReport.durationBands : null,
    domain_distribution: wbValidatorReport ? wbValidatorReport.domainDistribution : null,
    warning_band_tasks:  wbValidatorReport
      ? (wbValidatorReport.warnings || [])
          .filter(w => w.category === 'duration_warning')
          .map(w => ({ taskId: w.taskId, estimateMinutes: w.details ? w.details.estimateMinutes : null }))
      : [],
    split_required_tasks: wbValidatorReport
      ? (wbValidatorReport.errors || [])
          .filter(e => e.category === 'split_required')
          .map(e => ({ taskId: e.taskId, estimateMinutes: e.details ? e.details.estimateMinutes : null }))
      : [],
    must_ac_uncovered: wbValidatorReport
      ? (wbValidatorReport.errors || [])
          .filter(e => e.category === 'must_ac_uncovered')
          .map(e => ({ acId: e.details ? e.details.acId : null }))
      : [],
    phase_unschedulable: wbValidatorReport && wbValidatorReport.dependencies
      ? (wbValidatorReport.dependencies.phaseUnschedulable || [])
      : [],
    gate2_blocked:
      validateFailed ||
      !wbValidatorPassed ||
      semanticFailed ||
      renderFailed ||
      Boolean(semanticResult && semanticResult.findings && semanticResult.findings.some(f => f.blocking)),
  }
}

module.exports = { buildGate2Payload }
