# tests/scripts/feature-split.test.js — New

## Change

New test file covering the shared library and facade of `src/claude/scripts/feature-split.js` and its default `feature-split.config.json`, for FTR-035. It exercises the configuration loader and comparison rules (D-01 to D-05), the new-feature test (D-07), the proposal model and edit rules (D-08 to D-12), atomic apply and the epic record (D-13, D-14, D-16, D-17), the registry (D-18 to D-21), the standalone `register` path (D-20, D-25), and the CLI facade contract (D-22 to D-24). Tests run against temporary fixture trees under the OS temp directory and never touch the real `internal_docs/features/`. Installer checks (D-06) belong to `feature-split-install.test.js`, and reader tolerance in the generator agents belongs to `tests/frontmatter/registry-reader-tolerance.test.js`; neither is covered here.

Open gaps for the host to surface at Gate 1:
1. **AC text is not in the excerpt.** The Addresses list has 41 IDs (AC-01 to AC-42, without AC-09). The excerpt gives only the decisions, so each case below names the decision it verifies. The host must confirm the AC-to-case mapping against Requirements before this file is accepted.
2. **Late-child input is undefined.** D-08's child shape has no checkpoint field, yet D-14 and D-16 require `late`, `definition` or `measured` per child in `epic.md`. The late-child case can assert the `late` placement, but not how `apply` learns that a child is late.
3. **Malformed or unreadable project override is unspecified.** D-04 covers non-integer, negative and unknown-key values only. The malformed-JSON case is marked pending until the rule is decided.
4. **Epic entry Detail target is unspecified** (Requirements AC-25, since the parent `feature.md` is removed). The epic-entry case checks the Detail line exists but not its target.
5. **Stale `.split-staging-*` cleanup is unspecified** (Tech-Spec §12). The test asserts only that no staging directory remains after a run that ends in success or in a handled error. The cleanup rule for leftovers from an earlier crashed run is owned by the script component, not this file.
6. **Registry format is assumed.** Fixtures use the D-18 layout (`## FTR-NNN: Title` headings with `**Key:**` lines). They must be checked against the live `REGISTRY.md` before implementation.
7. **Failure injection needs a seam.** Rollback and registry-write failure cases need a test hook in `feature-split.js`, for example an injectable `fs` adapter. The script component must provide it.
8. **Test runner convention.** `AGENTS.md` is not in the excerpt, so the runner (assumed `node:test`) is unconfirmed.

## Service Interface

The file imports only the library exports named in D-23 and invokes the facade through `run-asset`. Fixtures are built by helpers so each case states only what it changes.

```js
// tests/scripts/feature-split.test.js  (runner assumed node:test + node:assert; see Change gap 8)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../../src/claude/scripts/feature-split.js');
const {
  loadConfig, isNewFeature, isOverThreshold, meetsMinimum,
  buildProposal, editProposal, FeatureSplitError,
} = lib;

// Fixture helpers: each builds a fresh temp tree and removes it in afterEach.
function tmpProject({ override, registry, featuresRoot = 'internal_docs/features' } = {}) { /* ... */ }
function makeFeatureDir(root, id, files) { /* writes listed files; empty value = directory */ }
function sampleProposal(overrides = {}) {
  return {
    source: 'definition',
    children: [
      { name: 'Auth', purpose: 'Sign-in and sessions', summary: 'Sign-in and sessions',
        keywords: ['auth'], dependsOn: [], assigned: 'UC-01, UC-02' },
      { name: 'Billing', purpose: 'Invoices', summary: 'Invoices',
        keywords: ['billing'], dependsOn: ['Auth'], assigned: 'UC-03' },
    ],
    sharedFoundationOwner: 'Auth',
    foundationNote: 'Shared models',
    minChildren: 2,
    ...overrides,
  };
}
```

### Test cases by component area

**Configuration (D-01 to D-05)**
- `loadConfig` with no override returns exactly the D-02 shape: keys `thresholds.useCases/acceptanceCriteria/components/estimatedPhases`, `definitionSignals.minActors/minApplications/minFlows`, `minChildren`, with no extra keys.
- Override with a subset (for example only `thresholds.useCases: 5`) keeps every other key at its default (D-03).
- Missing override file is not an error (D-03).
- Non-integer (`1.5`, `"8"`), negative (`-1`), and unknown key (`thresholds.foo`) each throw `FeatureSplitError` with `code`, `key` and `file` set, and the `key` names the offending key (D-04).
- Missing toolkit default throws `FeatureSplitError` (D-04).
- Malformed JSON in the override is **pending** (Change gap 3).
- `isOverThreshold(8, 8)` is false; `isOverThreshold(9, 8)` is true (D-05).
- `meetsMinimum(2, 2)` is true; `meetsMinimum(1, 2)` is false (D-05).

