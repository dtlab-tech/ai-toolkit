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
