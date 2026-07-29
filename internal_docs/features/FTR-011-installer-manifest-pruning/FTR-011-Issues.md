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