**New-feature test (D-07)**
- Folder with `{PREFIX}-Approvals.md` returns `isNew: false` with a non-empty `reason`.
- Folder with a `wbs/` directory returns `isNew: false`.
- Folder with `epic.md` returns `isNew: false`.
- Folder with only `req/` and `spec/` returns `isNew: true`.
- Folder with `req/` and `spec/` plus a `--force` regeneration (same files rewritten) still returns `isNew: true`.
- Non-existent folder returns `isNew: true`.

**Proposal (D-08 to D-12)**
- `buildProposal` returns `{ source, children, sharedFoundationOwner, foundationNote, minChildren }` with `minChildren` equal to the loaded config value (D-08).
- Each child has `name, purpose, summary, keywords, dependsOn, assigned`, and `summary` equals `purpose` (D-11).
- `editProposal` removing a child so fewer than `minChildren` remain is refused with a message (D-09).
- Merging two children to a count still ≥ `minChildren` is accepted (D-09).
- Moving `sharedFoundationOwner` away from the first child returns a warning that names BR-03 and the consequence, and the edit is applied, not refused (D-10).
- Empty name, or a name that yields an invalid slug, is rejected (D-12).
- Two children with the same slug are rejected (D-12).
- An edited proposal is not re-measured: a spy on `isNewFeature` and the measure path records zero calls during `editProposal` (D-09).

**Apply and epic record (D-13, D-14, D-16, D-17, D-24)**
- Successful apply creates `epic.md` containing a split table with each child once, its order, dependencies, shared foundation, and checkpoint (D-14).
- `epic.md` ends with the verbatim original feature text in a trailing section (D-14).
- No `epic.json` is created (D-14).
- After a split, the parent folder contains only `epic.md` (D-14).
- Each child folder has `feature.md` with title, purpose-based summary, parent ID, dependency position, sibling dependencies, and assigned parts (D-15).
- Shared-foundation content appears only in the first child's `feature.md` (D-15).
- An existing child ID causes an error and the existing folder is byte-identical afterwards (D-13).
- Injected failure during the move phase: nothing remains under the features root, no `.split-staging-*` directory remains, and the error is reported (D-13).
- Injected failure during rollback: the run ends in error and the reported paths match the paths left on disk (D-13).
- Late child (D-16): with an existing epic, apply places the new child last, `dependsOn` contains the previous last child, and its checkpoint in `epic.md` is `late`. How apply recognises it as late is **pending** (Change gap 2).
- Re-applying an ID whose `feature.md` already exists is refused and does not overwrite (D-17).
- Facade `apply` reads the proposal from stdin and prints `{ epic, children: [{ id, dir }], registry: true }` with exit 0 (D-24).

**Registry (D-18 to D-21)**
- Each child entry has `Parent:` with the epic ID and `Depends on:` with sibling IDs, or `none` for the first child (D-18).
- The epic entry is changed in place: exactly one entry for the epic ID, status `epic` (D-19).
- Epic Keywords equal the union of child Keywords (D-19).
- Epic Summary is the first sentence of the original Summary (D-19).
- An entry with status other than `defined`, `completed` or `epic` is left byte-identical and is not treated as an epic (D-18).
- Registry write happens after `epic.md` exists: a test asserts `epic.md` is present when the registry is read (D-21).
- Unreadable or unwritable registry: everything moved into place is removed, no entry is registered, and the error is reported (D-21).
- Missing registry is created (D-21).
- A re-run does not duplicate existing entries (D-21).
- Epic Detail link exists; its target is **pending** (Change gap 4).
- Registry path comes from `resolve-features-root` (D-22). Fixture uses a non-default features root to prove no path is hard-coded.

**Standalone register (D-20, D-25)**
- `register` on a feature folder writes one entry with status `defined` and prints `{ id, status: "defined" }` (D-25).
- Summary is the first sentence of the feature's Summary section (D-20).
- Keywords passed on the command line appear in the entry (D-20).
- Running `register` twice does not duplicate the entry (D-21).

**Facade contract (D-22, D-23)**
- `run-asset scripts/feature-split.js --project <root> -- <command>` prints exactly one JSON object on stdout (D-23).
- Success exits 0 (D-23).
- A `FeatureSplitError` exits 1 and prints a JSON error on stdout (D-23).
- An operational error (unknown command) exits 1 (D-23).
- Library exports include exactly `loadConfig, isNewFeature, isOverThreshold, meetsMinimum, buildProposal, editProposal, FeatureSplitError` (D-23).

## Tests

This file is the test suite itself. It covers:

- `tests/scripts/feature-split.test.js`: all cases above, grouped by the six areas (Configuration, New-feature test, Proposal, Apply and epic record, Registry, Facade contract) plus standalone `register`.
- Out of scope, handled elsewhere: installer placement (D-06) in `tests/scripts/feature-split-install.test.js`, and generator reader tolerance in `tests/frontmatter/registry-reader-tolerance.test.js`.

Every case uses a temporary fixture tree and cleans it up. The pending cases (malformed override, late-child detection, epic Detail target) are marked skipped with a reason pointing to the matching Change gap, so the gap stays visible in the test report until the host resolves it.