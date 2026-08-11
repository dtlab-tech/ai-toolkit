'use strict';

const { buildGate2Payload } = require('./helpers/pm-phase2-gate2');

// ─── shared fixtures ──────────────────────────────────────────────────────────

// Minimal report that satisfies wbValidatorPassed (valid=true, empty errors array)
const REPORT_CLEAN = { valid: true, errors: [] };

// A report that fails structural validation (valid=false)
const REPORT_INVALID = { valid: false, errors: [{ category: 'schema_version_invalid', message: 'bad schema' }] };

// ─────────────────────────────────────────────────────────────────────────────

describe('pm-phase2 gate2_payload assembly — buildGate2Payload()', () => {

  // ── Group 1: gate2_blocked flag ───────────────────────────────────────────

  describe('gate2_blocked flag', () => {

    test('is false when wb-validate passed, semantic ok, render ok, and no blocking findings', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    false,
        semanticResult:    { findings: [{ blocking: false, message: 'style suggestion' }] },
        semanticFailed:    false,
        renderResult:      { ok: true },
        renderFailed:      false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(false);
    });

    test('is true when validateFailed is true (wb-validate technical failure)', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    true,
        semanticFailed:    false,
        renderFailed:      false,
        semanticResult:    null,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(true);
    });

    test('is true when wb-validate exits 1 with valid=false in report', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_INVALID,
        validateFailed:    false,
        semanticFailed:    false,
        renderFailed:      false,
        semanticResult:    null,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(true);
    });

    test('is true when semanticFailed is true', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    false,
        semanticFailed:    true,
        renderFailed:      false,
        semanticResult:    null,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(true);
    });

    test('is true when renderFailed is true', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    false,
        semanticFailed:    false,
        renderFailed:      true,
        semanticResult:    null,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(true);
    });

    test('is true when semantic result contains at least one blocking finding', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    false,
        semanticFailed:    false,
        renderFailed:      false,
        semanticResult:    { findings: [{ blocking: true, message: 'critical scope gap' }] },
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(true);
    });

    test('is false when semantic result has only non-blocking (warning-level) findings', () => {
      // Arrange
      const options = {
        wbValidatorReport: REPORT_CLEAN,
        validateFailed:    false,
        semanticFailed:    false,
        renderFailed:      false,
        semanticResult:    {
          findings: [
            { blocking: false, message: 'minor wording suggestion' },
            { blocking: false, message: 'optional improvement' },
          ],
        },
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.gate2_blocked).toBe(false);
    });

  });

  // ── Group 2: warning_band_tasks derivation ────────────────────────────────

  describe('warning_band_tasks derivation', () => {

    test('has one entry with correct taskId and estimateMinutes when report has one duration_warning', () => {
      // Arrange
      const options = {
        wbValidatorReport: {
          valid:   true,
          errors:  [],
          warnings: [
            { category: 'duration_warning', taskId: 'US-01-T03', details: { estimateMinutes: 110 } },
          ],
        },
        validateFailed: false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.warning_band_tasks).toHaveLength(1);
      expect(payload.warning_band_tasks[0]).toEqual({ taskId: 'US-01-T03', estimateMinutes: 110 });
    });

    test('is an empty array when report has no warnings', () => {
      // Arrange
      const options = {
        wbValidatorReport: { valid: true, errors: [], warnings: [] },
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.warning_band_tasks).toEqual([]);
    });

    test('is an empty array when report is null', () => {
      // Arrange
      const options = {
        wbValidatorReport: null,
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.warning_band_tasks).toEqual([]);
    });

  });

  // ── Group 3: split_required_tasks derivation ──────────────────────────────

  describe('split_required_tasks derivation', () => {

    test('has one entry with taskId and estimateMinutes when report has one split_required error', () => {
      // Arrange
      const options = {
        wbValidatorReport: {
          valid: false,
          errors: [
            { category: 'split_required', taskId: 'US-02-T01', details: { estimateMinutes: 200 } },
          ],
        },
        validateFailed: false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.split_required_tasks).toHaveLength(1);
      expect(payload.split_required_tasks[0]).toEqual({ taskId: 'US-02-T01', estimateMinutes: 200 });
    });

    test('is an empty array when report errors have no split_required category entries', () => {
      // Arrange
      const options = {
        wbValidatorReport: {
          valid: false,
          errors: [
            { category: 'must_ac_uncovered', taskId: 'US-01-T01', details: { acId: 'AC-01' } },
            { category: 'schema_version_invalid', taskId: null, details: null },
          ],
        },
        validateFailed: false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.split_required_tasks).toEqual([]);
    });

    test('is an empty array when report is null', () => {
      // Arrange
      const options = {
        wbValidatorReport: null,
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.split_required_tasks).toEqual([]);
    });

  });

  // ── Group 4: must_ac_uncovered derivation ─────────────────────────────────

  describe('must_ac_uncovered derivation', () => {

    test('has one entry with acId when report has one must_ac_uncovered error', () => {
      // Arrange
      const options = {
        wbValidatorReport: {
          valid: false,
          errors: [
            { category: 'must_ac_uncovered', taskId: null, details: { acId: 'AC-03' } },
          ],
        },
        validateFailed: false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.must_ac_uncovered).toHaveLength(1);
      expect(payload.must_ac_uncovered[0]).toEqual({ acId: 'AC-03' });
    });

    test('is an empty array when report is null', () => {
      // Arrange
      const options = {
        wbValidatorReport: null,
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.must_ac_uncovered).toEqual([]);
    });

  });

  // ── Group 5: phase_unschedulable derivation ───────────────────────────────

  describe('phase_unschedulable derivation', () => {

    test('contains the unschedulable phase id when report dependencies flag one phase', () => {
      // Arrange
      const options = {
        wbValidatorReport: {
          valid:        true,
          errors:       [],
          dependencies: { phaseUnschedulable: ['Phase-2'] },
        },
        validateFailed: false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.phase_unschedulable).toContain('Phase-2');
      expect(payload.phase_unschedulable).toHaveLength(1);
    });

    test('is an empty array when report is null', () => {
      // Arrange
      const options = {
        wbValidatorReport: null,
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.phase_unschedulable).toEqual([]);
    });

  });

  // ── Group 6: duration_bands and domain_distribution passthrough ───────────

  describe('duration_bands and domain_distribution passthrough', () => {

    test('duration_bands is the durationBands object from the report', () => {
      // Arrange
      const durationBands = { target: 5, aboveTarget: 2, warning: 1, splitRequired: 0 };
      const options = {
        wbValidatorReport: { valid: true, errors: [], durationBands },
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.duration_bands).toEqual(durationBands);
    });

    test('domain_distribution is the domainDistribution object from the report', () => {
      // Arrange
      const domainDistribution = { BE: 3 };
      const options = {
        wbValidatorReport: { valid: true, errors: [], domainDistribution },
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.domain_distribution).toEqual(domainDistribution);
    });

    test('duration_bands and domain_distribution are both null when report is null', () => {
      // Arrange
      const options = {
        wbValidatorReport: null,
        validateFailed:    false,
      };
      // Act
      const payload = buildGate2Payload(options);
      // Assert
      expect(payload.duration_bands).toBeNull();
      expect(payload.domain_distribution).toBeNull();
    });

  });

});
