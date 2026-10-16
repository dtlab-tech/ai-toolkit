# `src/claude/scripts/wb-render.js` — Modified

**Related components:** [wbs-assembler.md](wbs-assembler.md)

**Addresses:** AC-05, AC-08, AC-09 (see [req/index.md](../../req/index.md#6-acceptance-criteria))

## Change

Surgical: top-of-file JSON read/parse (lines ~20–48) replaced by the same assembler loader call
(see [wbs-assembler.md](wbs-assembler.md)). `renderMarkdown`/`renderCsv`/`computePhaseDependsOn`/
`sanitizeField`/`fencedCommandBlock`/`taskAnchor` **unchanged**. CLI argv contract unchanged.

## Tests

`wb-render.regression.test.js`: render from a `wbs/` directory and from an equivalent legacy
JSON; assert byte-identical `.md`/`.csv` output (AC-05). Reuses the shared dogfooding fixture —
see [index.md §6](../index.md#6-shared-test-fixture).
