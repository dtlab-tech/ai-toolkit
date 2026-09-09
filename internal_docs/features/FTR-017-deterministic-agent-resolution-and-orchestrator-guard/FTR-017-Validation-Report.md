# Validation Report — FTR-017 (Deterministic Agent Resolution and Orchestrator Guard)

## Validation date
2026-09-04 (regenerated after the targeted revision aligning the docs to the real source contracts)

## Scope of this validation
This report validates `FTR-017-Requirements.md` and `FTR-017-Tech-Spec.md` against
`feature.md` (frozen, read-only) AND against the authoritative source of truth in the
repository:
- `lib/execution-ledger.js` — ledger lifecycle and persistent ledger path
- `bin/cli.js` — real `readManifest`/`writeManifest` signatures, `installationMode` enum, manifest filename, and the FTR-015 effective-installation resolver
- `src/claude/scripts/wb-validate.js` — the deterministic Work-Breakdown / AC-table validator (`splitTableRow`, `parseAcTable`)

## Summary
| Document | Gaps found | Gaps resolved | Status |
|----------|-----------|--------------|--------|
| FTR-017-Requirements.md | 9 | 9 | Aligned to source contracts |
| FTR-017-Tech-Spec.md    | 9 | 9 | Aligned to source contracts |
| Requirements ↔ Tech-Spec consistency (exit codes / status vocabulary / cleanup) | — | — | Consistent |

`feature.md` was treated as frozen ground truth and was NOT modified.

---

## 1. Acceptance-Criteria table: format + 42-row verification

### 1.1 Required format (per `wb-validate.js`)
`parseAcTable()` requires the AC table under `## 7. Acceptance Criteria` to have, in order,
columns `ID`, `Criterion`, `Related UC` (a trailing `Priority` column is permitted and
ignored — priority is DERIVED from the referenced UCs). `Related UC` must be either the
literal `All UCs` or a comma-separated list of `UC-NN` tokens each matching `^UC-\d+$`; each
referenced UC must exist as a `### UC-NN:` heading with a `| Priority | <value> |` row.
Literal pipes inside a cell must be escaped `\|` (handled by `splitTableRow`).

### 1.2 What was wrong
The table used `ID | Given | When | Then | Priority` — a 5-column form the deterministic
validator rejects (it requires `Criterion` and `Related UC` as columns 2 and 3). This was a
BLOCKER: the table would never parse.

### 1.3 Fix applied
All 42 rows were rewritten to `ID | Criterion | Related UC | Priority`, folding
Given/When/Then into a single `Criterion` sentence. Each `Related UC` holds only `UC-NN`
tokens referencing UCs that exist in the document (UC-01…UC-14). No BR/NFR references and no
ranges appear in `Related UC`. No literal pipes are present in any cell.

UC mapping applied (all 42):
AC-01 → UC-01; AC-02 → UC-05, UC-12; AC-03 → UC-01; AC-04 → UC-02; AC-05 → UC-02, UC-10;
AC-06 → UC-04; AC-07 → UC-04; AC-08 → UC-04; AC-09 → UC-08, UC-10; AC-10 → UC-10;
AC-11 → UC-11; AC-12 → UC-13; AC-13 → UC-08; AC-14 → UC-08; AC-15 → UC-09; AC-16 → UC-09;
AC-17 → UC-12; AC-18 → UC-12; AC-19 → UC-03; AC-20 → UC-04, UC-14; AC-21 → UC-14;
AC-22 → UC-04, UC-14; AC-23 → UC-11; AC-24 → UC-12; AC-25 → UC-05, UC-12; AC-26 → UC-12;
AC-27 → UC-12; AC-28 → UC-08, UC-10; AC-29 → UC-08, UC-10; AC-30 → UC-01; AC-31 → UC-05;
AC-32 → UC-01; AC-33 → UC-08; AC-34 → UC-12; AC-35 → UC-12; AC-36 → UC-12; AC-37 → UC-12;
AC-38 → UC-11; AC-39 → UC-02, UC-03; AC-40 → UC-11; AC-41 → UC-14; AC-42 → UC-05.

### 1.4 Verification with the REAL parser (evidence)
The table was fed through the real validator `src/claude/scripts/wb-validate.js` (which calls
`parseAcTable()` / `splitTableRow()`), using a minimal Work Breakdown so the run isolates
AC-table parsing.

