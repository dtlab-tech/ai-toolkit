# `src/claude/scripts/wb-validate.js` — Modified

**Related components:** [wb-graph-checks.md](wb-graph-checks.md), [wbs-assembler.md](wbs-assembler.md)

**Addresses:** AC-04, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

Behavior-preserving extraction only: checks 3, 5–14, 19–21 replaced with calls into
`wb-graph-checks.js` (see [wb-graph-checks.md](wb-graph-checks.md) for the decision); checks 4,
15–18, 22, 23 unchanged in place. Top-of-file JSON read/parse replaced by a call to the new
assembler loader (see [wbs-assembler.md](wbs-assembler.md)), so it accepts either a single JSON
file path or a `wbs/` directory path. CLI argv contract unchanged (`argv[2]` = path, `argv[3]` =
optional requirements path).

## Tests

`wb-validate.regression.test.js`: run `wb-validate.js` against the existing test fixtures
before/after the extraction; assert byte-identical JSON report and exit code (OQ-02's
behavior-preservation requirement — see [wb-graph-checks.md](wb-graph-checks.md)).
