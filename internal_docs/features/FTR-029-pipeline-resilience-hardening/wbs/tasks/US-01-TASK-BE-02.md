<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Relax the feature-doc validator's schema to not require the fix-routing booleans
- **Outcome:** pm-phase1.js's gaia-validate-feature-docs worker call schema drops needsRequirementsFix/needsTechSpecFix from its required array (both remain in properties, still type-checked when present)
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-01, AC-02
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 14000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** fix
- **Commit scope:** pm-phase1
- **Commit subject:** stop requiring needsRequirementsFix/needsTechSpecFix in the validator's schema

**Implementation notes:**

Per `spec/components/pm-phase1.js.md`'s "Edit 1" — a one-line change to the `required` array in the
`gaia-validate-feature-docs` worker call's schema literal (the call this file already builds for
FTR-028's validation cycle):

```js
// before:
required: ['valid', 'findings', 'needsRequirementsFix', 'needsTechSpecFix', 'report']
// after:
required: ['valid', 'findings', 'report']
```

Both fields stay declared in `properties` — only `required` changes. Add a short comment at the
change site explaining WHY (confirmed against three real evidence files that the model reasonably
omits both when there is nothing to fix) — do not leave this as an unexplained one-liner a future
reader could easily "fix" back to requiring both.

Nothing else about this worker call changes. Confirm the host's own merge logic
(`mergedNeedsTechSpecFix = result.needsTechSpecFix || ...`, `mergedNeedsRequirementsFix =
result.needsRequirementsFix || ...`, both already present from FTR-028) already treats an absent
value as falsy — no further code change needed there.

**Verification commands:**

```
npm test
```
