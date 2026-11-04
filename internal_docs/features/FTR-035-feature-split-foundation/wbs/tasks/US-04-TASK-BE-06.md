<a id="task-US-04-TASK-BE-06"></a>
### US-04-TASK-BE-06

- **Task ID:** US-04-TASK-BE-06
- **Title:** Add apply proposal shape check and mode detection
- **Outcome:** feature-split.js has apply pre-checks that validate the proposal D-08 shape (INVALID_PROPOSAL) and select initial or late mode from the parent folder (feature.md versus epic.md). Both files present or neither present gives PARENT_INVALID. The checks also cover the leftover staging scan, a missing parent registry entry (nothing staged), registry status (defined for initial, epic for late) and isNewFeature. There is no refusal for generated req/ and spec/ in the parent: they do not make it non-new, and US-04-TASK-BE-10 moves them into a temporary backup during the split.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-07, US-02-TASK-BE-01, US-04-TASK-BE-01
- **Acceptance criteria:** AC-33, AC-39, AC-42
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add apply pre-checks and mode detection

**Implementation notes:**

**Scope and sources.** This task edits only the pre-check block at the top of `apply()` in `src/claude/scripts/feature-split.js`, and adds three small helpers above it. Nothing is moved, written or staged by these checks. The excerpt's `apply()` contains the current pre-check block, which this task replaces. Its existing order is kept: staging scan, registry lookup, parent folder, mode, `isNewFeature`.

Two items in the outcome are not defined by the Tech-Spec excerpt and are called out below: the `PARENT_STATUS_INVALID` code and the status rule. The rest follows the excerpt.

**1. Current block to replace (in `apply()`, section "// 1. Pre-checks"):**

```javascript
  // 1. Pre-checks: nothing has been moved yet.
  const stale = fs.readdirSync(featuresRoot).filter(n => n.startsWith(STAGING_PREFIX));
  if (stale.length) fail('STALE_STAGING', `Staging left by an earlier run: ${stale.join(', ')}`);
  const registry = parseRegistry(readRegistryText(registryFile));
  const parentBlock = findBlock(registry, parentId);
  if (!parentBlock) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`);
  const parentDir = findParentDir(featuresRoot, parentId);
  const late = fs.existsSync(path.join(parentDir, 'epic.md'));          // late mode (D-16)
  if (!late && !isNewFeature(parentDir).isNew) fail('PARENT_NOT_NEW', `${parentId} has approvals or a WBS`);
```

**2. Replacement block:**

```javascript
  // 1. Pre-checks: nothing has been moved yet.
  assertProposalShape(proposal);                                  // INVALID_PROPOSAL
  assertNoStagingLeftovers(featuresRoot);                         // INFRA-TASK-BE-07 helper; refuses, removes nothing
  const registry = parseRegistry(readRegistryText(registryFile));
  const parentBlock = findBlock(registry, parentId);
  if (!parentBlock) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`);
  const parentDir = findParentDir(featuresRoot, parentId);
  const mode = detectMode(parentDir, parentId);                   // PARENT_INVALID
  const late = mode === 'late';                                   // D-16
  const wantStatus = late ? 'epic' : 'defined';
  const status = fieldOf(parentBlock, 'Status');
  if (status !== wantStatus)
    fail('PARENT_STATUS_INVALID', `${parentId} has status ${status}; ${mode} mode needs ${wantStatus}`);
  if (!late && !isNewFeature(parentDir).isNew) fail('PARENT_NOT_NEW', `${parentId} has approvals or a WBS`);
```

**3. New helpers (place above `apply()`):**

```javascript
// D-08 shape: structural types only. Business rules (source values, names, dependencies,
// minChildren threshold) stay in validateProposal, which raises its own codes.
function assertProposalShape(p) {
  const bad = (why) => fail('INVALID_PROPOSAL', `Proposal shape invalid: ${why}`);
  if (p === null || typeof p !== 'object' || Array.isArray(p)) bad('must be a JSON object');
  if (!Array.isArray(p.children)) bad('children must be an array');
  p.children.forEach((c, i) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) bad(`children[${i}] must be an object`);
  });
  if (!Number.isInteger(p.minChildren) || p.minChildren < 0) bad('minChildren must be a non-negative integer');
  if (typeof p.foundationNote !== 'string') bad('foundationNote must be a string');
  if (p.sharedFoundationOwner !== null && typeof p.sharedFoundationOwner !== 'string')
    bad('sharedFoundationOwner must be a string or null');
}

// Reads a marker file. Only ENOENT means absent; any other error propagates (no silent hiding).
function fileExists(file) {
  try { return fs.statSync(file).isFile(); }
  catch (err) { if (err.code === 'ENOENT') return false; throw err; }
}

// feature.md only -> initial; epic.md only -> late; both or neither -> PARENT_INVALID.
function detectMode(parentDir, parentId) {
  const hasFeature = fileExists(path.join(parentDir, 'feature.md'));
  const hasEpic = fileExists(path.join(parentDir, 'epic.md'));
  if (hasFeature === hasEpic)
    fail('PARENT_INVALID', `${parentId} folder must hold exactly one of feature.md or epic.md`, { file: parentDir });
  return hasEpic ? 'late' : 'initial';
}
```

**Notes on the code above:**

- `assertNoStagingLeftovers` is the helper delivered by INFRA-TASK-BE-07. It is called, not reimplemented, so that the scan has one implementation. Its exported name is not in this excerpt; use the name that task exports. The excerpt's inline `readdirSync` plus `STALE_STAGING` is superseded. Its code is `STAGING_LEFTOVER` in INFRA-TASK-BE-07's skeleton entry, and the implementer should use that code.
- `fieldOf` comes from US-04-TASK-BE-01 and reads the `**Status:**` line of the parent block.
- `PARENT_STATUS_INVALID` and `PARENT_INVALID` are new codes. The excerpt does not define them. They follow the naming of the existing codes.
- `isNewFeature` is unchanged. The `PARENT_NOT_NEW` check runs only in initial mode, as the excerpt requires.

**Decisions (Gate 1 review, 2026-11-04):**

- **req/spec in the parent folder (decided: no refusal).** A parent that holds generated `req/` and `spec/` is a valid initial split. D-07 says they do not count as markers, and checkpoint 2 always runs when they exist. `apply` does not refuse on them. US-04-TASK-BE-10 moves them into `<staging>/parent-backup/` during the split, restores them on any failure and deletes them with staging after a successful commit, so the parent folder ends with `epic.md` only. Do not add a check for them here.
- **Rule for an existing `wbs` directory.** This is already covered by `isNewFeature` and needs no new code.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "require('./src/claude/scripts/feature-split.js')"
```

```
npm test
```