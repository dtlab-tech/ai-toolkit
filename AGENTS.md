# AGENTS.md — @dtlabs/ai-toolkit

> Convention reference for AI developer agents. Read this fully before writing any code.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | JavaScript (Node.js, CommonJS) | Node 20 |
| Package manager | npm | — |
| Test runner | Jest | ^29.7.0 |
| Frontmatter parsing | gray-matter | ^4.0.3 |
| CLI entry point | `bin/cli.js` (runs on `require.main === module`) | — |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | ubuntu-latest / Node 20 |
| Agent definition format | Markdown with YAML frontmatter (`src/claude/agents/*.md`) | — |
| Skill definition format | Markdown with YAML frontmatter (`src/claude/skills/*/SKILL.md`) | — |
| Workflow scripts | Claude Code Workflow JS (`src/claude/workflows/*.js`) | — |

---

## Directory Structure

```
Fincantieri.CommonLibraries.AIToolkit/
├── bin/
│   └── cli.js                  — CLI installer + resolver; pure functions exported for unit tests
├── lib/
│   └── asset-catalog.js        — Single source of truth for asset categories (agents, commands, skills, workflows, scripts)
├── src/
│   └── claude/                 — Versioned source of all runtime assets (installed into dest/.claude/ at runtime)
│       ├── agents/             — Agent definition files (name, description, model, tools, body)
│       ├── skills/             — User-invocable skill directories, each with SKILL.md
│       │   ├── implement-feature/
│       │   ├── assess-codebase/
│       │   ├── define-feature/
│       │   ├── hi-gaia/
│       │   ├── init-agents/
│       │   └── install-toolkit/
│       ├── commands/           — Slash command definition files
│       ├── workflows/          — Claude Code Workflow orchestrator scripts (pm-phase1/2/3.js, am-phase1/2.js)
│       └── scripts/            — CLI scripts for work breakdown validation and rendering
├── .claude/                    — Runtime config (NOT versioned source; personal config files are gitignored)
│   ├── settings.json           — Sets CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2 (gitignored)
│   └── .ai-toolkit-version     — Installed version stamp (gitignored)
├── docs/
│   ├── procedures/             — Reusable text procedures referenced by agents
│   ├── reference.md            — Full quick-reference cheatsheet
│   ├── installation.md
│   ├── pricing.md
│   └── token-optimization*.md
├── internal_docs/
│   └── features/               — Internal feature delivery artifacts (FTR-NNN-slug/)
│       └── REGISTRY.md         — Auto-maintained feature registry
├── tests/
│   ├── cli/                    — Unit tests for pure functions in bin/cli.js
│   └── frontmatter/            — Structural validation of agent and skill frontmatter
├── jest.config.js
├── package.json
├── CLAUDE.md                   — Toolkit-level CLAUDE.md (installed into consuming projects)
└── CLAUDE.global.md            — Global ~/.claude/CLAUDE.md content for global installs
```

**Naming conventions:**
- Agent files: `kebab-case.md` under `src/claude/agents/` (e.g., `developer-backend.md`)
- Skill directories: `kebab-case/` under `src/claude/skills/`, each containing a `SKILL.md`
- Command files: `kebab-case.md` under `src/claude/commands/`
- Workflow scripts: `kebab-case.js` under `src/claude/workflows/`
- Test files: `{function-name}.test.js` under `tests/cli/` or `tests/frontmatter/`
- Feature directories: `{PREFIX}-{slug}/` (e.g., `FTR-010-unit-tests/`)
- Feature prefix pattern: `[A-Z]+-[0-9]+` (e.g., `FTR-010`, `ASSESS-001`)

---

## Patterns

### Agent definition file

```markdown
---
name: generate-work-breakdown
description: "Generates a structured work breakdown (User Stories + Tasks)..."
model: haiku
tools: Read, Glob, Grep, Write
---

# Generate Work Breakdown

You are an **expert software architect**...

## Input
The user provides the path to a `feature.md` file...

## Step 0 — Read Project Conventions (MANDATORY)
Before generating..., you MUST:
1. Read `AGENTS.md` from the current working directory...
```

