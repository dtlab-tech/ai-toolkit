<a id="task-INFRA-TASK-INFRA-01"></a>
### INFRA-TASK-INFRA-01

- **Task ID:** INFRA-TASK-INFRA-01
- **Title:** Create toolkit default feature-split configuration file
- **Outcome:** src/claude/scripts/feature-split.config.json exists in the D-02 shape with thresholds (useCases 8, acceptanceCriteria 15, components 30, estimatedPhases 6), definitionSignals (minActors 2, minApplications 2, minFlows 3) and minChildren 2.
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 5
- **Estimate — tokens:** 4000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add default feature-split configuration file

**Implementation notes:**

This is a new, data-only file. No existing code is modified, and no loader logic is written here. The loader that reads this file belongs to INFRA-TASK-BE-01 and later tasks.

Create `src/claude/scripts/feature-split.config.json` with exactly this content (pretty-printed, two-space indent, trailing newline):

```json
{
  "thresholds": {
    "useCases": 8,
    "acceptanceCriteria": 15,
    "components": 30,
    "estimatedPhases": 6
  },
  "definitionSignals": {
    "minActors": 2,
    "minApplications": 2,
    "minFlows": 3
  },
  "minChildren": 2
}
```

Rules that follow from the Tech-Spec (Section 8 and Section 6):

- The file has exactly three top-level keys: `thresholds`, `definitionSignals`, `minChildren`. Unknown keys are not allowed by the loader's D-02 validation, so do not add others.
- All values are integers >= 0.
- The values are uncalibrated placeholders (BR-04). Do not tune them.
- No installer change is needed. The `scripts` category already copies `.json` files (D-06).

The Tech-Spec file inventory lists AC-01, AC-02 and AC-09 against this file, but the skeleton entry has an empty `acceptanceCriteria` field. The skeleton value is restated as given, and this task does not re-derive it.

**Verification commands:**

```
test -f src/claude/scripts/feature-split.config.json
```

```
node -e "const c=JSON.parse(require('fs').readFileSync('src/claude/scripts/feature-split.config.json','utf8'));const t=c.thresholds,d=c.definitionSignals;process.exit(t.useCases===8&&t.acceptanceCriteria===15&&t.components===30&&t.estimatedPhases===6&&d.minActors===2&&d.minApplications===2&&d.minFlows===3&&c.minChildren===2&&Object.keys(c).sort().join(',')==='definitionSignals,minChildren,thresholds'?0:1)"
```

```
npm test
```