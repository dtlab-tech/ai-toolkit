'use strict';

const { simulateLedgerEntries } = require('./helpers/pm-phase2-ledger');

// ─── shared fixtures ──────────────────────────────────────────────────────────

// Minimal report that satisfies wbValidatorPassed (valid=true, empty errors array)
const REPORT_CLEAN = { valid: true, errors: [] };

// A report that reflects exit code 1 — validator ran but found structural errors
const REPORT_INVALID = { valid: false, errors: [{ category: 'missing_field', message: 'outcome missing' }] };

// ─────────────────────────────────────────────────────────────────────────────

describe('pm-phase2 ledger state machine — simulateLedgerEntries()', () => {

  // ── Group 1: wb-validate ledger entries ───────────────────────────────────

  describe('wb-validate ledger entries', () => {

    test('wb-validate passes → entry has final_status done and carries actual token count', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        validateTokens: 500,
        wbValidatorReport: REPORT_CLEAN,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].final_status).toBe('done');
      expect(entries[0].phase_delta_tokens).toBe(500);
      expect(entries[0].error_summary).toBeUndefined();
    });

    test('wb-validate fails technically → entry has final_status failed with error_summary and exit_code', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        validateError: 'Script crashed',
        validateExitCode: 2,
        validateTokens: 100,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].final_status).toBe('failed');
      expect(entries[0].error_summary).toBe('Script crashed');
      expect(entries[0].exit_code).toBe(2);
    });

    test('wb-validate exit 1 (structural errors) → entry has final_status done (completed run, not a failure)', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        validateTokens: 300,
        wbValidatorReport: REPORT_INVALID,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].final_status).toBe('done');
      expect(entries[0].error_summary).toBeUndefined();
    });

    test('wb-validate status_sequence always starts with running — never skipped', () => {
      // Arrange — both success and failure scenarios
      const successScenario = { validateFailed: false, wbValidatorReport: REPORT_CLEAN };
      const failureScenario = { validateFailed: true, wbValidatorReport: null };
      // Act
      const successEntries = simulateLedgerEntries(successScenario);
      const failureEntries = simulateLedgerEntries(failureScenario);
      // Assert
      expect(successEntries[0].status_sequence[0]).toBe('running');
      expect(failureEntries[0].status_sequence[0]).toBe('running');
    });

  });

  // ── Group 2: semantic validator ledger entries ────────────────────────────

  describe('semantic validator ledger entries', () => {

    test('wb-validate failed → semantic entry has final_status skipped with zero tokens and no error_summary', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        validateExitCode: 1,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].final_status).toBe('skipped');
      expect(entries[1].phase_delta_tokens).toBe(0);
      expect(entries[1].error_summary).toBeUndefined();
    });

    test('wb-validate exit 1 with structural errors → semantic entry has final_status skipped (wbValidatorPassed is false)', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_INVALID,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].final_status).toBe('skipped');
    });

    test('wb-validate passed and semantic succeeds → semantic entry has final_status done with actual token count', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        semanticTokens: 1200,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].final_status).toBe('done');
      expect(entries[1].phase_delta_tokens).toBe(1200);
    });

    test('wb-validate passed and semantic fails → semantic entry has final_status failed with error_summary and exit_code null', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        semanticFailed: true,
        semanticError: 'Agent timeout',
        semanticTokens: 800,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].final_status).toBe('failed');
      expect(entries[1].error_summary).toBe('Agent timeout');
      expect(entries[1].exit_code).toBeNull();
    });

    test('skipped semantic entry always has phase_delta_tokens of zero regardless of semanticTokens in scenario', () => {
      // Arrange — wb-validate failed forces semantic to be skipped
      const scenario = {
        validateFailed: true,
        wbValidatorReport: null,
        semanticTokens: 999,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].phase_delta_tokens).toBe(0);
    });

  });

  // ── Group 3: wb-render ledger entries ────────────────────────────────────

  describe('wb-render ledger entries', () => {

    test('wb-validate failed → render entry has final_status skipped', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].final_status).toBe('skipped');
    });

    test('wb-validate exit 1 (structural errors) → render entry has final_status skipped', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_INVALID,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].final_status).toBe('skipped');
    });

    test('wb-validate passed but semantic failed → render entry has final_status skipped', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        semanticFailed: true,
        semanticError: 'Critical gap found',
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].final_status).toBe('skipped');
    });

    test('all steps passed → render entry has final_status done with actual token count', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        renderTokens: 600,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].final_status).toBe('done');
      expect(entries[2].phase_delta_tokens).toBe(600);
    });

    test('render fails → entry has final_status failed with error_summary and exit_code from renderExitCode', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        renderFailed: true,
        renderError: 'Template not found',
        renderExitCode: 3,
        renderTokens: 400,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].final_status).toBe('failed');
      expect(entries[2].error_summary).toBe('Template not found');
      expect(entries[2].exit_code).toBe(3);
    });

  });

  // ── Group 4: token attribution ────────────────────────────────────────────

  describe('token attribution', () => {

    test('done entry carries the actual tokens consumed by the agent', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        validateTokens: 750,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].phase_delta_tokens).toBe(750);
    });

    test('failed entry carries the actual tokens consumed before the failure — not zero', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        validateTokens: 250,
        validateError: 'crash',
        validateExitCode: 1,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].phase_delta_tokens).toBe(250);
      expect(entries[0].phase_delta_tokens).toBeGreaterThan(0);
    });

    test('all skipped entries have phase_delta_tokens of zero regardless of scenario token values', () => {
      // Arrange — wb-validate failure causes both semantic and render to be skipped
      const scenario = {
        validateFailed: true,
        wbValidatorReport: null,
        validateTokens: 999,
        semanticTokens: 999,
        renderTokens: 999,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert — entries[1] and entries[2] are both skipped
      expect(entries[1].phase_delta_tokens).toBe(0);
      expect(entries[2].phase_delta_tokens).toBe(0);
    });

  });

  // ── Group 5: exit_code attribution ───────────────────────────────────────

  describe('exit_code attribution', () => {

    test('wb-validate technical failure with exit_code 2 → entry has exit_code 2', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        validateExitCode: 2,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].exit_code).toBe(2);
    });

    test('wb-validate technical failure with null exit_code → entry has exit_code null', () => {
      // Arrange
      const scenario = {
        validateFailed: true,
        validateExitCode: null,
        wbValidatorReport: null,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[0].exit_code).toBeNull();
    });

    test('render failure → entry has exit_code taken from renderExitCode', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        renderFailed: true,
        renderError: 'crash',
        renderExitCode: 5,
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[2].exit_code).toBe(5);
    });

    test('semantic failure → entry has exit_code null (agent invocation carries no script exit code)', () => {
      // Arrange
      const scenario = {
        validateFailed: false,
        wbValidatorReport: REPORT_CLEAN,
        semanticFailed: true,
        semanticError: 'Timeout',
      };
      // Act
      const entries = simulateLedgerEntries(scenario);
      // Assert
      expect(entries[1].exit_code).toBeNull();
    });

  });

});