> Key rules derived from this pattern:
> - Every agent file MUST have YAML frontmatter with `name`, `description`, and `model`
> - Valid `model` values are exactly: `haiku`, `sonnet`, `opus` — no other strings
> - `tools:` is optional; when absent, the agent inherits all tools from the session
> - All developer/implementation agents MUST include a "Step 0 — Read Project Conventions (MANDATORY)" section that reads `AGENTS.md` first
> - `argument-hint:` is optional; include it when the agent takes user-supplied arguments

### Skill definition file

```markdown
---
description: "Implement Feature — starts the full feature delivery pipeline..."
argument-hint: <path-to-feature.md> [--force]
---

# Implement Feature

Orchestrates the full feature delivery pipeline by invoking three sequential
workflow phases (pm-phase1, pm-phase2, pm-phase3)...
```

> Key rules:
> - Skill `SKILL.md` files require `description` but do NOT require `name` or `model`
> - `argument-hint:` is optional but recommended for skills that take arguments
> - Skills that orchestrate workflows present approval gates in the main loop (never in a subagent)

### Workflow script pattern

```javascript
export const meta = {
  name: 'pm-phase1',
  description: 'Feature delivery phase 1: ...',
  phases: [
    { title: 'Discovery', detail: 'Read feature.md, check existing outputs' },
  ],
}

const featurePath = args.split(/\s+/)[0]
const tokenLedger = []

phase('Discovery')

const result = await agent(
  `...prompt...`,
  {
    label: 'discovery',
    phase: 'Discovery',
    schema: { type: 'object', properties: { prefix: { type: 'string' } } },
  }
)

return { prefix, token_ledger: tokenLedger }
```

> Key rules:
> - Workflow scripts export `meta` with `name`, `description`, and `phases`
> - Use `phase('PhaseName')` to mark phase transitions for logging
> - Use `await agent(prompt, { label, phase, model?, schema? })` to dispatch subagents
> - Use `await parallel([...])` for concurrent agent dispatch
> - Return a structured object — the invoking skill reads specific fields from it
> - Track tokens with `budget.spent()` deltas: `const before = budget.spent(); ...; const delta = budget.spent() - before`

### CLI module pattern (`bin/cli.js`)

```javascript
'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

function fileHash(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function walkDir(dir) {
  const results = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// Entry point guard: run CLI when invoked directly, export for tests
if (require.main === module) {
  main();
} else {
  module.exports = { fileHash, walkDir, expandMappings, categorize, readInstalledVersion, NEVER_COPY };
}
```

> Key rules:
> - All new pure functions in `bin/cli.js` MUST be exported via the `else` branch of the `require.main` guard
> - Never use `module.exports` unconditionally — the guard preserves CLI behavior when run directly
> - New functions must have a corresponding unit test file in `tests/cli/`
> - User-owned config files (`settings.json`, `settings.local.json`) are listed in `NEVER_COPY` and must never be copied during installation

### Unit test pattern

```javascript
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { fileHash } = require('../../bin/cli');

describe('fileHash()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns a 32-character MD5 hex string for a known file', () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(filePath, 'hello world');
    const hash = fileHash(filePath);
    expect(hash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
    expect(hash).toHaveLength(32);
  });
});
```

> Key rules:
> - Use `'use strict';` at the top of every test file
> - Import from `../../bin/cli` using destructuring
> - Each test creates its own isolated `tmpDir` via `fs.mkdtempSync`; clean up in `afterEach`
> - Follow Arrange-Act-Assert (AAA) — set up files, call function, assert result
> - One logical behavior per `test()` block
> - Test descriptions must describe the scenario and expected outcome in plain English

### Frontmatter validation test pattern