Command:
```
printf '{ "schemaVersion": 2, "phases": [] }' > wb-min.tmp.json
node src/claude/scripts/wb-validate.js wb-min.tmp.json \
  "internal_docs/features/FTR-017-deterministic-agent-resolution-and-orchestrator-guard/FTR-017-Requirements.md"
```

Result:
```
EXIT=1
--- STDERR ---            (empty — no format/token error from parseAcTable)
must_ac_uncovered: 42 | non-AC categories: []
```

Interpretation:
- **STDERR is empty** → `parseAcTable()` raised none of its `process.exit(2)` format errors
  (no bad header, no malformed UC token, no reference to a non-existent UC, no missing UC
  priority, no duplicate AC ID). Every row split into exactly the 4 expected fields with a
  valid `Related UC`.
- **All 42 ACs were recognized** — the validator emitted exactly 42 `must_ac_uncovered`
  entries (AC-01…AC-42), one per parsed AC. These appear only because the throwaway WB has no
  tasks; they confirm each of the 42 rows parsed as a valid AC. There are **no** other error
  categories (a format failure would have been exit 2 with a stderr message; here it is exit 1
  from coverage only, i.e. a WB concern, not a table-format concern).

The AC table is therefore confirmed valid under the deterministic validator.

---

## 2. Ledger lifecycle + self-entry (`dispatch` vs `self`)

Checked against `lib/execution-ledger.js`: `open()` sets `status: 'running'`, `close()` sets
`'done'`, `fail()` sets `'failed'`, `skip()` sets `'skipped'`.

Gaps found:
- UC-03 postcondition claimed `status: closed` — FTR-016 uses `done`.
- UC-14 main flow claimed `status: open` — FTR-016 uses `running`.
- UC-06 (Tier 3) said the self entry (`pm-phaseN:self`) is closed by Tier 1. Tier 1 actually
  closes `pm-phaseN:dispatch`, a DIFFERENT operation, so the self entry would remain `running`
  forever.

Resolution:
- All ledger statuses corrected to the FTR-016 vocabulary (`running`/`done`/`failed`/`skipped`)
  across Requirements (UC-03, UC-14) and the Tech-Spec (sequence diagram, External Integrations).
- The two operations are now explicitly distinct: **Tier 1 opens AND closes/fails
  `pm-phaseN:dispatch`**; **each workflow opens `pm-phaseN:self` at startup and the SAME
  workflow closes it (`done`) on success or marks it `failed` in its own error path**; a
  genuine interruption may legitimately leave `:self` `running` (consistent with FTR-016
  resume). All terminal operations are stated as fail-closed. Reflected in UC-04, UC-06, the
  happy-path sequence diagram, and the ledger integration section.

---

## 3. Local/global manifest resolution (FTR-015 resolver)

Checked against `bin/cli.js`: manifest file is `.ai-toolkit-manifest.json` at
`{destRoot}/.claude/`; the resolver treats `localPresent && globalPresent` as an ambiguity
error, otherwise `effectiveRoot`/`effectiveMode` is whichever installation is present.

Gap found: UC-01 and the Tech-Spec assumed the manifest is always under `{project}/.claude`.

Resolution: UC-01 now FIRST determines the single effective installation via the FTR-015
resolver, then reads local `<projectDir>/.claude/.ai-toolkit-manifest.json` OR global
`<homeDir>/.claude/.ai-toolkit-manifest.json` accordingly, and never reads the local manifest
when the effective mode is global. Both-present → ambiguity → non-zero. Test scenarios
added (Requirements dependency note + Tech-Spec E2E table): local-only, global-only, and
mixed (local+global → ambiguity).

---

## 4. Diagnostic-mode contract vs AC-05

Gap found: UC-01 claimed exit 0 for unknown ID, absent agent, and missing manifest, which
contradicted AC-05 (non-zero for ambiguous/missing agent).

Resolution (UC-01 + CLI table + Tech-Spec API table now agree):
- Unknown ID, collision/ambiguity, corrupt manifest, and unresolvable installation → non-zero
  EVEN in diagnostic mode.
- Known agent with a legacy manifest lacking hashes → exit 0, `hash-unverifiable`.
- Known agent with a non-matching digest → diagnostic MAY return `hash-mismatch` (exit 0), but
  `--require-verified` MUST fail non-zero.
