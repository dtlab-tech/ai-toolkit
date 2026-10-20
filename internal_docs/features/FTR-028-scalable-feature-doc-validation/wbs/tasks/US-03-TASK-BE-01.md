<a id="task-US-03-TASK-BE-01"></a>
### US-03-TASK-BE-01

- **Task ID:** US-03-TASK-BE-01
- **Title:** Register the new component-detail drill-down agent and extend the validator's schema
- **Outcome:** lib/agent-registry.js gains the gaia.agent.planner.validate-tech-spec-component-detail entry; a new src/claude/agents/gaia-validate-tech-spec-component-detail.md defines the narrow drill-down agent; gaia-validate-feature-docs.md's Phase 3/schema/Phase 7 gain needsComponentDetail with guidance on when to use it; pm-phase1.js's main validator worker schema literal gains the matching needsComponentDetail field
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** —
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 22
- **Estimate — tokens:** 28000
- **Output count:** 3
- **Grouping rationale:** Registration (registry entry), the new agent's own definition, and the schema contract both sides of a dispatch must agree on are one coupled unit — landing any subset alone would leave an unresolvable agent ID or a schema mismatch.
- **Commit type:** feat
- **Commit scope:** agent-registry, pm-phase1
- **Commit subject:** register the new component-detail drill-down agent and extend the validator's schema

**Implementation notes:**

1. **`lib/agent-registry.js`** — insert immediately after the existing
   `gaia.agent.planner.validate-work-breakdown` entry (currently `lib/agent-registry.js:249-261`),
   per `spec/components/agent-registry.js.md`:

   ```js
   {
     agentId:               'gaia.agent.planner.validate-tech-spec-component-detail',
     nativeNames:           { claude: 'gaia-validate-tech-spec-component-detail' },
     relativeInstallPath:   '.claude/agents/gaia-validate-tech-spec-component-detail.md',
     role:                  'planner',
     type:                  'validation',
     authorisedPhases:      ['planning'],
     allowedPipelines:      ['implement-feature'],
     minimumToolkitVersion: '0.13.0',
     deprecated:            false,
     deprecationTarget:     null,
     platforms:             ['claude'],
   },
   ```

2. **New file `src/claude/agents/gaia-validate-tech-spec-component-detail.md`** — full content per
   `spec/components/gaia-validate-tech-spec-component-detail.md.md`'s Algorithm section (frontmatter
   `model: haiku`, `tools: Read, Glob, Grep`; Phase 1 load batch, Phase 2 verify each claim, Phase 3
   structured `{"findings": [...]}` completion; explicit instruction to Read ONLY the named files).

3. **`src/claude/agents/gaia-validate-feature-docs.md`** — two edits per
   `spec/components/gaia-validate-feature-docs.md.md`'s "Edit 2"/"Edit 3":
   - Phase 3's Tech-Spec coverage-check table gains the `needsComponentDetail` escape-hatch row and
     the "when to use `needsComponentDetail` vs a normal finding" guidance paragraph; the
     AC↔component traceability bullet language is clarified as the host's own responsibility
     (US-02 already removed the free-prose Implementation-Order bullet — do not reintroduce it).
   - Schema/Phase 7 gains the `needsComponentDetail` field (array of `{claim, fileSlug}`) and its
     own bullet explaining the contract, exactly as shown in that component's Algorithm section.

4. **`src/claude/workflows/pm-phase1.js`** — extend the main validator's worker call schema
   (the literal object built in US-01-TASK-BE-01, left otherwise unchanged) to add:

   ```js
   needsComponentDetail: { type: 'array', items: { type: 'object',
     properties: { claim: { type: 'string' }, fileSlug: { type: 'string' } },
     required: ['claim', 'fileSlug'] } },
   ```

   to `properties` ONLY — do NOT add `'needsComponentDetail'` to the schema's top-level `required`
   array. Every pre-existing mocked test response for `gaia-validate-feature-docs`, across the
   whole suite, predates this feature and omits the field entirely; making it hard-required would
   break every one of them (`validateSchema` throws on any missing `required` key) for no real
   gain — US-03-TASK-BE-02's own `prepareDrillDownBatches` already treats an absent/undefined value
   as "no entries" via `needsComponentDetail || []`. Also append `needsComponentDetail (claims
   needing a component's own design body to verify — see your own instructions for when to use this
   instead of a finding)` to the prompt's own instruction sentence listing what fields to return —
   the AGENT is still instructed (by prose, not schema enforcement) to always include it. This task
   does NOT yet add any code that READS `result.needsComponentDetail` — that is US-03-TASK-BE-02's
   responsibility.

**Verification commands:**

```
npm test -- tests/frontmatter/agents.test.js
```
