'use strict'

// Pure simulation of the ledger state machine from pm-phase2.js
// Input: the scenario (which steps pass/fail/skip)
// Output: array of ledger entry specifications that pm-phase2 would write

function simulateLedgerEntries(scenario) {
  const {
    validateFailed = false,
    validateExitCode = 0,
    validateError = null,
    validateTokens = 0,
    wbValidatorReport = null,
    semanticSkipped = false,
    semanticFailed = false,
    semanticError = null,
    semanticTokens = 0,
    renderSkipped = false,
    renderFailed = false,
    renderError = null,
    renderExitCode = null,
    renderTokens = 0,
  } = scenario

  const wbValidatorPassed = !validateFailed
    && wbValidatorReport !== null
    && wbValidatorReport.valid === true
    && Array.isArray(wbValidatorReport.errors)
    && wbValidatorReport.errors.length === 0

  const entries = []

  // Step 2: wb-validate
  // Always appends 'running', then updates to 'done' or 'failed'
  entries.push({
    agent: 'wb-validate:phase2',
    status_sequence: validateFailed ? ['running', 'failed'] : ['running', 'done'],
    final_status: validateFailed ? 'failed' : 'done',
    phase_delta_tokens: validateTokens,
    error_summary: validateFailed ? (validateError || '<unknown error>') : undefined,
    exit_code: validateFailed ? (validateExitCode ?? null) : undefined,
  })

  // Step 3: semantic validator
  if (!wbValidatorPassed) {
    entries.push({
      agent: 'validate-work-breakdown-semantic:phase2',
      status_sequence: ['skipped'],
      final_status: 'skipped',
      phase_delta_tokens: 0,
      error_summary: undefined,
      exit_code: undefined,
    })
  } else if (semanticFailed) {
    entries.push({
      agent: 'validate-work-breakdown-semantic:phase2',
      status_sequence: ['running', 'failed'],
      final_status: 'failed',
      phase_delta_tokens: semanticTokens,
      error_summary: semanticError || '<unknown error>',
      exit_code: null,
    })
  } else {
    entries.push({
      agent: 'validate-work-breakdown-semantic:phase2',
      status_sequence: ['running', 'done'],
      final_status: 'done',
      phase_delta_tokens: semanticTokens,
      error_summary: undefined,
      exit_code: undefined,
    })
  }

  // Step 4: wb-render
  const canRender = wbValidatorPassed && !semanticFailed
  if (!canRender) {
    entries.push({
      agent: 'wb-render:phase2',
      status_sequence: ['skipped'],
      final_status: 'skipped',
      phase_delta_tokens: 0,
      error_summary: undefined,
      exit_code: undefined,
    })
  } else if (renderFailed) {
    entries.push({
      agent: 'wb-render:phase2',
      status_sequence: ['running', 'failed'],
      final_status: 'failed',
      phase_delta_tokens: renderTokens,
      error_summary: renderError || '<unknown error>',
      exit_code: renderExitCode,
    })
  } else {
    entries.push({
      agent: 'wb-render:phase2',
      status_sequence: ['running', 'done'],
      final_status: 'done',
      phase_delta_tokens: renderTokens,
      error_summary: undefined,
      exit_code: undefined,
    })
  }

  return entries
}

module.exports = { simulateLedgerEntries }
