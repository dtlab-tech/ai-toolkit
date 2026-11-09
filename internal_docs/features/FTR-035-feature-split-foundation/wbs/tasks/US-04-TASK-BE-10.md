<a id="task-US-04-TASK-BE-10"></a>
### US-04-TASK-BE-10

- **Task ID:** US-04-TASK-BE-10
- **Title:** Add staged move journal and rollback engine
- **Outcome:** feature-split.js has a commit routine that stages child folders, the new epic.md and the parent rollback copy under .split-staging-<run id>. In initial mode the parent's generated req/ and spec/ folders, when present, are moved into .split-staging-<run id>/parent-backup/ before epic.md is moved in. It moves everything with same-volume renames, journals each move, and writes the registry last with the temp-and-rename helper. On any failure it replays the journal in reverse, which restores req/ and spec/ in place, removes the staging directory and the temp file, and leaves the registry unchanged. If a reverse rename fails it keeps the staging directory and throws ROLLBACK_FAILED listing the remaining paths. After a successful commit it removes the staging directory and with it the backup; if that removal fails it returns a warning and does not undo the split.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-05
- **Acceptance criteria:** AC-22, AC-23, AC-31, AC-32
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 18000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add staged move and rollback engine

**Implementation notes:**

This task extracts the commit block that the Tech-Spec's `apply()` currently inlines (its "4. Stage, then commit with a journal" section) into one function, `commitStaged`, and adds a corrected rollback helper. Nothing is exported. The fault-injection seam for the tests is `fs.renameSync`, so every rename must go through the `fs` module object at call time (`fs.renameSync(...)`), never through a destructured `renameSync`.

**Dependency on INFRA-TASK-BE-05.** The registry write uses `writeRegistryAtomically(registryFile, text, runId)` from that task. It writes `${file}.tmp-${runId}`, renames it over the registry, and removes the temp file if either step fails. The registry is written last, so a failure before that point never touches it.

**Decisions (Gate 1 review, 2026-11-04). Use these; they are not open:**

1. **Error name.** `ROLLBACK_FAILED`. The Tech-Spec excerpt's `ROLLBACK_INCOMPLETE` is superseded, and US-04-TASK-BE-11 and US-04-TASK-TEST-04 use the same name.
2. **Staging on rollback failure.** Staging is removed after a rollback that fully succeeded, and kept when any reverse rename fails: it holds `feature.original.md` (initial mode) or `epic.previous.md` (late mode), the parent's req/spec backup, and may be the only remaining copy of the parent's content. The kept staging path is listed among the remaining paths.
3. **Parent content in late mode.** The old `epic.md` is moved into staging as `epic.previous.md` and the move is journaled.
4. **Parent req/ and spec/ in initial mode (backup).** When the parent folder contains `req/` or `spec/`, each is moved into `<staging>/parent-backup/` and the move is journaled with the others, before `epic.md` is moved into place. A missing folder is skipped. The reverse replay returns them to the parent folder, byte for byte. After a successful commit they are deleted with staging, so the parent folder ends with `epic.md` only (FTR-035 D-14).
5. **Staging cleanup after commit.** The split is already committed, so a failure to remove staging is never rolled back and never thrown. `commitStaged` returns an array of warning strings (empty when staging was removed), and `apply` reports them.

Registry format (Tech-Spec open gap 1) does not block this task. `commitStaged` receives the already-rendered registry text and never parses it.

**Signature and algorithm (replaces the inline step 4 in `apply()`):**

