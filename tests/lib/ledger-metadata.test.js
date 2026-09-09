'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ledger = require('../../lib/execution-ledger');

// ---------------------------------------------------------------------------
// Helper — read the raw ledger array from disk.
// ---------------------------------------------------------------------------
function readEntries(tmpDir, prefix) {
  const ledgerFile = path.join(tmpDir, prefix + '-token-ledger.json');
  if (!fs.existsSync(ledgerFile)) return null;
  return JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
}

// ---------------------------------------------------------------------------
// Whitelisted metadata stored on first open
// ---------------------------------------------------------------------------

describe('ledger-metadata — first open stores whitelisted metadata', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores all six whitelisted metadata fields on the entry', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = {
      agentId:         'gaia.agent.developer.backend',
      nativeAgentName: 'gaia-developer-backend',
      platform:        'claude',
      toolkitVersion:  '0.13.0',
      resolutionScope: 'project',
      definitionHash:  'sha256:abc123def456',
    };

    // Act
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert: all six fields appear on the stored entry
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
    expect(entries[0].agentId).toBe('gaia.agent.developer.backend');
    expect(entries[0].nativeAgentName).toBe('gaia-developer-backend');
    expect(entries[0].platform).toBe('claude');
    expect(entries[0].toolkitVersion).toBe('0.13.0');
    expect(entries[0].resolutionScope).toBe('project');
    expect(entries[0].definitionHash).toBe('sha256:abc123def456');
  });

  it('metadata fields coexist with reserved fields without overwriting them', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = {
      agentId:  'gaia.agent.developer.backend',
      platform: 'claude',
    };

    // Act
    const result = ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert: reserved fields are present and correct
    const entry = result.entry;
    expect(entry.agent).toBe('test-agent');
    expect(entry.phase).toBe('phase1');
    expect(entry.model).toBe('haiku');
    expect(entry.status).toBe('running');
    expect(typeof entry.started_at).toBe('string');
    expect(entry.completed_at).toBeNull();
    expect(entry.phase_delta_tokens).toBeNull();

    // Assert: metadata fields are also present
    expect(entry.agentId).toBe('gaia.agent.developer.backend');
    expect(entry.platform).toBe('claude');
  });

  it('a subset of whitelisted metadata keys is accepted (not all keys required)', () => {
    // Arrange: only two of the six whitelisted keys
    const prefix   = 'FTR-META';
    const metadata = {
      agentId:  'gaia.agent.review.solution',
      platform: 'claude',
    };

    // Act & Assert: does not throw
    expect(() => {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    }).not.toThrow();

    // Assert: only the supplied keys appear (no phantom keys created)
    const entries = readEntries(tmpDir, prefix);
    expect(entries[0].agentId).toBe('gaia.agent.review.solution');
    expect(entries[0].platform).toBe('claude');
    expect(entries[0].nativeAgentName).toBeUndefined();
    expect(entries[0].toolkitVersion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unknown metadata key rejected (throws, no write)
// ---------------------------------------------------------------------------

describe('ledger-metadata — unknown metadata key rejected before write', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws METADATA_UNKNOWN_KEY when an unknown key is supplied', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { unknownKey: 'value' };

    // Act
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (e) {
      caughtErr = e;
    }

    // Assert: an error was thrown with the correct code
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_UNKNOWN_KEY');
  });

  it('writes nothing to the ledger when an unknown key is rejected', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { unknownKey: 'value' };

    // Act: suppress the thrown error
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (_) {}

    // Assert: no ledger file was created (fail-closed — no write occurred)
    const ledgerFile = path.join(tmpDir, prefix + '-token-ledger.json');
    expect(fs.existsSync(ledgerFile)).toBe(false);
  });

  it('throws when a mix of valid and unknown keys is supplied', () => {
    // Arrange: one valid + one invalid key
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.x', badKey: 'oops' };

    // Act & Assert
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_UNKNOWN_KEY');
    expect(caughtErr.key).toBe('badKey');
  });
});

