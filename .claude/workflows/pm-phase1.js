/**
 * pm-phase1.js — Feature Delivery: Documentation Phase
 *
 * Workflow phase 1 of the feature delivery pipeline.
 * Runs: discovery → generate-requirements → generate-tech-spec →
 *       validate-feature-docs (revision loop, max 3×) → effort-estimate stub.
 *
 * Returns gate1_payload to the invoking skill so it can present Gate 1
 * to the user in the main loop.
 *
 * Inputs (from skill prompt):
 *   <path-to-feature.md>
 *
 * Outputs (files written):
 *   {PREFIX}-Requirements.md
 *   {PREFIX}-Tech-Spec.md
 *   {PREFIX}-Validation-Report.md
 *   {PREFIX}-Effort-Estimate.md  (stub — updated by pm-phase2)
 *   {PREFIX}-process-log.txt     (appended)
 *
 * Returns (to skill):
 *   gate1_payload — summary data for Gate 1 presentation
 */

const fs   = require('fs');
const path = require('path');

// ── helpers ───────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function extractPrefix(featurePath) {
  const dir  = path.dirname(featurePath);
  const name = path.basename(dir);
  const m    = name.match(/^([A-Z]+-[0-9]+)/);
  if (!m) throw new Error(`Cannot extract prefix from directory name: ${name}`);
  return m[1];
}

function featureDir(featurePath) {
  return path.dirname(featurePath);
}