```javascript
// stageFiles: [{ rel: 'FTR-036-auth/feature.md', text }]  paths relative to staging
// moves:      [{ from, to }] in commit order: children, then the parent rollback copy and the parent req/ and spec/ backups, then epic.md
function commitStaged({ featuresRoot, staging, stageFiles, moves, registryFile, registryText, runId }) {
  const journal = [];
  let createdStaging = false;
  const move = (from, to) => { fs.renameSync(from, to); journal.push({ from, to }); };
  try {
    fs.mkdirSync(staging);                       // no recursive: EEXIST must fail, not adopt a stranger's dir
    createdStaging = true;
    fs.mkdirSync(path.join(staging, 'parent-backup'));   // target of the req/ and spec/ backup moves
    for (const f of stageFiles) {
      const full = path.join(staging, f.rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.text);
    }
    for (const m of moves) move(m.from, m.to);   // journal only after a successful rename
    writeRegistryAtomically(registryFile, registryText, runId);   // last commit step
  } catch (cause) {
    rollbackJournal({ journal, staging, createdStaging, registryFile, runId, cause });  // always throws
  }
  return removeStagingAfterCommit(staging);      // never rolls back once committed; [] or one warning
}

function rollbackJournal({ journal, staging, createdStaging, registryFile, runId, cause }) {
  const stuck = [];
  for (const step of [...journal].reverse()) {
    try { fs.renameSync(step.to, step.from); }   // the source is still at step.to if this throws
    catch { stuck.push(step.to); }
  }
  fs.rmSync(`${registryFile}.tmp-${runId}`, { force: true });   // belt and braces; INFRA-BE-05 already cleans up
  if (stuck.length === 0 && createdStaging) {
    try { fs.rmSync(staging, { recursive: true, force: true }); }
    catch { stuck.push(staging); }
  }
  if (stuck.length)                              // staging kept: it holds the backups
    throw new FeatureSplitError('ROLLBACK_FAILED',
      `Run failed (${cause.message}); rollback left these paths: ${stuck.join(', ')}`, { file: staging });
  throw cause;
}

function removeStagingAfterCommit(staging) {
  try { fs.rmSync(staging, { recursive: true, force: true }); return []; }
  catch { return [`Committed, but staging could not be removed: ${staging}`]; }
}
```

Notes on the algorithm:

- **Reverse order matters.** Moves are journaled in commit order. The reverse replay returns `epic.md` to staging first, then the parent `feature.md` (or `epic.previous.md`) to the parent folder, then the child folders back to staging. Staging still exists during the replay, so every reverse target is valid.
- **Same volume.** Staging lives inside `featuresRoot`, so every rename stays on one volume. Do not place staging elsewhere. An `EXDEV` error counts as an ordinary failure and triggers rollback.
- **`createdStaging` guard.** If `mkdirSync(staging)` fails, the run must not delete a directory it did not create. The pre-checks already refuse existing `.split-staging-*` directories, so this is a defensive guard only.
- **Rollback failure.** A failed reverse rename leaves its source at `step.to`, so `step.to` is the correct path to list. When any reverse fails, staging is kept and listed.
- **Registry.** The registry is untouched until its own rename succeeds, and the temp file is removed on every path.
- **After commit.** Staging removal failure returns one warning string instead of throwing. The journal is not replayed, because the run is already committed, and the parent's req/ and spec/ backup inside staging is deleted only when staging is.

**Wiring.** In the Tech-Spec's `apply()`, replace step 4 (the `const journal` through the `catch`, plus the `fs.rmSync(staging)` block after it) with a call to `commitStaged`. Pass `stageFiles` from the child docs and `epic.md`, `moves` as `[...plan.map(p => ({ from: path.join(staging, p.dir), to: path.join(featuresRoot, p.dir) })), <parent rollback copy move>, <req/ and spec/ backup moves in initial mode>, { from: path.join(staging, 'epic.md'), to: path.join(parentDir, 'epic.md') }]`, and `registryText`. The returned warnings array is returned by `apply`. Remove the old `rollback` function. US-04-TASK-BE-11 wires the rest of `apply()`.

**What this task does not cover.** Fault-injection tests (US-04-TASK-TEST-04) and the BE-11 orchestration are separate tasks. This task is complete when the file loads and the existing suite still passes.

**Verification commands:**

```
grep -q "function commitStaged(" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "require('./src/claude/scripts/feature-split.js')"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```