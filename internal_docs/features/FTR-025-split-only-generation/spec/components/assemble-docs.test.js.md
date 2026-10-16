# tests/assemble-docs.test.js — New

## Change

New unit test file for `assemble-docs.js`, following the same hand-built-fixture pattern
`tests/tech-spec-assembler.test.js`/`tests/req-assembler.test.js` already use (temp directories
under `os.tmpdir()`, cleaned up in `afterEach`, no mocked LLM calls — this script has none).

## Tests

- `assembleReq()` against a real `req/` fixture produces the same content `loadRequirements()`
  would, written to `{prefix}-Requirements.md`.
- `assembleSpec()` against a real `spec/` fixture produces the same content `loadTechSpec()` would,
  written to `{prefix}-Tech-Spec.md`.
- `assembleWbs()` against a real `wbs/` fixture produces `{prefix}-Work-Breakdown.md`/`.csv`
  byte-identical to running `wb-render.js` directly on the same fixture.
- CLI `all` (no third argument) runs all three and returns a `written` array with all five paths
  (two for `wbs`, one each for `req`/`spec`).
- CLI with an unknown `which` value exits 1 with a usage-style stderr message; does not write
  anything.
- CLI for `req`/`spec` against a feature directory with no `req/`/`spec/` directory exits 2,
  stderr names the exact expected path (same `AssemblyError` message `req-assembler.js`/
  `tech-spec-assembler.js` already produce — this script does not invent a new error message).
- CLI for `wbs` against a feature directory with no `wbs/` directory exits 2, stderr names the
  exact expected path.
- Missing `<feature-dir>`/`<prefix>` CLI arguments exits 1 with a usage message.
