<a id="task-US-01-TASK-INFRA-01"></a>
### US-01-TASK-INFRA-01

- **Task ID:** US-01-TASK-INFRA-01
- **Title:** Update gaia-validate-feature-docs for the inlined-prompt contract
- **Outcome:** gaia-validate-feature-docs.md's Phase 1 is rewritten: the agent is told Requirements/Tech-Spec text is supplied inlined in its prompt under 'Requirements:'/'Tech-Spec:' labels, and explicitly instructed not to attempt to locate or Read {PREFIX}-Requirements.md/{PREFIX}-Tech-Spec.md on disk; the missing-input failure wording changes from 'input document is missing' to 'inlined document's text is empty or missing', same valid:false outcome; Phase 3's subsection headings are softened to 'against the inlined Requirements/Tech-Spec text'
- **Domain:** INFRA
- **Agent type:** developer-backend
- **Dependencies:** US-01-TASK-BE-02
- **Acceptance criteria:** AC-03
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 16000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** update gaia-validate-feature-docs for the inlined Requirements/Tech-Spec prompt contract

**Implementation notes:**

Depends on US-01-TASK-BE-02 because this agent's input contract must match exactly what
`pm-phase1.js` now sends — the prompt format (`Requirements:`/`Tech-Spec:` labels) must be decided
there first. Rewrite Phase 1 — Load Documents: step 2 becomes "Read `feature.md` fully — its path
is given to you first", a new step explains the inlined `Requirements:`/`Tech-Spec:` text and bans
attempting to locate the monolithic files on disk ("they are not guaranteed to exist... generated
and stored in a split, per-item format by default"), and the failure-mode step changes from
"If an input document is missing" to "If either inlined document's text is empty or missing" —
same `valid: false` / skip-checks-requiring-it outcome. Soften Phase 3's two subsection headings
("### Requirements coverage (against `{PREFIX}-Requirements.md`)" → "against the inlined
Requirements text"; same for Tech-Spec). The `tools: Read, Glob, Grep` grant and Phase 6's
persisted-report row labels are unchanged (the agent still freely explores the codebase for other
context; the Validation-Report's own document-naming convention is unaffected).

**Verification commands:**

```
npx jest --testPathPattern=tests/frontmatter/agents.test.js
```
