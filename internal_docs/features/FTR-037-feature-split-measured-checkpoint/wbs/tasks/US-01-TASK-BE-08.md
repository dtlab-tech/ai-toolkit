<a id="task-US-01-TASK-BE-08"></a>
### US-01-TASK-BE-08

- **Task ID:** US-01-TASK-BE-08
- **Title:** Insert check-size hook after validation loop and return split_checkpoint
- **Outcome:** pm-phase1.js runs check-size through c.command with run-asset, scripts/feature-split.js, --project, --feature-dir and --prefix after the validation loop and before the Gate 1 digest. It returns split_checkpoint on every path and skips the digest for any status other than passed or skipped.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-07, US-01-TASK-BE-06
- **Acceptance criteria:** AC-03, AC-05, AC-17, AC-18, AC-22
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add check-size hook to pm-phase1 before Gate 1 digest

**Implementation notes:**

Modifies `src/claude/workflows/pm-phase1.js`. The change is one insertion, plus a new key on the return value. Nothing else in the file changes.

Gate 0 — anchors. The Tech-Spec excerpt does not give the real identifiers for the validation loop, the Gate 1 digest, the `c.command` helper's call form, or the `run-asset` result shape (stdout, exit code). The snippet below uses assumed names (`validationLoop`, `buildGate1Digest`, `existingReturn`, `runCommand`). Before editing, locate the real names in the file and substitute them. Do not guess. If the file has no clear validation loop or Gate 1 digest anchor, stop and report that instead of inserting code.

Reuse, do not re-implement. BE-07 already added the guarded parser to this file. Call that parser; do not add a second one. It is `parseSplitCheck(result)` and takes the whole run-asset result object (BE-07), never a string: a string argument fails its object check and every check would be reported as unavailable. If BE-07 used another name, use that name.

Insertion point. Place the new block immediately after the validation loop closes and immediately before the line that builds the Gate 1 digest (the `docsDigest` computation, per the Tech-Spec).

```js
// Inserted after the validation loop, before the Gate 1 digest.
const checkRun = await runCommand(c.command(['run-asset', 'scripts/feature-split.js',
  '--project', c.root, '--', 'check-size',
  '--feature-dir', featureDir, '--prefix', prefix]));   // assumed: c.command form and run helper
const split_checkpoint = parseSplitCheck(checkRun); // from BE-07: the whole result object

if (split_checkpoint.status !== 'passed' && split_checkpoint.status !== 'skipped') {
  // split-proposed, unavailable, or any unknown status: no Gate 1 digest.
  return { ...existingReturn, split_checkpoint };
}

// passed or skipped: the existing digest code runs unchanged.
const gate1Digest = buildGate1Digest(/* existing arguments, unchanged */);
return { ...existingReturn, gate1Digest, split_checkpoint };
```

Rules this snippet must satisfy:
- The argument list is exactly `run-asset`, `scripts/feature-split.js`, `--project`, the project root, `--`, `check-size`, `--feature-dir`, the feature folder, `--prefix`, and the prefix. No `apply` call, no prompt, no threshold literal.
- `split_checkpoint` is set on both the stop path and the continue path.
- The allow-list is positive: only `passed` and `skipped` reach the digest. Any other value stops the flow.
- Do not change the validation loop or the digest contents.

Open issue to surface at Gate 1 (not resolved by this task). On a rejection in Step 1a, SKILL.md says to continue to Gate 1. This hook returns before the digest on `split-proposed`, so nothing builds the digest on that path. This task keeps the outcome as skeleton-specified (no digest unless `passed` or `skipped`). The rejection-path digest must be decided separately, either by re-entering `pm-phase1` or by building the digest before the stop.

Length and scope check: about 15 minutes of work. It is one insertion, one return-key change, and one run of the verification commands. It depends on the BE-07 parser already existing.

**Verification commands:**

```
node -e "const F=Object.getPrototypeOf(async function(){}).constructor;new F(require('fs').readFileSync(process.argv[1],'utf8').replace(/^export /gm,''))" src/claude/workflows/pm-phase1.js
```

```
grep -n "check-size" src/claude/workflows/pm-phase1.js
```

```
grep -c "split_checkpoint" src/claude/workflows/pm-phase1.js
```

```
npm test
```