```javascript
'use strict';

const fs     = require('fs');
const path   = require('path');
const matter = require('gray-matter');

const AGENTS_DIR   = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');
const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);

const agentFiles = fs.existsSync(AGENTS_DIR)
  ? fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
      .map(f => ({ file: f, fullPath: path.join(AGENTS_DIR, f) }))
  : [];

describe('Agent .md frontmatter validation', () => {
  describe.each(agentFiles)('$file', ({ file, fullPath }) => {
    let parsed;
    beforeAll(() => { parsed = matter(fs.readFileSync(fullPath, 'utf8')); });

    test('has a valid "model" field (haiku, sonnet, or opus)', () => {
      expect(VALID_MODELS.has(parsed.data.model)).toBe(true);
    });
  });
});
```

> Key rules:
> - Use `describe.each` to auto-run tests against all discovered files
> - Parse frontmatter with `gray-matter` via `matter(rawString).data`
> - Tests in `tests/frontmatter/` run automatically against any new agent or skill file — ensure required frontmatter fields are present before committing

---

## Build & Verification Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install devDependencies (jest, gray-matter) |
| `npm test` | Run all tests; stops at first failure (`--bail`) |
| `npm run test:coverage` | Run all tests and generate coverage report in `coverage/` |

**Always run `npm test` after implementing any change to verify nothing is broken.**

There is no separate compile/build step — this is a plain JavaScript project. `npm test` is the primary verification command.

Coverage reports land in `coverage/` (gitignored). Open `coverage/index.html` for line-level coverage. No coverage threshold is enforced.

---

## Feature Delivery Artifact Structure

Feature documents live under `internal_docs/features/{PREFIX}-{slug}/`:

| File | Produced by | Purpose |
|------|-------------|---------|
| `feature.md` | Human / `define-feature` agent | Source of truth — feature description |
| `{PREFIX}-Requirements.md` | `generate-requirements` agent | Functional requirements, use cases, ACs |
| `{PREFIX}-Tech-Spec.md` | `generate-tech-spec` agent | Architecture, API specs, data model, file inventory |
| `{PREFIX}-Validation-Report.md` | `validate-feature-docs` agent | Coverage check result |
| `{PREFIX}-Approvals.md` | `implement-feature` skill (main loop) | Gate 1 and Gate 2 approval records |
| `{PREFIX}-Work-Breakdown.md` | `generate-work-breakdown` agent | User stories + tasks |
| `{PREFIX}-Work-Breakdown.csv` | `generate-work-breakdown` agent | Machine-readable task list for workflow dispatch |
| `{PREFIX}-Effort-Estimate.md` | `generate-work-breakdown` + actuals phase | Human and agent time estimates + actuals |
| `{PREFIX}-Token-Estimate.md` | Workflow phases | Per-agent token usage estimates and actuals |
| `{PREFIX}-Issues.md` | `review-solution` + remediation | Issues register (OPEN / DEFERRED) |
| `{PREFIX}-process-log.txt` | Workflow phases | Timestamped event log for the delivery run |

Work Breakdown CSV column format (pipe-separated):
```
phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type
```

Task domain values: `DB`, `BE`, `FE`, `INFRA`, `TEST`
Agent type mapping: `DB/BE/INFRA` → `developer-backend`, `FE` → `developer-frontend`, `TEST` → `developer-testing`

---

## Assessment Artifact Structure

Assessment documents live under `docs/assessments/{ASSESS_PREFIX}/`:

| File | Produced by |
|------|-------------|
| `{PREFIX}-Generic-Assessment.md` | `generic-software-assessment` |
| `{PREFIX}-Layer-Assessment.md` | `layered-architecture-assessment` |
| `{PREFIX}-Concurrency-Assessment.md` | `concurrency-safety-assessment` |
| `{PREFIX}-Interventions-Index.md` | `intervention-documentation-standard` |
| `{PREFIX}-INT-NNN-*.md` | `intervention-documentation-standard` |
| `{PREFIX}-Approvals.md` | `assess-codebase` skill (main loop) |
| `{PREFIX}-Effort-Estimate.md` | `am-phase1` workflow |
| `{PREFIX}-Token-Estimate.md` | `am-phase1` workflow |

Assessment prefix pattern: `ASSESS-NNN` (e.g., `ASSESS-001`). Increment the highest number found in `docs/assessments/`.

---

## Approval Gate Protocol

