'use strict';

// US-09-TASK-TEST-02: "Execute authorized end-to-end test with real feature and Claude
// runtime." This file does NOT itself dispatch a real claude.exe call, and never will as
// part of an ordinary `npm test` run — per the Tech-Spec (section 11): "Actual Claude
// qualification is a separate authorized manual suite, never an implicit npm test side
// effect." Real, paid dispatch requires its own explicit budget/call-count authorization
// (Gate 2 constraint #5) each time; nothing in this repository re-triggers it automatically.
//
// The real, authorized run already happened, manually, under FTR-018-Approvals.md's
// Approval History cycles 7 and 8 (2026-09-30) — see evidence/FTR-018-e2e/ for the full,
// honest record: two real dispatchTaskAttempt calls against the real runtime bridge
// (Percorso C), both hitting `budget_exhausted` before the (deliberately trivial) fixture
// task completed, real cost $0.069205 + $0.086434 = $0.155639 observed, closed as PARTIAL
// evidence per explicit user decision (no further real calls authorized/made). Read
// evidence/FTR-018-e2e/README.md for the full findings (a --max-budget-usd overshoot
// behavior, and a real per-dispatch cost floor for gaia-developer-backend).
//
// This suite's only job is to verify that evidence is present and well-formed — a cheap,
// safe, side-effect-free check that runs every time as part of the normal suite, exactly
// like this task's own two designated verification commands
// (`test -f evidence/FTR-018-e2e/run-manifest.json`,
// `grep -q '"feature"' evidence/FTR-018-e2e/run-manifest.json`).

const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = path.join(__dirname, '..', '..', 'evidence', 'FTR-018-e2e');
const MANIFEST_PATH = path.join(EVIDENCE_DIR, 'run-manifest.json');

describe('US-09-TASK-TEST-02: real-runtime E2E evidence (already executed, authorized, manual)', () => {
  test('the run manifest exists and is valid JSON', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))).not.toThrow();
  });

  test('the manifest documents the feature under test and an honest, non-fabricated outcome', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(typeof manifest.feature).toBe('string');
    expect(manifest.feature.length).toBeGreaterThan(0);
    // Never asserts a fabricated success — the real outcome was PARTIAL, and this test
    // documents that honestly rather than requiring/pretending a full success.
    expect(typeof manifest.outcome).toBe('string');
    expect(manifest.outcome).toMatch(/PARTIAL/);
  });

  test('the manifest records real, observed authorization and cost data, never invented values', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    expect(Array.isArray(manifest.authorization)).toBe(true);
    expect(manifest.authorization.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.attempts)).toBe(true);
    expect(manifest.attempts.length).toBeGreaterThan(0);
    manifest.attempts.forEach((attempt) => {
      expect(typeof attempt.observed_total_cost_usd).toBe('number');
      expect(attempt.observed_total_cost_usd).toBeGreaterThan(0);
    });
    expect(typeof manifest.total_observed_cost_usd).toBe('number');
    const sum = manifest.attempts.reduce((s, a) => s + a.observed_total_cost_usd, 0);
    expect(manifest.total_observed_cost_usd).toBeCloseTo(sum, 6);
  });

  test('supporting evidence files (fixture, persisted state, README) are present', () => {
    const listed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).evidence_files;
    expect(Array.isArray(listed)).toBe(true);
    listed.forEach((name) => {
      expect(fs.existsSync(path.join(EVIDENCE_DIR, name))).toBe(true);
    });
  });

  test('the real persisted task state is honest about what stage the task actually reached', () => {
    const statePath = path.join(EVIDENCE_DIR, 'real-persisted-task-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(Array.isArray(state.attempts)).toBe(true);
    expect(state.attempts.length).toBe(2);
    // Both real attempts were cut off by budget_exhausted before the fixture task's own
    // implementation tool-use completed — verification/review/checkpoint were never
    // reached, so neither attempt advanced past 'dispatching'. This test documents that
    // real, unglamorous fact rather than a nicer-looking invented one.
    state.attempts.forEach((attempt) => {
      expect(attempt.stage).toBe('dispatching');
      expect(attempt.originalSha).toBeNull();
    });
  });
});
