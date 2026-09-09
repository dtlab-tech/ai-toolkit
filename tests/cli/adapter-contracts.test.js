'use strict';

const {
  CLAUDE_ADAPTER,
  CODEX_ADAPTER,
  COPILOT_ADAPTER,
} = require('../../lib/agent-registry');

// ── Adapter interface contract tests (AC-32) ──────────────────────────────────
//
// These tests verify the documented PlatformAdapter input/output shape without
// requiring a working Codex or Copilot runtime.
//
// Three assertions form the complete contract check:
//   1. Every adapter exposes the required interface members (platformId + resolve).
//   2. Codex and Copilot stubs are non-functional: resolve() throws the documented
//      "not implemented" error on every call, with any opts.
//   3. The contract shape is identical across all three adapters so that no silent
//      drift can occur between the operational Claude adapter and the stubs.

const REQUIRED_MEMBERS = ['platformId', 'resolve'];

// ── CLAUDE_ADAPTER ────────────────────────────────────────────────────────────

describe('CLAUDE_ADAPTER', () => {
  test('exposes all required interface members (platformId, resolve)', () => {
    for (const member of REQUIRED_MEMBERS) {
      expect(CLAUDE_ADAPTER).toHaveProperty(member);
    }
  });

  test('platformId is "claude"', () => {
    expect(CLAUDE_ADAPTER.platformId).toBe('claude');
  });

  test('resolve is a function', () => {
    expect(typeof CLAUDE_ADAPTER.resolve).toBe('function');
  });
});

// ── CODEX_ADAPTER (contractual stub — AC-32) ──────────────────────────────────

describe('CODEX_ADAPTER — contractual stub (AC-32)', () => {
  test('exposes all required interface members (platformId, resolve)', () => {
    for (const member of REQUIRED_MEMBERS) {
      expect(CODEX_ADAPTER).toHaveProperty(member);
    }
  });

  test('platformId is "codex"', () => {
    expect(CODEX_ADAPTER.platformId).toBe('codex');
  });

  test('resolve is a function', () => {
    expect(typeof CODEX_ADAPTER.resolve).toBe('function');
  });

  test('resolve() throws the documented not-implemented error when called with empty opts', async () => {
    await expect(CODEX_ADAPTER.resolve({})).rejects.toThrow(
      'codex adapter not implemented — contractual stub (AC-32)'
    );
  });

  test('resolve() is not a functional implementation — throws even with real-looking opts', async () => {
    await expect(
      CODEX_ADAPTER.resolve({ projectDir: '/tmp', agentId: 'gaia.agent.developer.backend' })
    ).rejects.toThrow('codex adapter not implemented — contractual stub (AC-32)');
  });
});

// ── COPILOT_ADAPTER (contractual stub — AC-32) ────────────────────────────────

describe('COPILOT_ADAPTER — contractual stub (AC-32)', () => {
  test('exposes all required interface members (platformId, resolve)', () => {
    for (const member of REQUIRED_MEMBERS) {
      expect(COPILOT_ADAPTER).toHaveProperty(member);
    }
  });

  test('platformId is "copilot"', () => {
    expect(COPILOT_ADAPTER.platformId).toBe('copilot');
  });

  test('resolve is a function', () => {
    expect(typeof COPILOT_ADAPTER.resolve).toBe('function');
  });

  test('resolve() throws the documented not-implemented error when called with empty opts', async () => {
    await expect(COPILOT_ADAPTER.resolve({})).rejects.toThrow(
      'copilot adapter not implemented — contractual stub (AC-32)'
    );
  });

  test('resolve() is not a functional implementation — throws even with real-looking opts', async () => {
    await expect(
      COPILOT_ADAPTER.resolve({ projectDir: '/tmp', agentId: 'gaia.agent.developer.backend' })
    ).rejects.toThrow('copilot adapter not implemented — contractual stub (AC-32)');
  });
});

// ── Contract shape consistency ────────────────────────────────────────────────
//
// Ensures the contract cannot silently drift: all three adapters must expose
// exactly the same set of top-level members.

describe('Contract shape consistency (all adapters)', () => {
  test('all three adapters expose exactly the same set of interface members', () => {
    const claudeKeys  = Object.keys(CLAUDE_ADAPTER).sort();
    const codexKeys   = Object.keys(CODEX_ADAPTER).sort();
    const copilotKeys = Object.keys(COPILOT_ADAPTER).sort();

    expect(codexKeys).toEqual(claudeKeys);
    expect(copilotKeys).toEqual(claudeKeys);
  });

  test('all three adapters satisfy the REQUIRED_MEMBERS contract', () => {
    for (const adapter of [CLAUDE_ADAPTER, CODEX_ADAPTER, COPILOT_ADAPTER]) {
      for (const member of REQUIRED_MEMBERS) {
        expect(adapter).toHaveProperty(member);
      }
    }
  });

  test('platformIds are distinct — no two adapters share the same platform identifier', () => {
    const ids = [
      CLAUDE_ADAPTER.platformId,
      CODEX_ADAPTER.platformId,
      COPILOT_ADAPTER.platformId,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all three adapters have a string platformId and a function resolve', () => {
    for (const adapter of [CLAUDE_ADAPTER, CODEX_ADAPTER, COPILOT_ADAPTER]) {
      expect(typeof adapter.platformId).toBe('string');
      expect(typeof adapter.resolve).toBe('function');
    }
  });
});
