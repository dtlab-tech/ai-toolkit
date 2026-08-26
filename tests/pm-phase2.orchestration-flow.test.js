'use strict';

const {
  wbValidatorPassed,
  canRunSemantic,
  canRunRender,
  gate2IsBlocked,
} = require('./helpers/pm-phase2-flow');

// ─── shared fixtures ──────────────────────────────────────────────────────────

const REPORT_VALID   = { valid: true,  errors: [] };
const REPORT_INVALID = { valid: false, errors: [{ category: 'schema_version_invalid', message: 'bad schema' }] };

// ─────────────────────────────────────────────────────────────────────────────

describe('pm-phase2 orchestration flow — pure predicates', () => {

  // ── Group 1: wbValidatorPassed ─────────────────────────────────────────────

  describe('wbValidatorPassed()', () => {

    test('returns true when validateFailed is false and report is valid with empty errors', () => {
      // Arrange
      const validateFailed = false;
      const report = { valid: true, errors: [] };
      // Act
      const result = wbValidatorPassed(validateFailed, report);
      // Assert
      expect(result).toBe(true);
    });

    test('returns false when validateFailed is true even though report looks valid (technical failure overrides)', () => {
      // Arrange
      const validateFailed = true;
      const report = { valid: true, errors: [] };
      // Act
      const result = wbValidatorPassed(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false when validateFailed is false but report has valid=false and structural errors', () => {
      // Arrange
      const validateFailed = false;
      const report = { valid: false, errors: [{ category: 'missing_field', message: 'outcome missing' }] };
      // Act
      const result = wbValidatorPassed(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false when validateFailed is false and report is null (no result produced)', () => {
      // Arrange
      const validateFailed = false;
      const report = null;
      // Act
      const result = wbValidatorPassed(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false when validateFailed is false but report has valid=true with non-empty errors array', () => {
      // Arrange
      const validateFailed = false;
      const report = { valid: true, errors: [{ category: 'some_error', message: 'something wrong' }] };
      // Act
      const result = wbValidatorPassed(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

  });

  // ── Group 2: canRunSemantic ────────────────────────────────────────────────

  describe('canRunSemantic()', () => {

    test('returns true (semantic can run) when wb-validate passed with a clean valid report', () => {
      // Arrange
      const validateFailed = false;
      const report = REPORT_VALID;
      // Act
      const result = canRunSemantic(validateFailed, report);
      // Assert
      expect(result).toBe(true);
    });

    test('returns false (semantic is skipped) when wb-validate failed technically', () => {
      // Arrange
      const validateFailed = true;
      const report = REPORT_VALID;
      // Act
      const result = canRunSemantic(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false (semantic is skipped) when wb-validate exit 1 due to structural errors in the report', () => {
      // Arrange
      const validateFailed = false;
      const report = REPORT_INVALID;
      // Act
      const result = canRunSemantic(validateFailed, report);
      // Assert
      expect(result).toBe(false);
    });

  });

  // ── Group 3: canRunRender ──────────────────────────────────────────────────

  describe('canRunRender()', () => {

    test('returns true when wb-validate passed and semantic did not fail', () => {
      // Arrange
      const validateFailed = false;
      const report         = REPORT_VALID;
      const semanticFailed = false;
      // Act
      const result = canRunRender(validateFailed, report, semanticFailed);
      // Assert
      expect(result).toBe(true);
    });

    test('returns false when wb-validate passed but semantic did fail', () => {
      // Arrange
      const validateFailed = false;
      const report         = REPORT_VALID;
      const semanticFailed = true;
      // Act
      const result = canRunRender(validateFailed, report, semanticFailed);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false when wb-validate failed technically regardless of semantic outcome', () => {
      // Arrange
      const validateFailed = true;
      const report         = REPORT_VALID;
      const semanticFailed = false;
      // Act
      const result = canRunRender(validateFailed, report, semanticFailed);
      // Assert
      expect(result).toBe(false);
    });

    test('returns false when wb-validate exit 1 (structural errors) regardless of semantic outcome', () => {
      // Arrange
      const validateFailed = false;
      const report         = REPORT_INVALID;
      const semanticFailed = false;
      // Act
      const result = canRunRender(validateFailed, report, semanticFailed);
      // Assert
      expect(result).toBe(false);
    });

  });

  // ── Group 4: gate2IsBlocked ────────────────────────────────────────────────

  describe('gate2IsBlocked()', () => {

    test('returns false (gate is open) when all steps passed and semantic has no blocking findings', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_VALID;
      const semanticFailed  = false;
      const renderFailed    = false;
      const semanticResult  = { findings: [{ blocking: false, message: 'style suggestion' }] };
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(false);
    });

    test('returns true when validateFailed is true', () => {
      // Arrange
      const validateFailed  = true;
      const report          = REPORT_VALID;
      const semanticFailed  = false;
      const renderFailed    = false;
      const semanticResult  = null;
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

    test('returns true when wb-validate exit 1 (report.valid is false)', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_INVALID;
      const semanticFailed  = false;
      const renderFailed    = false;
      const semanticResult  = null;
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

    test('returns true when semanticFailed is true', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_VALID;
      const semanticFailed  = true;
      const renderFailed    = false;
      const semanticResult  = null;
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

    test('returns true when renderFailed is true', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_VALID;
      const semanticFailed  = false;
      const renderFailed    = true;
      const semanticResult  = null;
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

    test('returns true when semantic result contains at least one blocking finding', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_VALID;
      const semanticFailed  = false;
      const renderFailed    = false;
      const semanticResult  = { findings: [{ blocking: true, message: 'critical scope gap' }] };
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

    test('returns false when semantic result has only non-blocking findings (gate allows proceed)', () => {
      // Arrange
      const validateFailed  = false;
      const report          = REPORT_VALID;
      const semanticFailed  = false;
      const renderFailed    = false;
      const semanticResult  = {
        findings: [
          { blocking: false, message: 'minor wording suggestion' },
          { blocking: false, message: 'optional improvement' },
        ],
      };
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(false);
    });

    test('returns true when multiple failure conditions are true simultaneously', () => {
      // Arrange
      const validateFailed  = true;
      const report          = REPORT_INVALID;
      const semanticFailed  = true;
      const renderFailed    = true;
      const semanticResult  = { findings: [{ blocking: true, message: 'critical gap' }] };
      // Act
      const result = gate2IsBlocked(validateFailed, report, semanticFailed, renderFailed, semanticResult);
      // Assert
      expect(result).toBe(true);
    });

  });

});