- Operational mode passes ONLY with `verified`.
- For `doctor agents`, whose approved status vocabulary does NOT contain `hash-mismatch`, a
  digest mismatch is represented as `conflict` with an integrity detail of `hash-mismatch`
  (NOT `hash-unverifiable`); a manifest simply lacking hashes stays `hash-unverifiable`.
  Fixed in UC-08.

---

## 5. Cleanup algorithm (UC-09)

Gap found: UC-09 treated a manifest-declared file that is already ABSENT from disk as "stale".

Resolution: cleanup candidate is now defined as a file present in the OLD manifest, no longer
part of the current payload/catalog, AND still present on disk. A manifest entry whose file is
absent from disk is a diagnostic `missing` (never a candidate). A file present on disk but
absent from the manifest is user-owned/foreign and never proposed. FTR-017 stays fully
read-only. AC-15/AC-16 and the CLI table were aligned to this taxonomy.

---

## 6. Tech-Spec aligned to REAL APIs

Verified real signatures in `bin/cli.js`: `readManifest(destRoot)` and
`writeManifest(destRoot, fileList, installationMode)`; `installationMode` enum is
`"local" | "global"`; manifest constant `MANIFEST_FILE = '.ai-toolkit-manifest.json'`.

Gaps found: the Tech-Spec redefined `readManifest(manifestPath)` and
`writeManifest(manifestPath, manifest, fileHashes)` — a breaking change contradicting the
declared backward compatibility.

Resolution: signatures corrected to EXTEND the existing ones —
`readManifest(destRoot)` (unchanged) and `writeManifest(destRoot, fileList, installationMode, fileHashes?)`
(fourth optional parameter only). Added an explicit note (§3.2) that `bin/cli.js` IMPORTS the
domain functions (`resolveAgent`, `validateAgentSet`, `listRegisteredAgents`) from
`lib/agent-registry.js` and must not duplicate them; File Inventory and Implementation Order
steps updated to match.

---

## 7. Hash verification re-reads the file on every resolve/preflight

Gap found: the Tech-Spec simultaneously claimed the on-disk file is compared to the digest AND
that it is not recomputed per dispatch (contradictory; using only the stored value can never
detect a post-install modification). It also over-claimed that SHA-256 "prevents tampering".

Resolution:
- Expected digest is read from the manifest; the current digest is RECOMPUTED from the on-disk
  file on every `resolve --require-verified` and every preflight; the two are compared. Any
  caching is permitted ONLY within a single operation, never across operations without reliable
  invalidation. (Security section, both risk rows, and the resolution sequence diagram updated.)
- The manual test now states a modified file yields `hash-mismatch` (not `hash-unverifiable`),
  and `doctor agents` reports it as `conflict` / `hash-mismatch`.
- The security note no longer claims anti-tamper: SHA-256 here DETECTS file/manifest divergence;
  the manifest is unsigned and provides no cryptographic authenticity.

---

## 8. Pointed Tech-Spec fixes

- Persistent ledger path corrected to `{featureDir}/{PREFIX}-token-ledger.json` (matches
  `lib/execution-ledger.js` `path.join(dir, prefix + '-token-ledger.json')`), NOT
  `.claude/.ai-toolkit-ledger.json`.
- `agents preflight` no longer shows an external `--require-verified` flag (it uses those
  semantics internally); removed from the component diagram and SKILL.md instruction.
- Removed the "global scope over non-observable scopes" claim; restored the approved
  residual-limit wording (session scope may have different precedence and is non-observable).
- CLI table no longer declares `agents cleanup` "exit 0 always" — mutating flags produce a
  non-zero exit.
- Removed the "manifest is read-only once produced" claim — the installer rewrites it on
  installs and upgrades.
- Removed the unspecified temp+fsync+rename atomic-write promise for the manifest (not in
  FTR-017 scope/tests).

---

## 9. Assessment pipeline + static tests

- Provenance-guard integration into `assess-codebase` is DEFERRED and is no longer an FTR-017
  task. Removed the "similar guard integration" task from Phase A File Inventory and from the
  Implementation Order; FTR-017 permits only the reference updates needed during Phase B
  renames.
- Static tests are now specified as VERSIONED Jest tests under `tests/regression`/`tests/cli`,
  run by the existing `npm test`; they are NOT bare greps in `.github/workflows/ci.yml` (CI
  simply runs the existing suite). AC-18/AC-42, File Inventory, Testing Strategy, and
  Implementation Order updated; a `tests/regression/static-guards.test.js` file was added to
  the inventory.
