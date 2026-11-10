'use strict';

const fs   = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', '..', 'src', 'claude', 'agents', 'gaia-define-feature.md');
const agent = fs.readFileSync(AGENT, 'utf8');

const SKILL = path.join(__dirname, '..', '..', 'src', 'claude', 'skills', 'define-feature', 'SKILL.md');
const skill = fs.readFileSync(SKILL, 'utf8');

// Index of the first markdown heading that names the given phase, or -1.
// The \b after the phase id stops "Phase 3" from matching "Phase 3a".
const headingIndex = (phase) => {
  const m = new RegExp(`^#{1,6}\\s.*Phase ${phase}\\b`, 'm').exec(agent);
  return m ? m.index : -1;
};

const phase3a = agent.slice(headingIndex('3a'), headingIndex('4'));

// Text of numbered step `n` inside Phase 3a, up to the start of step n+1.
const stepText = (n) => {
  const start = phase3a.search(new RegExp(`^${n}\\. `, 'm'));
  if (start === -1) return '';
  const rest = phase3a.slice(start + 1);
  const endRel = rest.search(new RegExp(`^${n + 1}\\. `, 'm'));
  return endRel === -1 ? phase3a.slice(start) : phase3a.slice(start, start + 1 + endRel);
};

// Text of the step 6 branch that starts at the given status marker.
const step6 = stepText(6);
const skippedIdx    = step6.indexOf('**`"skipped"`**');
const notFlaggedIdx = step6.indexOf('**`"not-flagged"`**');
const flaggedIdx    = step6.indexOf('**`"flagged"`**');
const skippedBranch    = step6.slice(skippedIdx, notFlaggedIdx);
const notFlaggedBranch = step6.slice(notFlaggedIdx, flaggedIdx);
const flaggedBranch    = step6.slice(flaggedIdx);

describe('agent Phase 3a placement (AC-01)', () => {
  test('Phase 3 and Phase 3a headings both exist', () => {
    expect(headingIndex('3')).toBeGreaterThan(-1);
    expect(headingIndex('3a')).toBeGreaterThan(-1);
  });

  test('Phase 3a heading sits after Phase 3 and before Phase 4', () => {
    expect(headingIndex('3a')).toBeGreaterThan(headingIndex('3'));
    expect(headingIndex('3a')).toBeLessThan(headingIndex('4'));
  });
});

describe('agent check-definition invocation (AC-02, AC-03)', () => {
  test('invokes check-definition through run-asset scripts/feature-split.js', () => {
    const step3 = stepText(3);
    expect(step3).toMatch(/run-asset scripts\/feature-split\.js/);
    expect(step3).toMatch(/check-definition/);
  });

  test('passes --features-root "$featuresRoot"', () => {
    expect(stepText(3)).toMatch(/--features-root\s+"\$featuresRoot"/);
  });

  test('passes --feature-id "$PREFIX"', () => {
    expect(stepText(3)).toMatch(/--feature-id\s+"\$PREFIX"/);
  });

  test('pipes the grilling record on stdin', () => {
    expect(stepText(3)).toMatch(/stdin/i);
  });

  test('builds the grilling record in memory only', () => {
    expect(stepText(2)).toMatch(/in memory only/i);
  });
});

describe('agent features root resolution (AC-04)', () => {
  test('resolves the features root with ai-toolkit resolve-features-root in Phase 1a', () => {
    expect(agent).toMatch(/\$\(ai-toolkit resolve-features-root\)/);
  });

  test('Phase 3a uses $featuresRoot and never a literal features path', () => {
    expect(phase3a).toMatch(/\$featuresRoot/);
    expect(phase3a).not.toMatch(/(docs|internal_docs)\/features/);
    expect(phase3a).not.toMatch(/features\/FTR-\d+/);
  });

  test('the whole agent file contains no hard-coded FTR feature path', () => {
    expect(agent).not.toMatch(/features\/FTR-\d+/);
  });
});

