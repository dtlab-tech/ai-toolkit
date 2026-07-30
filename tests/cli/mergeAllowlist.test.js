'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const {
  CANONICAL_ALLOW,
  CANONICAL_ASK,
  commandToPermission,
  mergeAllowlist,
  updateGitignore,
} = require('../../bin/cli');

// ── helpers ───────────────────────────────────────────────────────────────────

function readSettingsJson(destDir) {
  const p = path.join(destDir, '.claude', 'settings.local.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── shared setup ──────────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── CANONICAL_ALLOW / CANONICAL_ASK validation (AC-11, AC-12) ─────────────────

describe('canonical command lists', () => {
  const expectedAllow = [
    'ls', 'dir', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'wc', 'echo',
    'pwd', 'which', 'date',
    'git status', 'git diff', 'git log', 'git show', 'git branch', 'git rev-parse',
    'git add', 'git commit',
    'dotnet build', 'dotnet test', 'dotnet restore',
    'npm test', 'npm run build',
  ];

  const expectedAsk = [
    'git push', 'gh pr create', 'rm', 'del',
    'git checkout', 'git reset', 'git clean',
  ];

  test('CANONICAL_ALLOW contains exactly the commands from AC-11', () => {
    expect(CANONICAL_ALLOW).toEqual(expectedAllow);
  });

  test('CANONICAL_ASK contains exactly the commands from AC-12', () => {
    expect(CANONICAL_ASK).toEqual(expectedAsk);
  });

  test('all CANONICAL_ALLOW entries are formatted as Bash(<cmd>:*)', () => {
    for (const cmd of CANONICAL_ALLOW) {
      expect(commandToPermission(cmd)).toBe(`Bash(${cmd}:*)`);
    }
  });

  test('all CANONICAL_ASK entries are formatted as Bash(<cmd>:*)', () => {
    for (const cmd of CANONICAL_ASK) {
      expect(commandToPermission(cmd)).toBe(`Bash(${cmd}:*)`);
    }
  });
});

// ── mergeAllowlist() — fresh install (AC-01) ──────────────────────────────────

describe('mergeAllowlist() — fresh install (no existing settings.local.json)', () => {
  test('creates settings.local.json with canonical allow and ask arrays', () => {
    const result = mergeAllowlist(tmpDir);

    expect(result.status).toBe('written');

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.allow).toEqual(CANONICAL_ALLOW.map(commandToPermission));
    expect(json.permissions.Bash.ask).toEqual(CANONICAL_ASK.map(commandToPermission));
  });

  test('all allow entries are formatted as Bash(<cmd>:*)', () => {
    mergeAllowlist(tmpDir);
    const json = readSettingsJson(tmpDir);
    for (const entry of json.permissions.Bash.allow) {
      expect(entry).toMatch(/^Bash\(.+:\*\)$/);
    }
  });

  test('all ask entries are formatted as Bash(<cmd>:*)', () => {
    mergeAllowlist(tmpDir);
    const json = readSettingsJson(tmpDir);
    for (const entry of json.permissions.Bash.ask) {
      expect(entry).toMatch(/^Bash\(.+:\*\)$/);
    }
  });

  test('returns error status when destDir does not exist', () => {
    const result = mergeAllowlist(path.join(tmpDir, 'does-not-exist'));
    expect(result.status).toBe('error');
  });

  test('returns error status when destDir argument is missing', () => {
    const result = mergeAllowlist(undefined);
    expect(result.status).toBe('error');
  });
});

// ── mergeAllowlist() — merge with existing user rules (AC-02) ─────────────────

describe('mergeAllowlist() — merge with existing user rules', () => {
  function writeInitialSettings(extraAllow, extraAsk) {
    const data = {
      permissions: {
        Bash: {
          allow: extraAllow,
          ask:   extraAsk,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  }

  test('user-defined allow rules are preserved in merged result', () => {
    const userRule = 'Bash(my-custom-script:*)';
    writeInitialSettings([userRule], []);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.allow).toContain(userRule);
  });

  test('canonical allow entries are present after merge', () => {
    writeInitialSettings(['Bash(my-custom-script:*)'], []);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    for (const cmd of CANONICAL_ALLOW) {
      expect(json.permissions.Bash.allow).toContain(commandToPermission(cmd));
    }
  });

  test('no duplicate entries in allow after merge', () => {
    const shared = commandToPermission('ls');
    writeInitialSettings([shared], []);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    const count = json.permissions.Bash.allow.filter(e => e === shared).length;
    expect(count).toBe(1);
  });

  test('no duplicate entries in ask after merge', () => {
    const shared = commandToPermission('git push');
    writeInitialSettings([], [shared]);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    const count = json.permissions.Bash.ask.filter(e => e === shared).length;
    expect(count).toBe(1);
  });

  test('user-defined ask rules are preserved in merged result', () => {
    // US-02-T03: a custom ask entry not present in canonical lists must survive merge
    const userAskRule = 'Bash(my-custom-ask:*)';
    writeInitialSettings([], [userAskRule]);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.ask).toContain(userAskRule);
  });

  test('canonical ask entries are present after merge', () => {
    // US-02-T03: all canonical ask entries must be in the resulting ask array
    writeInitialSettings([], ['Bash(my-custom-ask:*)']);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    for (const cmd of CANONICAL_ASK) {
      expect(json.permissions.Bash.ask).toContain(commandToPermission(cmd));
    }
  });

  test('no user rules dropped when existing file has both custom allow and ask entries', () => {
    // US-02-T03: comprehensive union check — neither allow nor ask user rules may be lost
    const userAllow = 'Bash(my-build-script:*)';
    const userAsk   = 'Bash(my-deploy-script:*)';
    writeInitialSettings([userAllow], [userAsk]);

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.allow).toContain(userAllow);
    expect(json.permissions.Bash.ask).toContain(userAsk);
  });

  test('returns merged status', () => {
    writeInitialSettings(['Bash(custom:*)'], []);
    const result = mergeAllowlist(tmpDir);
    expect(result.status).toBe('merged');
  });

  test('preserves non-Bash sections of settings.local.json', () => {
    const data = {
      env: { MY_VAR: 'hello' },
      permissions: {
        Bash: { allow: [], ask: [] },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(data, null, 2),
      'utf8'
    );

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.env).toEqual({ MY_VAR: 'hello' });
  });
});

// ── mergeAllowlist() — malformed JSON recovery (AC-05) ────────────────────────

describe('mergeAllowlist() — malformed JSON recovery', () => {
  test('resets file to canonical lists when JSON is invalid', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      '{ this is not json !!!',
      'utf8'
    );

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.allow).toEqual(CANONICAL_ALLOW.map(commandToPermission));
    expect(json.permissions.Bash.ask).toEqual(CANONICAL_ASK.map(commandToPermission));
  });

  test('returns { status: reset, reason: malformed } on malformed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      'not-json',
      'utf8'
    );

    const result = mergeAllowlist(tmpDir);
    expect(result.status).toBe('reset');
    expect(result.reason).toBe('malformed');
  });

  test('logs a warning when JSON is malformed', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      'invalid',
      'utf8'
    );

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mergeAllowlist(tmpDir);
      const msgs = spy.mock.calls.map(args => args.join(' '));
      expect(msgs.some(m => m.includes('not valid JSON'))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test('does not throw on malformed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      'invalid',
      'utf8'
    );
    expect(() => mergeAllowlist(tmpDir)).not.toThrow();
  });
});