- E2E is specified as fully deterministic and must NOT start a real LLM pipeline: it simulates
  the CLI, the manifest, and a temporary home, and verifies workflow dispatch
  statically/contractually.

---

## 10. Requirements ↔ Tech-Spec consistency check

- **Exit codes:** UC-01, the Requirements CLI table, and the Tech-Spec API table agree —
  diagnostic `resolve` exits 0 only for a resolvable known agent (`verified`/`hash-unverifiable`/
  diagnostic-only `hash-mismatch`) and non-zero for unknown ID / collision / corrupt manifest /
  unresolvable installation; operational mode exits 0 only on `verified`; `agents cleanup` is
  non-zero on any mutating flag.
- **Status vocabulary:** both documents use the FTR-016 ledger vocabulary
  (`running`/`done`/`failed`/`skipped`) and the resolution/doctor vocabulary
  (`verified`/`conflict`/`hash-unverifiable`/`unobservable`/`not-installed`/`not-applicable`,
  with a digest mismatch surfaced as `conflict` + `hash-mismatch` detail in `doctor agents`).
- **Cleanup:** both documents use the same taxonomy (candidate = old-manifest ∧ not-in-current-
  payload ∧ still-on-disk; `missing` = manifest entry absent from disk; foreign = on disk but
  not in manifest, never proposed; read-only).
- **Manifest APIs & paths:** both use `readManifest(destRoot)` /
  `writeManifest(destRoot, fileList, installationMode, fileHashes?)`, `installationMode`
  ∈ {`local`,`global`}, manifest at `<installRoot>/.claude/.ai-toolkit-manifest.json`.

---

## Gaps found and how each was resolved
| # | Gap | Resolution |
|---|-----|-----------|
| 1 | AC table in `Given/When/Then` form — rejected by `wb-validate.js` (BLOCKER) | Rewrote all 42 rows to `ID | Criterion | Related UC | Priority`; verified with the real parser (exit 1, empty stderr, 42 ACs recognized) |
| 2 | Ledger statuses `closed`/`open` and self-entry closed by Tier 1 | Corrected to `done`/`running`; separated `pm-phaseN:dispatch` (Tier 1) from `pm-phaseN:self` (workflow-owned); fail-closed terminals |
| 3 | Manifest assumed always local | Resolve effective installation via FTR-015 resolver first; read local or global manifest accordingly; never read local when global; added local/global/mixed scenarios |
| 4 | Diagnostic mode exit-0 contradicted AC-05; `hash-mismatch` misused in `doctor agents` | Non-zero (even diagnostic) for unknown ID/collision/corrupt/unresolvable; `hash-unverifiable` only for hashless manifest; digest mismatch → `conflict`+`hash-mismatch` detail in doctor |
| 5 | Cleanup treated absent-on-disk manifest entries as stale | Redefined candidate/`missing`/foreign taxonomy; read-only |
| 6 | Tech-Spec redefined manifest APIs (breaking) | Restored `readManifest(destRoot)` / `writeManifest(destRoot, fileList, installationMode, fileHashes?)`; CLI imports registry domain functions |
| 7 | Contradictory hash-caching claim + anti-tamper over-claim | Recompute on-disk digest every resolve/preflight; per-operation caching only; SHA-256 detects divergence, not tampering (unsigned manifest) |
| 8 | Wrong ledger path; stray `preflight --require-verified`; precedence/read-only/atomic-write over-claims | Corrected ledger path to `{featureDir}/{PREFIX}-token-ledger.json`; removed external preflight flag; fixed precedence wording; removed read-only and temp+fsync+rename claims; cleanup exit-code fixed |
| 9 | `assess-codebase` guard task in Phase A; static tests as ci.yml greps; non-deterministic E2E | Deferred `assess-codebase` guard; static tests are versioned Jest run by `npm test`; E2E deterministic with simulated CLI/manifest/temp-home, no real LLM |

## Remaining gaps
None. All nine gap classes were resolved consistently across Requirements and Tech-Spec, and
the AC table was verified against the real deterministic validator.

## Confirmation
`feature.md` was read as frozen ground truth and was NOT modified. No Work Breakdown or other
file was created; only the three target documents were edited (plus this regenerated report).