describe('agent status branches (AC-05)', () => {
  test('defines a branch for each of skipped, not-flagged and flagged', () => {
    expect(skippedIdx).toBeGreaterThan(-1);
    expect(notFlaggedIdx).toBeGreaterThan(skippedIdx);
    expect(flaggedIdx).toBeGreaterThan(notFlaggedIdx);
  });

  test('skipped names the epic.md, Approvals and wbs markers', () => {
    expect(skippedBranch).toMatch(/epic\.md/);
    expect(skippedBranch).toMatch(/Approvals/);
    expect(skippedBranch).toMatch(/\bwbs\b/);
  });

  test('skipped stops without showing a proposal', () => {
    expect(skippedBranch).toMatch(/STOP/);
    expect(skippedBranch).toMatch(/Do not show a proposal/);
  });

  test('not-flagged continues as a standalone feature', () => {
    expect(notFlaggedBranch).toMatch(/Continuing as a standalone feature/);
  });

  test('flagged builds a CHECKPOINT: split-proposal block', () => {
    expect(flaggedBranch).toMatch(/CHECKPOINT: split-proposal/);
  });
});

describe('agent unevaluated handling (AC-05)', () => {
  test('not-flagged reports each unevaluated signal', () => {
    expect(notFlaggedBranch).toMatch(/unevaluated/);
    expect(notFlaggedBranch).toMatch(/could not be evaluated/);
  });

  test('flagged copies unevaluated into the proposal and states it cannot raise the flag', () => {
    expect(flaggedBranch).toMatch(/unevaluated/);
    expect(flaggedBranch).toMatch(/cannot raise the flag/);
  });
});

describe('agent failure paths write nothing (AC-08)', () => {
  test('RECORD_INVALID stops, reports and writes nothing before Phase 4', () => {
    const step4 = stepText(4);
    expect(step4).toMatch(/RECORD_INVALID/);
    expect(step4).toMatch(/STOP/);
    expect(step4).toMatch(/Write nothing/);
    expect(step4).toMatch(/Do not continue to Phase 4/);
  });

  test('root resolution failure stops and writes nothing', () => {
    const step1 = stepText(1);
    expect(step1).toMatch(/resolve-features-root/);
    expect(step1).toMatch(/STOP/);
    expect(step1).toMatch(/Write nothing/);
  });

  test('flagged branch writes nothing and creates no folder or ledger entry', () => {
    expect(flaggedBranch).toMatch(/Write nothing in this branch/);
    expect(flaggedBranch).toMatch(/mkdir/);
    expect(flaggedBranch).toMatch(/ledger entry/);
  });
});

// True when a line containing `anchor` has a line matching `re` within `window` lines after it.
const nearby = (text, anchor, re, window = 5) => {
  const lines = text.split('\n');
  return lines.some((line, i) =>
    line.includes(anchor) &&
    lines.slice(i, i + window + 1).some(l => re.test(l)));
};

describe('skill checkpoint relay text', () => {
  test('passes a Mode line in the spawn prompt', () => {
    expect(skill).toMatch(/\bMode:/);
  });

  test('shows the proposal children with their Summary and Keywords', () => {
    expect(skill).toMatch(/proposal\.children/);
  });

  test('shows the proposal with dependency order and shared parts', () => {
    expect(skill).toMatch(/dependency order/i);
    expect(skill).toMatch(/shared/i);
  });

  test('lists each flow with a one-line reason', () => {
    expect(nearby(skill, 'flow', /reason/i)).toBe(true);
  });

  test('shows Summary and Keywords as editable items per child', () => {
    expect(nearby(skill, 'Summary', /edit/i)).toBe(true);
    expect(nearby(skill, 'Keywords', /edit/i)).toBe(true);
  });

  test('names each unevaluated signal to the user', () => {
    expect(skill).toMatch(/unevaluated/);
  });

  test('keeps the grilling record in memory and never on disk', () => {
    expect(skill).toMatch(/in memory/i);
  });

  test('stops and reports when root resolution fails', () => {
    expect(nearby(skill, 'resolve-features-root', /stop|report/i)).toBe(true);
  });

  test('stops and reports on RECORD_INVALID', () => {
    expect(nearby(skill, 'RECORD_INVALID', /stop|report/i)).toBe(true);
  });
});