function appendLog(logPath, message) {
  const line = `[${now()}] ${message}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}

function fileExists(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

function isStale(outputPath, featurePath) {
  if (!fileExists(outputPath)) return true;
  const outMtime  = fs.statSync(outputPath).mtimeMs;
  const featMtime = fs.statSync(featurePath).mtimeMs;
  return outMtime < featMtime;
}

function countLines(filePath) {
  if (!fileExists(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split('\n').length;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(args) {
  const featurePath = args.trim();
  if (!fileExists(featurePath)) {
    return { error: `feature.md not found: ${featurePath}` };
  }

  const prefix  = extractPrefix(featurePath);
  const dir     = featureDir(featurePath);
  const logPath = path.join(dir, `${prefix}-process-log.txt`);

  appendLog(logPath, `pm-phase1 START — prefix: ${prefix}`);

  // ── State map ──────────────────────────────────────────────────────────────
  const reqPath      = path.join(dir, `${prefix}-Requirements.md`);
  const specPath     = path.join(dir, `${prefix}-Tech-Spec.md`);
  const valPath      = path.join(dir, `${prefix}-Validation-Report.md`);
  const effortPath   = path.join(dir, `${prefix}-Effort-Estimate.md`);

  const needsReq  = isStale(reqPath,  featurePath);
  const needsSpec = isStale(specPath, featurePath);

  appendLog(logPath, `State: Requirements(${needsReq ? 'stale' : 'fresh'}) Tech-Spec(${needsSpec ? 'stale' : 'fresh'})`);

  const tokenLedger = [];

  // ── generate-requirements ─────────────────────────────────────────────────
  if (needsReq) {
    appendLog(logPath, `Agent START: generate-requirements (${prefix})`);
    const t0 = Date.now();
    const result = await workflow.agent({
      agentType: 'generate-requirements',
      prompt:    featurePath,
    });
    const dur = Date.now() - t0;
    const tokens = result.usage
      ? result.usage.input_tokens + result.usage.output_tokens
      : 'N/A';
    appendLog(logPath, `Agent DONE:  generate-requirements (${prefix}) — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
    tokenLedger.push({
      agent: 'generate-requirements',
      model: 'haiku',
      actual_tokens: tokens,
      duration_ms: dur,
    });
    if (!fileExists(reqPath)) {
      appendLog(logPath, `ERROR: generate-requirements produced no output`);
      return { error: 'generate-requirements produced no output', logPath };
    }
  }

  // ── generate-tech-spec ────────────────────────────────────────────────────
  if (needsSpec) {
    appendLog(logPath, `Agent START: generate-tech-spec (${prefix})`);
    const t0 = Date.now();
    const result = await workflow.agent({
      agentType: 'generate-tech-spec',
      prompt:    featurePath,
    });
    const dur = Date.now() - t0;
    const tokens = result.usage
      ? result.usage.input_tokens + result.usage.output_tokens
      : 'N/A';
    appendLog(logPath, `Agent DONE:  generate-tech-spec (${prefix}) — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
    tokenLedger.push({
      agent: 'generate-tech-spec',
      model: 'haiku',
      actual_tokens: tokens,
      duration_ms: dur,
    });
    if (!fileExists(specPath)) {
      appendLog(logPath, `ERROR: generate-tech-spec produced no output`);
      return { error: 'generate-tech-spec produced no output', logPath };
    }
  }

  // ── validate-feature-docs (revision loop, max 3 cycles) ──────────────────
  let validationClean = false;
  let validationGaps  = [];
  const MAX_CYCLES    = 3;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    appendLog(logPath, `Agent START: validate-feature-docs (${prefix}) — cycle ${cycle}`);
    const t0 = Date.now();
    const result = await workflow.agent({
      agentType: 'validate-feature-docs',
      prompt:    featurePath,
    });
    const dur = Date.now() - t0;
    const tokens = result.usage
      ? result.usage.input_tokens + result.usage.output_tokens
      : 'N/A';
    appendLog(logPath, `Agent DONE:  validate-feature-docs (${prefix}) cycle ${cycle} — tokens: ${tokens}, duration: ${Math.round(dur / 1000)}s`);
    tokenLedger.push({
      agent: `validate-feature-docs (cycle ${cycle})`,
      model: 'haiku',
      actual_tokens: tokens,
      duration_ms: dur,
    });

    // Read the validation report to check for gaps
    if (fileExists(valPath)) {
      const report = fs.readFileSync(valPath, 'utf8');
      const hasGaps = report.includes('MISSING:') || report.includes('gaps found');
      const gapCount = (report.match(/MISSING:/g) || []).length;
      if (gapCount === 0) {
        validationClean = true;
        appendLog(logPath, `validate-feature-docs: full coverage achieved on cycle ${cycle}`);
        break;
      } else {
        validationGaps = extractGaps(report);
        appendLog(logPath, `validate-feature-docs: ${gapCount} gap(s) remain after cycle ${cycle}`);
        if (cycle < MAX_CYCLES) {
          // Re-run failing doc agents
          if (report.includes('Requirements') && report.includes('MISSING:')) {
            appendLog(logPath, `Agent START: generate-requirements (${prefix}) — revision cycle ${cycle}`);
            await workflow.agent({ agentType: 'generate-requirements', prompt: featurePath });
          }
          if (report.includes('Tech-Spec') && report.includes('MISSING:')) {
            appendLog(logPath, `Agent START: generate-tech-spec (${prefix}) — revision cycle ${cycle}`);
            await workflow.agent({ agentType: 'generate-tech-spec', prompt: featurePath });
          }
        }
      }
    } else {
      appendLog(logPath, `WARNING: validate-feature-docs produced no output file on cycle ${cycle}`);
    }
  }

  if (!validationClean) {
    appendLog(logPath, `WARNING: validation not fully clean after ${MAX_CYCLES} cycles — ${validationGaps.length} gap(s) remain`);
  }

  // ── Write Effort-Estimate stub ─────────────────────────────────────────────
  if (!fileExists(effortPath)) {
    fs.writeFileSync(effortPath,
      `# Effort Estimate — ${prefix} — (Work Breakdown pending)\n\n` +
      `> This stub is written by pm-phase1. Full estimates are written by pm-phase2 after Work Breakdown generation.\n`,
      'utf8'
    );
    appendLog(logPath, `Written: ${prefix}-Effort-Estimate.md (stub)`);
  }

  // ── Build gate1_payload ────────────────────────────────────────────────────
  const reqLines  = countLines(reqPath);
  const specLines = countLines(specPath);
  const valLines  = countLines(valPath);

  const gate1Payload = {
    prefix,
    feature_dir:  dir,
    requirements: {
      path:       reqPath,
      line_count: reqLines,
      summary:    `${reqPath} — ${reqLines} lines`,
    },
    tech_spec: {
      path:       specPath,
      line_count: specLines,
      summary:    `${specPath} — ${specLines} lines`,
    },
    validation: {
      path:         valPath,
      clean:        validationClean,
      gaps_remaining: validationGaps.length,
      summary:      validationClean
        ? `${valPath} — 0 gaps`
        : `${valPath} — ${validationGaps.length} gap(s) remain`,
    },
    token_ledger:  tokenLedger,
    errors:        [],
  };

  appendLog(logPath, `pm-phase1 COMPLETE — gate1_payload ready`);
  return gate1Payload;
}

function extractGaps(reportText) {
  const lines = reportText.split('\n');
  return lines
    .filter(l => l.includes('MISSING:'))
    .map(l => l.trim());
}

// Entry point — the workflow runtime calls main(prompt)
module.exports = { main };