// ---------------------------------------------------------------------------
// Reserved-field key in metadata rejected
// ---------------------------------------------------------------------------

describe('ledger-metadata — reserved-field key in metadata rejected', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws METADATA_RESERVED_FIELD when "agent" is supplied in metadata', () => {
    // Arrange: "agent" is a reserved FTR-016 field
    const prefix   = 'FTR-META';
    const metadata = { agent: 'attacker-override' };

    // Act
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_RESERVED_FIELD');
    expect(caughtErr.key).toBe('agent');
  });

  it('throws METADATA_RESERVED_FIELD when "operation_id" is supplied in metadata', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { operation_id: 'fake-id' };

    // Act
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_RESERVED_FIELD');
  });

  it('throws METADATA_RESERVED_FIELD when "status" is supplied in metadata', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { status: 'done' };

    // Act
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_RESERVED_FIELD');
  });

  it('writes nothing when a reserved-field key is rejected', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { started_at: '1970-01-01T00:00:00Z' };

    // Act
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    } catch (_) {}

    // Assert: no ledger file was created
    const ledgerFile = path.join(tmpDir, prefix + '-token-ledger.json');
    expect(fs.existsSync(ledgerFile)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Same-metadata re-open is a no-op (preserves started_at + metadata)
// ---------------------------------------------------------------------------

describe('ledger-metadata — same metadata re-open is a no-op', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-opening with identical metadata produces no duplicate entry', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.agent.x', platform: 'claude' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Act: re-open with the exact same metadata
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert: still exactly one entry
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
  });

  it('re-opening with identical metadata preserves the original started_at', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.agent.x', platform: 'claude' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);
    const originalStartedAt = readEntries(tmpDir, prefix)[0].started_at;

    // Act: re-open
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert: started_at unchanged
    const entries = readEntries(tmpDir, prefix);
    expect(entries[0].started_at).toBe(originalStartedAt);
  });

  it('re-opening with identical metadata preserves all stored metadata fields', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = {
      agentId:         'gaia.agent.orchestrator.feature.phase3',
      nativeAgentName: 'pm-phase3',
      platform:        'claude',
      toolkitVersion:  '0.13.0',
      resolutionScope: 'project',
      definitionHash:  'sha256:deadbeef',
    };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Act: re-open with the exact same metadata object
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert: all metadata fields remain exactly as first written
    const entry = readEntries(tmpDir, prefix)[0];
    expect(entry.agentId).toBe('gaia.agent.orchestrator.feature.phase3');
    expect(entry.nativeAgentName).toBe('pm-phase3');
    expect(entry.platform).toBe('claude');
    expect(entry.toolkitVersion).toBe('0.13.0');
    expect(entry.resolutionScope).toBe('project');
    expect(entry.definitionHash).toBe('sha256:deadbeef');
  });

  it('re-opening with identical metadata keeps status running', () => {
    // Arrange
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.agent.x' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Act: re-open
    const result = ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Assert
    expect(result.entry.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// Different-metadata re-open throws and writes nothing
// ---------------------------------------------------------------------------

describe('ledger-metadata — different metadata re-open throws and writes nothing', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws METADATA_CONFLICT when re-opening with a different metadata value', () => {
    // Arrange: first open with original metadata
    const prefix           = 'FTR-META';
    const originalMetadata = { agentId: 'gaia.agent.x', platform: 'claude' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, originalMetadata);

    // Act: re-open with a different agentId
    const conflictMetadata = { agentId: 'gaia.agent.DIFFERENT', platform: 'claude' };
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, conflictMetadata);
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_CONFLICT');
  });

  it('writes nothing when a metadata conflict is detected on re-open', () => {
    // Arrange: first open
    const prefix           = 'FTR-META';
    const originalMetadata = { agentId: 'gaia.agent.x', platform: 'claude' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, originalMetadata);

    // Capture the ledger state after the first open
    const snapshotBefore = JSON.stringify(readEntries(tmpDir, prefix));

    // Act: attempt conflicting re-open
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, { agentId: 'gaia.agent.DIFFERENT' });
    } catch (_) {}

    // Assert: ledger is bit-for-bit identical to the snapshot taken before the failed re-open
    const snapshotAfter = JSON.stringify(readEntries(tmpDir, prefix));
    expect(snapshotAfter).toBe(snapshotBefore);
  });

  it('throws METADATA_CONFLICT when re-opening supplies extra keys not in stored metadata', () => {
    // Arrange: first open with one metadata key
    const prefix           = 'FTR-META';
    const originalMetadata = { agentId: 'gaia.agent.x' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, originalMetadata);

    // Act: re-open with an extra key added
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, {
        agentId:  'gaia.agent.x',
        platform: 'claude',          // extra key — not stored originally
      });
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_CONFLICT');
  });

  it('throws METADATA_CONFLICT when re-opening with a missing key from stored metadata', () => {
    // Arrange: first open with two keys
    const prefix           = 'FTR-META';
    const originalMetadata = { agentId: 'gaia.agent.x', platform: 'claude' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, originalMetadata);

    // Act: re-open with only one of the original keys (missing platform)
    let caughtErr;
    try {
      ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, { agentId: 'gaia.agent.x' });
    } catch (e) {
      caughtErr = e;
    }

    // Assert
    expect(caughtErr).toBeDefined();
    expect(caughtErr.code).toBe('METADATA_CONFLICT');
  });
});

