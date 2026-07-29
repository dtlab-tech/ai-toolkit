# Issues Register — FTR-011

## FTR-011 Review — Issues Register (INFRA scope)

### WARNING (should fix)

**[WARNING] Quality / Robustness — bin/cli.js:162-175 (readManifest) + bin/cli.js:232-234 (runInstall)**
`readManifest` returns the parsed object verbatim when the manifest is valid JSON but has no `files` array (or `files` is not an array): the `if (Array.isArray(parsed.files))` guard is skipped and the raw object is returned. `runInstall` then does `computeOrphans(oldManifest.files, newFileSet)` with `oldManifest.files === undefined`, throwing `TypeError: Cannot read properties of undefined (reading 'map')` and crashing the whole installer with an unhandled exception.
Empirically confirmed: `readManifest(dest)` on a manifest containing `{"version":"1"}` returns `{"version":"1"}`, and the follow-on `computeOrphans` call throws.
The spec's corrupt-JSON edge case (AC-07/AC-16) is handled, but the "valid JSON, wrong shape" case (e.g. an interrupted/partial write, a hand-edited manifest, or a schema from a future toolkit version) is not. The author's own `Array.isArray` guard shows this shape was anticipated on read but never defaulted.
Direction: In `readManifest`, guarantee the returned object always has an array `files` field — e.g. `if (!Array.isArray(parsed.files)) return { files: [] }` (or normalize to `parsed.files = []`). Alternatively harden the caller: `const oldManifest = readManifest(destRoot); const oldFiles = Array.isArray(oldManifest.files) ? oldManifest.files : [];`. Add a unit test in tests/cli/readManifest.test.js covering the valid-JSON-without-files-array case (should return `{ files: [] }`).

### INFO (improvements)

**[INFO] Coverage — tests/cli — no test exercises the prune phase inside runInstall**
All four pure functions are unit-tested in isolation, but the wiring in `runInstall` (orphan display, per-file prompt vs `--force` auto-move, "0 moved / N kept" summary, manifest written on every exit path) has no test. The feature.md explicitly defers end-to-end CLI tests (Out of Scope), so this is acceptable for MVP, but the missing-files-array crash above would have been caught by even a light integration test of the prune path. Direction: consider a focused test that constructs an old manifest + a fake mapping set and asserts orphan detection/move behavior, once the WARNING fix lands.

**[INFO] Consistency — bin/cli.js:257-271 (interactive orphan loop)**
The interactive branch re-checks `fs.existsSync(fullPath)` and `continue`s before prompting, but `existingOrphans` was already filtered for existence at line 236, and the `--force` branch does not re-check. The redundant guard is harmless (guards against a file vanishing between filter and prompt) but is asymmetric with the force branch. Direction: optional — either drop the redundant check or apply the same defensive check in both branches for symmetry.

## FTR-011 Review — US-01 (`readManifest()`)

Empirical verification:
- Build/verify (`npm test`): PASS — 158/158 tests, 11 suites.
- Tests: readManifest.test.js — 5/5 pass (AC-14, AC-15, AC-16, backslash normalization, corrupt-JSON warning log).

Verdict: PASS (0 CRITICAL; build + tests green)

### WARNING (should fix)

**[WARNING] Robustness — bin/cli.js:162-175 (readManifest)**
`readManifest` returns `parsed` verbatim whenever `JSON.parse` succeeds but the payload is not the expected shape, because the `if (Array.isArray(parsed.files))` guard (line 167) only conditionally normalizes and never defaults the shape.
Empirically reproduced (ran the exported function directly):
- Manifest `{"version":"1"}` -> returns `{"version":"1"}`; downstream `computeOrphans(oldManifest.files, ...)` at bin/cli.js:234 throws `TypeError: Cannot read properties of undefined (reading 'map')` — unhandled installer crash.
- Manifest `5` (valid JSON scalar) -> returns the number `5`, an even more degenerate result.
AC-16 (corrupt/unparseable JSON) is handled; the "valid JSON, wrong shape" case (interrupted/partial write, hand-edited manifest, future toolkit schema) is not. Outside US-01's defined ACs, so WARNING not CRITICAL; surfaces to users once US-05 wires the prune phase. Duplicate of existing FTR-011-Issues.md entry — confirmed still open.
Direction: In `readManifest`, guarantee an array `files` field on every return, e.g. `if (!parsed || !Array.isArray(parsed.files)) return { files: [] };` before normalizing. Add a unit test for the valid-JSON-without-files-array case (and a scalar/non-object case) asserting `{ files: [] }`.

### INFO (improvements)

**[INFO] Coverage — tests/cli**
readManifest is well unit-tested in isolation, but its integration with `computeOrphans`/`runInstall` (where the wrong-shape crash actually manifests) has no test. Feature.md defers end-to-end CLI tests (Out of Scope) so acceptable for MVP; a light integration test of the prune path would have caught the WARNING above. Revisit when US-05 is reviewed.