Two mandatory gates exist in the feature delivery pipeline. Both are presented in the **main loop**, never inside a workflow or subagent.

**Gate 1 — Docs Approval** (after Requirements + Tech-Spec + Validation):
- Present `{PREFIX}-Requirements.md`, `{PREFIX}-Tech-Spec.md`, `{PREFIX}-Validation-Report.md`
- Hard stop: output `⛔ GATE 1 — DOCS APPROVAL — HARD STOP` and wait for written user reply
- On approval: write `{PREFIX}-Approvals.md` with Gate 1 section, then read it back to verify

**Gate 2 — Work Breakdown Approval** (after Work Breakdown generation):
- Pre-condition: verify Gate 1 is present in `{PREFIX}-Approvals.md`
- Hard stop: output `⛔ GATE 2 — WORK BREAKDOWN APPROVAL — HARD STOP` and wait for written user reply
- On approval: append Gate 2 section to `{PREFIX}-Approvals.md`, read it back to verify

**Findings Gate** (assessment pipeline):
- Step A: present severity counts, wait for acknowledgement
- Step B: list INT-NNN identifiers and ask which to flag for feature delivery

Gates must NEVER be auto-approved, bypassed, or delegated to a subagent.

---

## Hard Constraints

These rules are **non-negotiable**. Violating them will cause the architect review to FAIL.

- **DO NOT** add a new agent `.md` file without `name`, `description`, and `model` frontmatter fields — the frontmatter tests will fail in CI
- **DO NOT** use any `model` value other than `haiku`, `sonnet`, or `opus` in agent frontmatter
- **DO NOT** export functions from `bin/cli.js` unconditionally — always use the `if (require.main === module)` guard
- **DO NOT** copy or create `settings.json` or `settings.local.json` in any destination during installation — these are user-owned config files listed in `NEVER_COPY`
- **DO NOT** copy `docs/procedures/` files if an override already exists in the destination project — project overrides take priority over toolkit defaults
- **DO NOT** copy the `install-toolkit/` skill directory to any destination — it is toolkit-internal
- **DO NOT** present approval gates inside a workflow script or subagent — gates MUST be presented in the main loop (the `implement-feature` or `assess-codebase` skill)
- **DO NOT** start Phase 6 (implementation) without verifying BOTH Gate 1 and Gate 2 in `{PREFIX}-Approvals.md` on disk
- **ALWAYS** run `npm test` after any change to `bin/cli.js`, `tests/`, or `src/claude/agents/` to verify the test suite passes
- **ALWAYS** read `AGENTS.md` from the current working directory before writing any code (in all developer and assessment agents — this is Step 0, MANDATORY)
- **ALWAYS** search for existing patterns in the codebase before introducing new ones
- **ALWAYS** return a structured completion summary to the orchestrator from developer agents — never dump file contents or diffs
- **ALWAYS** write approval files to disk and read them back to verify before proceeding past a gate
- **ALWAYS** set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` in `.claude/settings.json` of any project that installs the toolkit — without it, orchestrators cannot spawn worker subagents
- **ALWAYS** use `run_in_background: false` when spawning the `project-manager` or `assessment-manager` orchestrators

---

## Architecture Decision Records

No `docs/adr/` directory exists in this project. Architecture decisions are documented in feature summaries in `internal_docs/features/REGISTRY.md`.

Notable design decisions (from feature registry):

- **FTR-007**: Every agent must declare an explicit `model:` key in frontmatter (`haiku` for classification/generation tasks, `sonnet` for coordination/implementation, `opus` for adversarial review). Model does not cascade from orchestrator to subagents.
- **FTR-009**: Orchestrators are Claude Code Workflow scripts (`.claude/workflows/*.js`), not agent `.md` files. This enables deterministic per-agent model assignment and accurate per-agent token telemetry.
- **FTR-010**: All pure functions in `bin/cli.js` are exported via the `require.main` guard. The test suite in `tests/` runs automatically on every PR to `main` via GitHub Actions CI.
- **FTR-003**: The assessment pipeline is read-only. No remediation code changes are made automatically; intervention documents are produced for human-directed feature delivery.
