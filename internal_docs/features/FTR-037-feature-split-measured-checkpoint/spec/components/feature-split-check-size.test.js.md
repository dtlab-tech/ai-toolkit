# tests/scripts/feature-split-check-size.test.js — New

Domain: TEST
Addresses: AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08, AC-09, AC-14, AC-15, AC-18

## Change

This new file tests the `check-size` command of `src/claude/scripts/feature-split.js` (FTR-037 D-05) through its real CLI, not through internal helpers. Each test builds a temporary project in a fixture folder, writes the feature folder (`req/use-cases/*.md`, `req/index.md`, `spec/index.md`, and a Tech-Spec Section 11 build order), writes the FTR-035 configuration with explicit thresholds, runs `check-size --feature-dir <dir> --prefix <FTR-ID>`, and asserts on the printed JSON `{ status, counts, thresholds, over, unavailable, proposal }`. It covers the new-feature test (D-05 `skipped`), the four counts (D-01), the threshold comparison (D-03), the build-order depth rule (D-02), the unavailable paths (D-04), the `split-proposed` shape with `source: "measured"` (D-05, D-07), and read-only behaviour (BR-01). Nothing in the file is changed by the test except the temp directory, which is removed afterwards. The excerpt does not contain the AC wording, so each test is tied to the feature.md rule it checks (D-xx / BR-xx) rather than to an AC number; the AC-to-test mapping is by subject and should be confirmed against the Requirements.

Open gaps that limit this file:
- **Component definition (T-2 vs D-01 / BR-05):** D-01 says "the rows of the component table" (singular), Tech-Spec T-2 counts New and Modified subtable rows de-duplicated by Path, and BR-05 says a single table with no union. The component-count fixture cannot be finalised until the user chooses one. Until then the test asserts only that rows of the chosen table are counted once.
- **Keywords (D-09 vs Tech-Spec `check-size` LLM-free):** `check-size` is specified as deterministic. This file asserts no Keywords value from `check-size`, and does not assume an agent produces them.
- **Foundation / build-order mapping (open gap 5):** how a component maps to a build-order item is undefined, so the depth-0 foundation assertion is marked pending.
- **Thresholds:** no numeric defaults are asserted. Every test injects its own thresholds, because the Requirements default values (Open Question 2) are still open and the Tech-Spec values are placeholders.
- **Test runner:** the excerpt does not name it. This design assumes Node's built-in `node:test` with `node:assert/strict`, to be confirmed against AGENTS.md.

## Test Harness

Helper that builds a fixture and runs the CLI:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = 'src/claude/scripts/feature-split.js';

function makeProject({ thresholds, files, newFeature = true }) {
  const root = mkdtempSync(join(tmpdir(), 'check-size-'));
  // FTR-035 configuration with explicit thresholds (keys per FTR-035 D-02)
  writeFileSync(join(root, 'feature-split.config.json'), JSON.stringify({ thresholds }));
  const feature = join(root, 'internal_docs', 'features', 'FTR-900-fixture');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(feature, rel, '..'), { recursive: true });
    writeFileSync(join(feature, rel), body);
  }
  if (!newFeature) writeFileSync(join(feature, 'FTR-900-Approvals.md'), '# approvals');
  return { root, feature };
}

function runCheck(root, feature) {
  let out, code = 0;
  try {
    out = execFileSync(process.execPath,
      [SCRIPT, '--project', root, 'check-size', '--feature-dir', feature, '--prefix', 'FTR-900'],
      { encoding: 'utf8', cwd: process.cwd() });
  } catch (e) { out = e.stdout; code = e.status; }
  return { result: JSON.parse(out), code };
}
```

The config path and key names are placeholders for the FTR-035 contract and must be taken from FTR-035 when the file is written.

## Tests

Test file: `tests/scripts/feature-split-check-size.test.js` (this file only). Each case uses its own temp project and removes it in `after`.

1. **Not new → skipped (D-05, UC-01).** For each of `FTR-900-Approvals.md`, a `wbs/` directory and `epic.md`, `status` is `"skipped"`, exit code 0, and no `counts` are computed.
2. **Folder that does not exist → new (D-05).** `status` is not `"skipped"`, and counts are measured.
3. **Use cases (D-01).** Distinct `UC-NN` IDs across several `req/use-cases/*.md` files. A UC listed in two files counts once. Text that is not a `UC-NN` ID is ignored.
4. **Acceptance criteria (D-01).** Distinct `AC-NN` IDs in `req/index.md`. A repeated AC row counts once.
5. **Components (D-01, pending on T-2 / BR-05 decision).** Rows of the single component table in `spec/index.md` are counted. A row duplicated by Path counts once only if the chosen definition says so. Rows in other tables are not counted.
6. **Estimated phases, depth (D-02).** Independent items give 1 level. A chain of three gives 3. A diamond gives 3. Depth is the greatest dependency depth plus one.
7. **Threshold comparison (D-03).** A count one above its threshold is in `over`. A count equal to its threshold is not in `over`, and `status` is `"passed"` when nothing is over.
8. **Split proposed (D-05).** With one or more counts over, `status` is `"split-proposed"`, exit 0, `over` lists the exceeded counts, and `proposal.source` is `"measured"`. `proposal` is absent for `passed` and `skipped`.
9. **Unavailable: missing or empty source (D-04).** Missing `req/index.md`, or an empty component table, gives `status: "unavailable"`, exit code 1, and `unavailable` containing `{ count, reason }` naming that count. Other counts still report.
10. **Unavailable: build order (D-02).** A dangling dependency, a cycle, and an item with no `depends on:` clause each give `phases` unavailable with a reason.
11. **Unavailable never passes (BR-03, BR-04).** A check with any unavailable count never reports `"passed"`.
12. **Read-only (BR-01).** Hash every file in the feature folder before and after `check-size` for a `split-proposed` run. The hashes must match.
13. **Output shape (D-05).** The printed object has exactly the keys `status`, `counts`, `thresholds`, `over`, `unavailable`, `proposal`, and `counts`/`thresholds` use the FTR-035 D-02 key names.
14. **Foundation (D-07, pending open gap 5).** Depth-0 components give the first child in dependency order as foundation. When the build order has no distinct depth-0 level, the proposal states that explicitly. Marked `test.todo` until the component-to-build-order mapping is defined.
15. **No Keywords from check-size (D-09 vs deterministic `check-size`).** `proposal` children contain no agent-generated Keywords. Marked `test.todo` until the user resolves the D-09 / Tech-Spec conflict.