## Review Report — FTR-011 US-03 (moveToTrash)

### Empirical verification
- Build: N/A — plain JS project, no compile step (per AGENTS.md). Not a defect.
- Tests: PASS — `npm test` → 158/158 passed, 11 suites. moveToTrash suite 5/5.

### Verdict: PASS

### CRITICAL (blocks merge)
none

### WARNING (should fix)
none

### INFO (improvements)
- INFO — Robustness — bin/cli.js:189-198
  `moveToTrash` does not guard against the destination trash path already existing as a directory, nor does EXDEV fallback handle a source that is a directory. Not reachable in current design (orphans are always files from the manifest), so no action needed now. Direction: if manifest ever tracks directory entries, add an isDirectory branch; otherwise leave as-is.

- INFO — Uncommitted change outside US-03 scope — tests/cli/readManifest.test.js
  Working tree has an unstaged addition of a corrupt-JSON warning test in readManifest.test.js (belongs to US-01, not US-03). Also an untracked FTR-011-token-ledger.json artifact. Neither affects US-03. Direction: commit/stage these under their proper user story before opening the PR to keep the history clean.

## FTR-011 US-02 (computeOrphans) — Issues Register

### CRITICAL (blocks merge)
none

### WARNING (should fix)
none

### INFO (improvements)
- [INFO] Quality / Robustness — bin/cli.js `computeOrphans(oldFiles, newFiles)`
  The function assumes both arguments are arrays and will throw `TypeError` if passed `null`/`undefined`. The only current caller (`runInstall`) sources `oldFiles` from `readManifest`, which always returns `{ files: [] }`, and `newFiles` from a mapped array — so it is safe in practice. Direction: optionally default params (`oldFiles = [], newFiles = []`) for defensive hardening; low priority, not required by any AC.

- [INFO] Process / Commit hygiene — commit 718b0eb
  Commit message says "implement shared infrastructure (INFRA)" but the diff lands all four manifest functions and the full prune-phase integration in `runInstall` (US-01..US-05 scope), not just INFRA-T01 (which was an audit-only task). Direction: align commit granularity/messages with the per-User-Story vertical-slice plan in the Work Breakdown to keep traceability clean. No code defect.

## Review Report — FTR-011 US-04 (writeManifest)

### Empirical verification
- Build: N/A — plain JavaScript project, no compile step (AGENTS.md: "npm test is the primary verification command").
- Tests: PASS — 161/161 across 11 suites, including `tests/cli/writeManifest.test.js` (11 tests). `npm test` runs with `--bail`; no failures.

### Verdict: PASS

### CRITICAL (blocks merge)
none

### WARNING (should fix)

[WARNING] Architecture/Process — bin/cli.js:201 (git history)
The US-04 `writeManifest()` implementation and its `runInstall` integration were committed inside the INFRA commit `718b0eb`, and its test file `tests/cli/writeManifest.test.js` was committed inside the US-02 commit `3a70517`. There is no dedicated `feat(FTR-011): implement US-04` commit, unlike US-01/US-02/US-03. This breaks the one-User-Story-per-commit vertical-slice convention stated in the Work Breakdown (section 4) and makes per-US traceability/rollback harder.
Direction: Not a code-correctness blocker. For future stories, keep each US in its own commit. No action required on the code itself.

### INFO (improvements)

[INFO] Error handling — bin/cli.js:213-218
`writeManifest` swallows all write errors, logging only a dim warning and returning normally. This is intentional best-effort behavior per the feature doc, but a silent manifest-write failure means the next install sees no manifest and treats every file as a first-install (orphans never computed) — degraded pruning with no visible signal beyond one dim line.
Direction: Consider elevating the warning severity or surfacing it in the final install summary so a persistent manifest-write failure is not missed.

[INFO] Test coverage — tests/cli/writeManifest.test.js
AC-13 (settings files never enter the manifest) is mapped to US-04 in the traceability matrix but is verified indirectly via `tests/cli/expandMappings.test.js` (lines 25-43), since `writeManifest` intentionally does not re-filter NEVER_COPY. This matches the feature's design note ("no additional manifest-level filter is needed"), so coverage exists — just not inside the writeManifest suite.
Direction: Optional — add a comment in writeManifest.test.js pointing to expandMappings as the AC-13 owner, to make the coverage boundary explicit for future reviewers.

[INFO] Defensive dedup — bin/cli.js:204-211
`writeManifest` does not dedupe `fileList`. In current usage `newFileSet` derives from `expandMappings` output which contains no duplicates, so this is not a live bug.
Direction: No change needed; note for awareness if writeManifest is ever called with caller-supplied lists.
