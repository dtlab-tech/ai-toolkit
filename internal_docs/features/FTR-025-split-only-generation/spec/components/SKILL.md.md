# src/claude/skills/implement-feature/SKILL.md — Modified

## Change

Step 2's Gate 1 presentation and the Approvals.md template it writes are updated to reflect the
new default artifact set: `requirements.path`/`tech_spec.path` now point at `req/index.md`/
`spec/index.md` (per `pm-phase1.js`'s own updated return value), not a monolithic file that may not
exist. The presentation block gains a line mentioning the new `/assemble-docs` command for a
combined view. The Approvals.md row labels change to name the split index files, since that is what
was actually generated and approved.

## Component Props

````markdown
<!-- BEFORE (Step 2 — Present Gate 1) -->
Present the following to the user:

```
Documents generated for {PREFIX}:

  {PREFIX}-Requirements.md — {requirements.summary}
  {PREFIX}-Tech-Spec.md    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}
```

<!-- AFTER -->
Present the following to the user:

```
Documents generated for {PREFIX}:

  {requirements.path} — {requirements.summary}
  {tech_spec.path}    — {tech_spec.summary}
  {PREFIX}-Validation-Report.md — {validation.summary}

To view a single combined document instead of the split source files, run:
  /assemble-docs {PREFIX} [req|spec|all]
```
````

```markdown
<!-- BEFORE (Approvals.md template, Gate 1 table rows) -->
| {PREFIX}-Requirements.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Tech-Spec.md | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |

<!-- AFTER -->
| {requirements.path} | ✅ Approved | {today} | {notes or —} |
| {tech_spec.path} | ✅ Approved | {today} | {notes or —} |
| {PREFIX}-Validation-Report.md | ✅ Approved | {today} | {notes or —} |
```

`docs_digest` itself, and the `**Docs Digest:** \`{docs_digest}\`` line, are unchanged — the
digest's meaning and format are identical, only its computation moved (see
`pm-phase1.js.md`/`pm-phase2.js.md`). `pm-phase2.js`'s Gate 1 check (which only looks for the
literal `## Gate 1` heading, a `✅ Approved` marker, and a `**Docs Digest:**` line — never the
specific row labels) is unaffected by this wording change.

## Tests

No dedicated test file — `SKILL.md` is a prompt-only orchestration document with no existing test
coverage of its own (confirmed: `pm-phase2.js`'s Gate 1 regex checks, exercised in
`tests/integration/workflow-runtime.test.js`, parse only the heading/approval-marker/digest-line
pattern, never the row text) — verified manually, consistent with how this skill's Gate 1 section
was introduced originally.
