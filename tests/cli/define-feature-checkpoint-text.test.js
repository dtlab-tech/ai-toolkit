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

// Index of the first occurrence of `anchor` in `text`, or -1.
const at = (text, anchor) => text.indexOf(anchor);

// Text from the first `start` anchor up to (not including) the next `end` anchor, or to the end.
const section = (text, start, end) => {
  const s = text.indexOf(start);
  const e = text.indexOf(end, s + 1);
  return text.slice(s, e === -1 ? text.length : e);
};

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

describe('agent write mode and recovery text', () => {
  // Phase 4 runs from its own heading to the Phase 5 heading. Plain indexOf('Phase 4')
  // would match the bullet at the top of the Input modes section instead.
  const p4 = () => agent.slice(headingIndex('4'), headingIndex('5'));
  const standalone = () => section(p4(), '#### Phase 4 — standalone branch', '#### Phase 4 — split branch (checkpoint decision: accept)');
  const split = () => section(p4(), '#### Phase 4 — split branch (checkpoint decision: accept)', '#### Phase 4 — split branch (retry)');
  const edit = () => section(p4(), '**Decision `edit`**', '#### Phase 4 — standalone branch');
  const errorBlock = () => {
    const s = split().indexOf('ERROR: partial-apply');
    return split().slice(s, split().indexOf('```', s));
  };

  test('no-overwrite guard is checked before the standalone write', () => {
    const guard = at(standalone(), 'BR-04 guard');
    const write = standalone().search(/Write \{featureDir\}\/feature\.md/);
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
  });

  test('standalone register runs after feature.md is written', () => {
    const write = standalone().search(/(writes?|written)[^\n]{0,80}feature\.md/i);
    const register = at(standalone(), '**Register**');
    expect(write).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(write);
  });

  test('reject is routed to the standalone branch', () => {
    expect(agent).toMatch(/decision `reject`[\s\S]{0,300}Phase 4 — standalone branch/);
  });

  test('split parent is registered with status defined before apply --parent', () => {
    const status = at(split(), 'status defined');
    expect(status).toBeGreaterThan(-1);
    expect(at(split(), 'apply --parent')).toBeGreaterThan(status);
  });

  test('edit runs validate-proposal', () => {
    expect(edit()).toMatch(/validate-proposal/);
  });

  test('edit writes no file, folder or ledger entry', () => {
    expect(edit()).toMatch(/Write no file, create no folder, open no ledger entry/);
  });

  test('edit waits for a new explicit accept before applying', () => {
    expect(edit()).toMatch(/new explicit accept/);
  });

  test('partial failure offers retry', () => {
    expect(errorBlock()).toMatch(/options:.*\bretry\b/);
  });

  test('partial failure offers edit', () => {
    expect(errorBlock()).toMatch(/options:.*\bedit\b/);
  });

  test('partial failure offers reject', () => {
    expect(errorBlock()).toMatch(/options:.*\breject\b/);
  });

  test('partial failure names the .split-staging-* leftover', () => {
    expect(errorBlock()).toMatch(/staging_leftover:.*\.split-staging-\*/);
  });

  test('later applies are blocked while a leftover exists', () => {
    expect(split()).toMatch(/leftover[\s\S]{0,200}blocked|blocked[\s\S]{0,200}leftover/i);
  });
});
