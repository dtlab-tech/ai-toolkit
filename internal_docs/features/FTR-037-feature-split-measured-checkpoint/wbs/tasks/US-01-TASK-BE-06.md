<a id="task-US-01-TASK-BE-06"></a>
### US-01-TASK-BE-06

- **Task ID:** US-01-TASK-BE-06
- **Title:** Attach measured proposal envelope with empty keywords to split-proposed result
- **Outcome:** For status split-proposed, check-size includes a proposal built through the FTR-035 buildProposal with source measured, the over-threshold counts, and keywords as an empty array for every child. The proposal key is absent for all other statuses.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-05
- **Acceptance criteria:** AC-03, AC-18
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** attach measured proposal envelope to check-size result

**Implementation notes:**

**Scope note (read first).** The grouping rule (Tech-Spec T-6) and the depth-0 component mapping (T-7) are decided (Gate 1 decision 1) but are built by US-02-TASK-BE-01 to BE-03. Until then the grouping step of `buildProposal` is a stub that throws `Unavailable(...)`, so on current inputs an over-threshold feature takes the `unavailable` path, never `split-proposed`. That is the intended fail-closed behaviour (BR-03). This task wires the call correctly; do not write the grouping rule or the depth-0 mapping here.

**Also confirm before writing:** the Algorithm defines `buildProposal` inside `feature-split.js`, while the Change section says the proposal shape comes from FTR-035 D-08 and that the FTR-035 surface is called, not changed. Check whether `feature-split.js` (or the FTR-035 module it imports) already exports a `buildProposal`. If it exists, call that export. If it does not exist anywhere, stop and report it. Do not write a second implementation.

**Target change (in `src/claude/scripts/feature-split.js`).** The excerpt gives no current line ranges. Locate the `checkSize` function and its `split-proposed` branch, which BE-05 created. The change is limited to that branch and to the `result()` helper. Before:

```js
// BE-05: split-proposed return without a proposal
return result('split-proposed', { counts, thresholds, over });
```

After:

```js
if (over.length === 0) return result('passed', { counts, thresholds });

let proposal;
try {
  proposal = buildProposal({ featureDir, counts, over }); // FTR-035 D-08 shape, source 'measured'
} catch (err) {
  // Open gap 1/2: buildProposal throws Unavailable. Stop as unavailable, never passed (BR-03).
  return result('unavailable', {
    counts, thresholds, over,
    unavailable: [{ count: 'proposal', reason: err.message }] // count key is a choice; confirm at review
  });
}

// Every child carries an empty keywords array; the main loop fills it later (D-09).
proposal.children = proposal.children.map(c => ({ ...c, keywords: [] }));
return result('split-proposed', { counts, thresholds, over, proposal });
```

**Rules this change must keep:**

- `proposal` is set only in the `split-proposed` return. `result()` must not add a `proposal` key by default, so `passed`, `skipped` and `unavailable` print no `proposal` key at all. Do not print `proposal: null`.
- The unavailable check (BE-05) runs before this branch. If any count is unavailable, `buildProposal` is never called, so the output is `unavailable` with no proposal, and `over` is still listed (BR-03, precedence test).
- `proposal.source` must be `'measured'`, and `overCounts` must equal the `over` array.
- `keywords` is always `[]` in `check-size` output. Do not derive keywords here, since keyword derivation is not deterministic measurement (D-09 and the Tech-Spec note that check-size is LLM-free).
- No `require` of an LLM client is added. The module stays read-only (BR-01).
- Exit code: 0 for `split-proposed`, 1 for `unavailable`. The `unavailable` path produced by the catch above exits 1 through the BE-01 exit logic.

**Test linkage.** The gap behaviour is covered by the BE-05/TEST-03 cases. The shape cases (`source: "measured"`, `keywords: []`, absent `proposal` on other statuses) are covered by TEST-01 and TEST-03. This task does not add test files. Note that AGENTS.md specifies Jest (`describe`/`test`), while the Tech-Spec design assumes `node:test`. That conflict is for TEST-01 to resolve, and it does not block this task.

**Verification commands:**

```
grep -q "keywords: \[\]" src/claude/scripts/feature-split.js
```

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```