// ── mergeAllowlist() — ask-beats-allow priority (AC-03, AC-04) ───────────────

describe('mergeAllowlist() — ask-beats-allow priority', () => {
  test('command in existing allow AND canonical ask appears only in ask (AC-03)', () => {
    const dangerousCmd = commandToPermission('git push');
    const initial = {
      permissions: {
        Bash: {
          allow: [dangerousCmd],
          ask:   [],
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(initial, null, 2),
      'utf8'
    );

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.ask).toContain(dangerousCmd);
    expect(json.permissions.Bash.allow).not.toContain(dangerousCmd);
  });

  test('command in existing ask AND canonical allow stays only in ask (AC-04)', () => {
    const safeCmd = commandToPermission('ls');
    const initial = {
      permissions: {
        Bash: {
          allow: [],
          ask:   [safeCmd],
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(initial, null, 2),
      'utf8'
    );

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    expect(json.permissions.Bash.ask).toContain(safeCmd);
    expect(json.permissions.Bash.allow).not.toContain(safeCmd);
  });

  test('ask-beats-allow produces no duplicates in either array', () => {
    const cmd = commandToPermission('git push');
    const initial = {
      permissions: {
        Bash: {
          allow: [cmd],
          ask:   [cmd],
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(initial, null, 2),
      'utf8'
    );

    mergeAllowlist(tmpDir);

    const json = readSettingsJson(tmpDir);
    const inAllow = json.permissions.Bash.allow.filter(e => e === cmd).length;
    const inAsk   = json.permissions.Bash.ask.filter(e => e === cmd).length;
    expect(inAllow).toBe(0);
    expect(inAsk).toBe(1);
  });
});

// ── mergeAllowlist() — idempotency (AC-09, US-04-T01) ────────────────────────

describe('mergeAllowlist() — idempotency', () => {
  test('running twice on a fresh directory produces identical JSON output', () => {
    // Arrange: fresh directory (no existing settings.local.json)
    mergeAllowlist(tmpDir);
    const first = readSettingsJson(tmpDir);

    // Act: call a second time with the same state
    mergeAllowlist(tmpDir);
    const second = readSettingsJson(tmpDir);

    // Assert: output is byte-for-byte identical
    expect(second).toEqual(first);
  });

  test('second run introduces no new duplicate entries', () => {
    // Arrange
    mergeAllowlist(tmpDir);

    // Act
    mergeAllowlist(tmpDir);

    // Assert: allow and ask arrays contain no duplicates after two runs
    const json = readSettingsJson(tmpDir);
    const allowSet = new Set(json.permissions.Bash.allow);
    const askSet   = new Set(json.permissions.Bash.ask);
    expect(json.permissions.Bash.allow.length).toBe(allowSet.size);
    expect(json.permissions.Bash.ask.length).toBe(askSet.size);
  });

  test('second run returns merged status (not written and not error)', () => {
    // US-04-T01: the second call finds an existing file and must follow the
    // merge path, returning { status: 'merged' } — not 'written' (which is only
    // for fresh files) and not 'error'.
    //
    // Arrange: first call creates the file
    mergeAllowlist(tmpDir);

    // Act: second call on the already-populated directory
    const result = mergeAllowlist(tmpDir);

    // Assert: status is 'merged', confirming the merge path was taken
    expect(result.status).toBe('merged');
  });

  test('running twice with pre-existing user rules produces identical JSON output', () => {
    // US-04-T01: "same input" includes the scenario where the directory already
    // has user-defined rules before the first installer run. Both runs must
    // converge to the same result.
    //
    // Arrange: pre-seed with user rules before either installer run
    const userAllow = 'Bash(my-script:*)';
    const userAsk   = 'Bash(my-deploy:*)';
    const initial = {
      permissions: {
        Bash: { allow: [userAllow], ask: [userAsk] },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(initial, null, 2),
      'utf8'
    );

    // Act: run once, capture output, run again
    mergeAllowlist(tmpDir);
    const first = readSettingsJson(tmpDir);

    mergeAllowlist(tmpDir);
    const second = readSettingsJson(tmpDir);

    // Assert: both runs produce identical JSON
    expect(second).toEqual(first);
  });

  test('running twice with pre-existing user rules introduces no duplicates', () => {
    // US-04-T01: no duplicate entries even when user rules overlap with canonical
    //
    // Arrange: pre-seed with a rule that already matches a canonical entry
    const sharedAllow = commandToPermission('ls');
    const initial = {
      permissions: {
        Bash: { allow: [sharedAllow], ask: [] },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'settings.local.json'),
      JSON.stringify(initial, null, 2),
      'utf8'
    );

    // Act: two runs
    mergeAllowlist(tmpDir);
    mergeAllowlist(tmpDir);

    // Assert: no duplicates after two runs with overlapping input
    const json = readSettingsJson(tmpDir);
    const allowSet = new Set(json.permissions.Bash.allow);
    const askSet   = new Set(json.permissions.Bash.ask);
    expect(json.permissions.Bash.allow.length).toBe(allowSet.size);
    expect(json.permissions.Bash.ask.length).toBe(askSet.size);
  });
});

// ── updateGitignore() — .gitignore management (AC-06, AC-07) ──────────────────

describe('updateGitignore()', () => {
  test('creates .gitignore with the entry when file does not exist', () => {
    const result = updateGitignore(tmpDir);
    expect(result.status).toBe('created');

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
  });

  test('appends entry to existing .gitignore that does not contain it', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n', 'utf8');

    const result = updateGitignore(tmpDir);
    expect(result.status).toBe('appended');

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('.claude/settings.local.json');
    expect(content).toContain('node_modules/');
  });

  test('does not append a duplicate line when entry already exists (AC-07)', () => {
    const initial = 'node_modules/\n.claude/settings.local.json\n';
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), initial, 'utf8');

    const result = updateGitignore(tmpDir);
    expect(result.status).toBe('already');

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const count = content.split('\n').filter(l => l.trim() === '.claude/settings.local.json').length;
    expect(count).toBe(1);
  });

  test('idempotent: calling twice does not produce a duplicate', () => {
    updateGitignore(tmpDir);
    updateGitignore(tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    const count = content.split('\n').filter(l => l.trim() === '.claude/settings.local.json').length;
    expect(count).toBe(1);
  });

  test('preserves existing content when appending', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'dist/\ncoverage/\n', 'utf8');
    updateGitignore(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('dist/');
    expect(content).toContain('coverage/');
  });
});
