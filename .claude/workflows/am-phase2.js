/**
 * am-phase2.js — Assessment Pipeline: Post-Gate Phase
 *
 * Workflow phase 2 of the codebase assessment pipeline.
 * Runs after the Findings Gate is completed in the skill's main loop.
 * Writes Approvals file, updates Assessment Registry, writes Assessment Summary.
 *
 * Inputs (from skill prompt):
 *   --prefix ASSESS-NNN
 *   --output-dir <path>
 *   --flagged <INT-NNN,...>  (comma-separated, or "none")
 *   --ack "<acknowledgement text>"
 *
 * Outputs (files written):
 *   {output_dir}/{PREFIX}-Approvals.md
 *   docs/assessments/registry.md (appended or created)
 *   {output_dir}/{PREFIX}-process-log.txt (appended)
 *
 * Returns (to skill):
 *   { approvals_path, registry_updated, summary }
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function appendLog(logPath, message) {
  const line = `[${now()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function fileExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(prompt) {
  const args = { prefix: null, output_dir: null, flagged: [], ack: '' };

  const prefixMatch  = prompt.match(/--prefix\s+(\S+)/);
  const outputMatch  = prompt.match(/--output-dir\s+(\S+)/);
  const flaggedMatch = prompt.match(/--flagged\s+([^\s"]+)/);
  const ackMatch     = prompt.match(/--ack\s+"([^"]+)"/);

  if (prefixMatch)  args.prefix     = prefixMatch[1];
  if (outputMatch)  args.output_dir = outputMatch[1];
  if (flaggedMatch) {
    const raw = flaggedMatch[1].trim().toLowerCase();
    args.flagged = raw === 'none' ? [] : raw.split(',').map(s => s.trim().toUpperCase());
  }
  if (ackMatch)     args.ack = ackMatch[1];

  return args;
}

// ── Read Interventions Index for all INT-NNN IDs and titles ───────────────────

function readInterventions(indexPath) {
  const content = readFileSafe(indexPath);
  if (!content) return [];
  const interventions = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols[0] && cols[0].match(/^INT-\d+$/)) {
      interventions.push({ id: cols[0], title: cols[1] || '' });
    }
  }
  return interventions;
}

// ── Extract severity counts for registry row ──────────────────────────────────

function extractSeverityCounts(indexPath) {
  const counts  = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const content = readFileSafe(indexPath);
  if (!content) return counts;
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('Criticality')) continue;
    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
      if (line.includes(sev)) counts[sev]++;
    }
  }
  return counts;
}

// ── Write Approvals file ──────────────────────────────────────────────────────

function buildApprovals(prefix, interventions, flaggedIds, ackText) {
  const rows = interventions.map(int => {
    const flagged = flaggedIds.includes(int.id) ? 'Yes' : 'No';
    const notes   = flagged === 'Yes' ? '—' : 'Not selected';
    return `| ${int.id} — ${int.title} | ${flagged} | ${today()} | ${notes} |`;
  }).join('\n');

  return `# Assessment Approvals — ${prefix}

## Findings Gate Acknowledgement

| Field | Value |
|-------|-------|
| Acknowledged by | Toolkit user |
| Date | ${today()} |
| Acknowledgement | ${ackText} |

## Interventions Flagged for Feature Delivery

| Intervention | Flagged | Date | Notes |
|---|---|---|---|
${rows}
`;
}

// ── Append to Assessment Registry ────────────────────────────────────────────

function updateRegistry(registryPath, prefix, severityCounts, flaggedCount) {
  const total = Object.values(severityCounts).reduce((s, v) => s + v, 0);
  const row   = `| ${today()} | [${prefix}](${prefix}/) | ${total} | ${severityCounts.CRITICAL} | ${severityCounts.HIGH} | ${severityCounts.MEDIUM} | ${severityCounts.LOW} | ${flaggedCount} |`;

  if (!fileExists(registryPath)) {
    // First run — create with header
    const content = `# Assessment Registry

| Date | Prefix | Total | CRITICAL | HIGH | MEDIUM | LOW | Flagged |
|------|--------|-------|----------|------|--------|-----|---------|
${row}
`;
    ensureDir(path.dirname(registryPath));
    fs.writeFileSync(registryPath, content, 'utf8');
    return { action: 'created', row };
  } else {
    // Append row
    let content = fs.readFileSync(registryPath, 'utf8').trimEnd();
    content += '\n' + row + '\n';
    fs.writeFileSync(registryPath, content, 'utf8');
    // Count data rows for position report
    const dataRows = content.split('\n')
      .filter(l => l.startsWith('|') && !l.includes('Date') && !l.includes('---') && l.trim() !== '|')
      .length;
    return { action: 'updated', row_position: dataRows, row };
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(promptArgs) {
  const args = parseArgs(promptArgs);

  if (!args.prefix || !args.output_dir) {
    return { error: 'am-phase2 requires --prefix and --output-dir' };
  }

  const prefix     = args.prefix;
  const outputDir  = args.output_dir;
  const logPath    = path.join(outputDir, `${prefix}-process-log.txt`);
  const indexPath  = path.join(outputDir, `${prefix}-Interventions-Index.md`);
  const approvPath = path.join(outputDir, `${prefix}-Approvals.md`);
  const regPath    = path.join('docs', 'assessments', 'registry.md');

  appendLog(logPath, `am-phase2 START — prefix: ${prefix}`);
  appendLog(logPath, `Phase 6 start: registry write`);

  // ── Read all interventions from index ────────────────────────────────────
  const interventions    = readInterventions(indexPath);
  const severityCounts   = extractSeverityCounts(indexPath);
  const validIds         = new Set(interventions.map(i => i.id));
  const flaggedIds       = args.flagged.filter(id => validIds.has(id));
  const unknownIds       = args.flagged.filter(id => !validIds.has(id));

  if (unknownIds.length > 0) {
    appendLog(logPath, `WARNING: Unknown intervention IDs ignored: ${unknownIds.join(', ')}`);
  }

  appendLog(logPath, `Interventions: ${interventions.length} total, ${flaggedIds.length} flagged`);

  // ── Write Approvals file ─────────────────────────────────────────────────
  const approvContent = buildApprovals(prefix, interventions, flaggedIds, args.ack);
  fs.writeFileSync(approvPath, approvContent, 'utf8');
  appendLog(logPath, `Written: ${prefix}-Approvals.md`);

  // Verify
  if (!fileExists(approvPath)) {
    appendLog(logPath, `ERROR: Approvals file not readable after write`);
    return { error: `Approvals file write failed: ${approvPath}` };
  }

  // ── Update Assessment Registry ────────────────────────────────────────────
  let registrySummary = 'error';
  try {
    // Prerequisite: Approvals.md must exist
    if (!fileExists(approvPath)) {
      appendLog(logPath, `ERROR: Cannot write registry — ${prefix}-Approvals.md not found`);
      registrySummary = `${regPath} [ERROR — Approvals file not found]`;
    } else {
      const regResult = updateRegistry(regPath, prefix, severityCounts, flaggedIds.length);
      if (regResult.action === 'created') {
        appendLog(logPath, `Phase 6: created registry.md with first row`);
        appendLog(logPath, `  Location: ${regPath}`);
        appendLog(logPath, `  Row: ${regResult.row}`);
        registrySummary = `${regPath} [created]`;
      } else {
        appendLog(logPath, `Phase 6: appended row to registry.md`);
        appendLog(logPath, `  Location: ${regPath}`);
        appendLog(logPath, `  Row: ${regResult.row}`);
        registrySummary = `${regPath} [updated — row ${regResult.row_position} appended]`;
      }
    }
  } catch (err) {
    appendLog(logPath, `ERROR: Registry write failed — ${err.message}`);
    registrySummary = `${regPath} [ERROR — ${err.message}]`;
  }

  appendLog(logPath, `Phase 6 end: registry write complete`);

  // ── Build summary ─────────────────────────────────────────────────────────
  const total = Object.values(severityCounts).reduce((s, v) => s + v, 0);
  const summaryText = [
    `Assessment Manager — Run Summary`,
    `─────────────────────────────────────────────────────`,
    `Target: (see process log)  |  Prefix: ${prefix}`,
    `─────────────────────────────────────────────────────`,
    `Findings:      ${severityCounts.CRITICAL} CRITICAL | ${severityCounts.HIGH} HIGH | ${severityCounts.MEDIUM} MEDIUM | ${severityCounts.LOW} LOW`,
    `Interventions: ${total} proposed | ${flaggedIds.length} flagged for feature delivery`,
    `─────────────────────────────────────────────────────`,
    `Approvals:           ${approvPath}`,
    `Registry:            ${registrySummary}`,
    `Process log:         ${logPath}`,
    `─────────────────────────────────────────────────────`,
    `Flagged interventions can be actioned via /define-feature`,
    `referencing the INT-NNN document.`,
    `─────────────────────────────────────────────────────`,
  ].join('\n');

  appendLog(logPath, `am-phase2 COMPLETE`);
  appendLog(logPath, `RUN COMPLETE`);
  appendLog(logPath, `════════════════════════════════════════════════════════`);

  return {
    approvals_path:    approvPath,
    registry_updated:  registrySummary,
    flagged_count:     flaggedIds.length,
    total_interventions: total,
    summary:           summaryText,
  };
}

module.exports = { main };
