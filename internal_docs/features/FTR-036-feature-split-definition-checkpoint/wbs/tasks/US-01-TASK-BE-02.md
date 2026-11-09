<a id="task-US-01-TASK-BE-02"></a>
### US-01-TASK-BE-02

- **Task ID:** US-01-TASK-BE-02
- **Title:** Add Phase 3a record build and check-definition invocation to the agent
- **Outcome:** gaia-define-feature.md has a Phase 3a between Phase 3 and Phase 4. It resolves the features root with ai-toolkit resolve-features-root, builds the in-memory grilling record with actors, applications and flows with reasons, and pipes it on stdin to check-definition through run-asset. It stops, reports and writes nothing when the root resolution fails or when RECORD_INVALID is returned.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-01, INFRA-TASK-BE-02
- **Acceptance criteria:** AC-05, AC-06, AC-08
- **Estimate — agent minutes:** 14
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add Phase 3a check-definition invocation to define-feature agent

**Implementation notes:**

Scope of the edit: one file, `src/claude/agents/gaia-define-feature.md`. Insert a new Phase 3a section between the end of Phase 3 (clarification) and the start of Phase 4 (write). Do not change Phases 0, 1a–1d, 2, 3 questions, 4b or the Guidelines here. The status branching (`skipped`, `not-flagged`, `flagged`) belongs to US-01-TASK-BE-03 and US-01-TASK-BE-04, and the Phase 4 changes belong to US-01-TASK-BE-01 and the later Phase 4 work, so this task only adds the record build, the invocation and the error stop.

Gaps from the excerpt that the implementer must not fill by guessing:
- The text of AC-05, AC-06 and AC-08 is not in the excerpt. Check the inserted text against those ACs when they are supplied.
- The excerpt does not say whether Phase 3a re-runs `ai-toolkit resolve-features-root` or reuses the `$featuresRoot` value captured in Phase 1a. The TEST task pins that Phase 1a "still captures featuresRoot once", so the recommended choice is reuse, with an explicit stop if the value is empty. The Phase 3a text must still name the command literal `ai-toolkit resolve-features-root` in its root-resolution step, so write it as a fail-stop check. Confirm this choice at Gate 1.
- How `applications` are elicited during grilling is an open gap. Do not invent a value: if the grilling did not produce an applications list, leave the `applications` key out of the record. `check-definition` then reports that signal under `unevaluated` (BR-02) instead of counting it as zero.

Insert this section (wording may vary, the anchors and order must not):

```text
Phase 3a — size checkpoint

1. Root: use $featuresRoot from Phase 1a. If it is empty or resolution failed
   (ai-toolkit resolve-features-root did not return a path), STOP. Report the
   error. Write nothing.

2. Build the grilling record in memory only. Never write it to disk.
   record = {
     "actors":       [ "<actor name>", ... ],          # from grilling
     "applications": [ "<application name>", ... ],    # omit the key if not elicited
     "flows":        [ { "name": "<flow>", "reason": "<one line>" }, ... ]
   }

3. Pipe the record on stdin to the read-only command:
   cat <<'JSON' | run-asset scripts/feature-split.js --project "<projectRoot>" -- \
       check-definition --features-root "$featuresRoot" --feature-id "$PREFIX"
   <record as JSON>
   JSON

4. If the exit code is non-zero, or stderr contains RECORD_INVALID:
   STOP. Report the error. Write nothing. Do not continue to Phase 4.

5. Otherwise keep the parsed result { status, signals, flows, unevaluated }
   for US-01-TASK-BE-03 (skipped / not-flagged) and US-01-TASK-BE-04 (flagged).
   Do not write feature.md here.
```

Why the record is built in memory and never written: D-03 requires the grilling record to exist only in the agent's context and the skill's context, so the record never reaches disk before the user confirms (BR-01, BR-03). Do not add a temp file for stdin.

Why the failure stop covers both cases: the Tech-Spec §6 rule is that a root-resolution failure and a `RECORD_INVALID` both stop, report and write nothing, so Phase 3a must end the run at either point.

Length guidance: the inserted section should be roughly 30–50 lines. If the existing Phase 3 heading uses a different level or wording, match the file's own heading style. Do not add a second "Phase 3a" heading elsewhere in the file.

**Verification commands:**

```
grep -n "Phase 3a" src/claude/agents/gaia-define-feature.md
```

```
grep -q "ai-toolkit resolve-features-root" src/claude/agents/gaia-define-feature.md && grep -q "check-definition" src/claude/agents/gaia-define-feature.md && grep -q -- "--feature-id" src/claude/agents/gaia-define-feature.md && grep -q "RECORD_INVALID" src/claude/agents/gaia-define-feature.md
```

```
node -e "const t=require('fs').readFileSync('src/claude/agents/gaia-define-feature.md','utf8');const a=t.indexOf('Phase 3a');const c=t.indexOf('Phase 4');const b=t.lastIndexOf('Phase 3',a);if(a<0||b<0||c<0||!(b<a&&a<c))process.exit(1)"
```

```
npm test
```