export const meta = {
  name: 'am-phase2',
  description: 'Assessment pipeline phase 2: write Approvals file → update Assessment Registry → return summary. Runs after Findings Gate is completed in the main loop.',
  phases: [
    { title: 'Approvals', detail: 'Write {PREFIX}-Approvals.md with gate acknowledgement and flagged interventions' },
    { title: 'Registry',  detail: 'Append row to docs/assessments/registry.md' },
    { title: 'Summary',   detail: 'Build and return run summary' },
  ],
}

// args: "--prefix ASSESS-NNN --output-dir <path> --flagged INT-001,INT-003 --ack \"text\""
const argStr = typeof args === 'string' ? args : ''

const prefixMatch    = argStr.match(/--prefix\s+(\S+)/)
const outputDirMatch = argStr.match(/--output-dir\s+(\S+)/)
const flaggedMatch   = argStr.match(/--flagged\s+([^\s"]+)/)
const ackMatch       = argStr.match(/--ack\s+"([^"]*)"/)

const prefix    = prefixMatch    ? prefixMatch[1]    : 'ASSESS-001'
const outputDir = outputDirMatch ? outputDirMatch[1] : `docs/assessments/${prefix}`
const flaggedRaw = flaggedMatch  ? flaggedMatch[1]   : 'none'
const ackText    = ackMatch      ? ackMatch[1]        : 'Acknowledged'

const flaggedIds = flaggedRaw.toLowerCase() === 'none'
  ? []
  : flaggedRaw.split(',').map(s => s.trim().toUpperCase())

// ── Approvals ─────────────────────────────────────────────────────────────────
phase('Approvals')

const APPROVALS_SCHEMA = {
  type: 'object',
  properties: {
    approvals_path: { type: 'string' },
    written:        { type: 'boolean' },
  },
  required: ['approvals_path', 'written'],
}

log(`Writing Approvals file for ${prefix} — flagged: ${flaggedIds.join(', ') || 'none'}`)

const approvalsResult = await agent(
  `Write the Approvals file for assessment ${prefix}.

Output path: ${outputDir}/${prefix}-Approvals.md

Read the Interventions Index at: ${outputDir}/${prefix}-Interventions-Index.md
Extract all INT-NNN identifiers and their titles.

Flagged interventions (to mark as Yes): ${flaggedIds.join(', ') || 'none'}
Acknowledgement text: "${ackText}"
Today's date: use the current date in YYYY-MM-DD format.

Write the file with this exact structure:

# Assessment Approvals — ${prefix}

## Findings Gate Acknowledgement

| Field | Value |
|-------|-------|
| Acknowledged by | Toolkit user |
| Date | {today} |
| Acknowledgement | ${ackText} |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
{one row per intervention: | INT-NNN — {title} | Yes/No | {today} | — or "Not selected" |}

Rules:
- Mark "Yes" for interventions whose ID is in: ${flaggedIds.join(', ') || '(none)'}
- Mark "No" for all others, Notes = "Not selected"
- "Flagged" column values must be exactly "Yes" or "No" (case-sensitive)

After writing, verify the file exists and is non-empty.
Return { "approvals_path": "<full path>", "written": true }.`,
  {
    label:  'write-approvals',
    phase:  'Approvals',
    schema: APPROVALS_SCHEMA,
  }
)

log(`Approvals written: ${approvalsResult.approvals_path}`)

// ── Registry ──────────────────────────────────────────────────────────────────
phase('Registry')

const REGISTRY_SCHEMA = {
  type: 'object',
  properties: {
    registry_result: { type: 'string' },
  },
  required: ['registry_result'],
}

log(`Updating Assessment Registry`)

const registryResult = await agent(
  `Update the Assessment Registry at: docs/assessments/registry.md

Prefix: ${prefix}
Output directory: ${outputDir}

STEP 1 — Read severity counts from ${outputDir}/${prefix}-Interventions-Index.md.
Count rows by Criticality column: CRITICAL, HIGH, MEDIUM, LOW, compute total.

STEP 2 — Count flagged interventions from ${outputDir}/${prefix}-Approvals.md.
Find the "## Interventions Flagged for Feature Delivery" section.
Count rows where the Flagged column value is exactly "Yes" (case-sensitive).

STEP 3 — Build the registry row:
| {today-YYYY-MM-DD} | [${prefix}](${prefix}/) | {total} | {CRITICAL} | {HIGH} | {MEDIUM} | {LOW} | {flagged_count} |

STEP 4 — Write to docs/assessments/registry.md:
- If the file does not exist: create it with header + the new row:
  # Assessment Registry
  | Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
  |------|--------|-------|----------|------|--------|-----|---------|
  {row}
- If the file exists: read it, strip trailing whitespace, append the new row, write back.

STEP 5 — Verify the file is readable after writing.

Return { "registry_result": "docs/assessments/registry.md [created]" }
  or    { "registry_result": "docs/assessments/registry.md [updated — row N appended]" }
  or    { "registry_result": "docs/assessments/registry.md [ERROR — {reason}]" }`,
  {
    label:  'update-registry',
    phase:  'Registry',
    schema: REGISTRY_SCHEMA,
  }
)

log(`Registry: ${registryResult.registry_result}`)

// ── Summary ───────────────────────────────────────────────────────────────────
phase('Summary')

const summaryText = [
  `Assessment Manager — Run Summary`,
  `─────────────────────────────────────────────────────`,
  `Target: ${argStr.split('--')[0].trim() || '.'}  |  Prefix: ${prefix}`,
  `─────────────────────────────────────────────────────`,
  `Approvals:           ${approvalsResult.approvals_path}`,
  `Registry:            ${registryResult.registry_result}`,
  `Effort Estimate:     ${outputDir}/${prefix}-Effort-Estimate.md`,
  `Token Estimate:      ${outputDir}/${prefix}-Token-Estimate.md`,
  `Process log:         ${outputDir}/${prefix}-process-log.txt`,
  `─────────────────────────────────────────────────────`,
  `Flagged interventions (${flaggedIds.length}): ${flaggedIds.join(', ') || 'none'}`,
  `Flagged interventions can be actioned via /define-feature`,
  `referencing the INT-NNN document.`,
  `─────────────────────────────────────────────────────`,
].join('\n')

log('am-phase2 complete')

return {
  approvals_path:   approvalsResult.approvals_path,
  registry_updated: registryResult.registry_result,
  flagged_count:    flaggedIds.length,
  summary:          summaryText,
}