// ---------------------------------------------------------------------------
// Omitting metadata preserves exact FTR-016 behavior
// ---------------------------------------------------------------------------

describe('ledger-metadata — omitting metadata preserves FTR-016 behavior', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-meta-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('open() without metadata arg creates a standard running entry with no metadata fields', () => {
    // Arrange
    const prefix = 'FTR-META';

    // Act: call with six args (FTR-016 signature)
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1);

    // Assert: entry has the expected FTR-016 fields
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('running');
    expect(entries[0].agent).toBe('test-agent');
    expect(entries[0].phase).toBe('phase1');
    expect(entries[0].model).toBe('haiku');
    expect(entries[0].completed_at).toBeNull();
    expect(entries[0].phase_delta_tokens).toBeNull();

    // Assert: no metadata fields were added
    for (const key of ['agentId', 'nativeAgentName', 'platform', 'toolkitVersion', 'resolutionScope', 'definitionHash']) {
      expect(entries[0][key]).toBeUndefined();
    }
  });

  it('re-opening without metadata is a no-op (preserves started_at, FTR-016 resume behavior)', () => {
    // Arrange: first open
    const prefix = 'FTR-META';
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1);
    const originalStartedAt = readEntries(tmpDir, prefix)[0].started_at;

    // Act: re-open without metadata
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1);

    // Assert: single entry, started_at preserved (FTR-016 resume safety)
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
    expect(entries[0].started_at).toBe(originalStartedAt);
    expect(entries[0].status).toBe('running');
  });

  it('close() after open()-with-metadata preserves stored metadata fields verbatim', () => {
    // Arrange: open with metadata, then close
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.agent.x', platform: 'claude', toolkitVersion: '0.13.0' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Act: close updates status/timestamps; metadata must survive
    ledger.close(tmpDir, prefix, 'test-agent', 1500, 1);

    // Assert: metadata fields preserved verbatim on the closed entry
    const entries = readEntries(tmpDir, prefix);
    expect(entries[0].status).toBe('done');
    expect(entries[0].agentId).toBe('gaia.agent.x');
    expect(entries[0].platform).toBe('claude');
    expect(entries[0].toolkitVersion).toBe('0.13.0');
    expect(entries[0].phase_delta_tokens).toBe(1500);
    expect(entries[0].completed_at).toBeTruthy();
  });

  it('fail() after open()-with-metadata preserves stored metadata fields verbatim', () => {
    // Arrange: open with metadata, then fail
    const prefix   = 'FTR-META';
    const metadata = { agentId: 'gaia.agent.x', resolutionScope: 'project' };
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, metadata);

    // Act
    ledger.fail(tmpDir, prefix, 'test-agent', 'something went wrong', 1);

    // Assert: metadata preserved, status failed
    const entries = readEntries(tmpDir, prefix);
    expect(entries[0].status).toBe('failed');
    expect(entries[0].agentId).toBe('gaia.agent.x');
    expect(entries[0].resolutionScope).toBe('project');
    expect(entries[0].completed_at).toBeTruthy();
  });

  it('open() with explicit undefined metadata behaves identically to omitting it', () => {
    // Arrange
    const prefix = 'FTR-META';

    // Act: pass undefined explicitly as the 7th argument
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, undefined);

    // Assert: no metadata fields present (same as no-arg call)
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
    expect(entries[0].agentId).toBeUndefined();
    expect(entries[0].status).toBe('running');
  });

  it('open() with null metadata behaves identically to omitting it', () => {
    // Arrange
    const prefix = 'FTR-META';

    // Act: pass null explicitly as the 7th argument
    ledger.open(tmpDir, prefix, 'test-agent', 'phase1', 'haiku', 1, null);

    // Assert: no metadata fields present
    const entries = readEntries(tmpDir, prefix);
    expect(entries).toHaveLength(1);
    expect(entries[0].agentId).toBeUndefined();
    expect(entries[0].status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// _validateMetadata unit tests (direct)
// ---------------------------------------------------------------------------

describe('ledger-metadata — _validateMetadata direct unit tests', () => {
  it('accepts all six whitelisted keys without throwing', () => {
    expect(() => ledger._validateMetadata({
      agentId:         'x',
      nativeAgentName: 'y',
      platform:        'z',
      toolkitVersion:  'v',
      resolutionScope: 's',
      definitionHash:  'sha256:h',
    })).not.toThrow();
  });

  it('accepts an empty object without throwing', () => {
    expect(() => ledger._validateMetadata({})).not.toThrow();
  });

  it('throws METADATA_RESERVED_FIELD for each reserved field', () => {
    const reservedFields = [
      'operation_id', 'agent', 'phase', 'model',
      'status', 'started_at', 'completed_at', 'phase_delta_tokens', 'error',
    ];
    for (const field of reservedFields) {
      let err;
      try { ledger._validateMetadata({ [field]: 'x' }); } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.code).toBe('METADATA_RESERVED_FIELD');
      expect(err.key).toBe(field);
    }
  });

  it('throws METADATA_UNKNOWN_KEY for an unrecognized key', () => {
    let err;
    try { ledger._validateMetadata({ randomField: 'x' }); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.code).toBe('METADATA_UNKNOWN_KEY');
    expect(err.key).toBe('randomField');
  });
});

// ---------------------------------------------------------------------------
// METADATA_WHITELIST and RESERVED_FIELDS constants exported correctly
// ---------------------------------------------------------------------------

describe('ledger-metadata — exported constants', () => {
  it('METADATA_WHITELIST contains exactly the six Tech-Spec-specified keys', () => {
    const expected = new Set([
      'agentId',
      'nativeAgentName',
      'platform',
      'toolkitVersion',
      'resolutionScope',
      'definitionHash',
    ]);
    expect(ledger.METADATA_WHITELIST).toEqual(expected);
  });

  it('RESERVED_FIELDS contains all nine FTR-016 reserved field names', () => {
    const required = [
      'operation_id', 'agent', 'phase', 'model',
      'status', 'started_at', 'completed_at', 'phase_delta_tokens', 'error',
    ];
    for (const field of required) {
      expect(ledger.RESERVED_FIELDS.has(field)).toBe(true);
    }
  });

  it('METADATA_WHITELIST and RESERVED_FIELDS are disjoint', () => {
    for (const key of ledger.METADATA_WHITELIST) {
      expect(ledger.RESERVED_FIELDS.has(key)).toBe(false);
    }
  });
});
