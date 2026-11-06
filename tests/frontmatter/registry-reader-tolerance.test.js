'use strict';

/**
 * Registry reader tolerance — instruction-text checks for the Requirements and
 * Tech-Spec generator agents (US-06-TASK-TEST-01, FTR-035, AC-43..AC-46).
 *
 * The agents' registry reading is LLM behaviour and cannot be executed here.
 * This suite checks only that each generator's instruction text states the
 * reader rules the feature requires. Each (generator, rule) pair is one test.
 */

const fs   = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'src', 'claude', 'agents');

const GENERATORS = [
  'gaia-generate-requirements.md',
  'gaia-generate-tech-spec.md',
];

// Each rule: [id, description, pattern the instruction text must match].
// Patterns are matched per line so a rule must be stated on one line.
const RULES = [
  {
    id: 'standalone',
    description: 'an entry with neither Parent: nor Depends on: is standalone (AC-43)',
    pattern: /(neither|lacks both)\s+`?Parent:`?\s+(nor|and)\s+`?Depends on:`?[^\n]*standalone|(neither|lacks both)\s+`?Parent:`?\s+(nor|and)\s+`?Depends on:`?/i,
  },
  {
    id: 'epic-status',
    description: 'Status: epic is recognised as a parent record (AC-44)',
    pattern: /`Status: epic`[^\n]*parent record/i,
  },
  {
    id: 'epic-md',
    description: 'epic.md is recognised as the parent record (AC-45)',
    pattern: /epic\.md/i,
  },
  {
    id: 'depends-none',
    description: 'Depends on: none means no sibling dependency (AC-43)',
    pattern: /`(Depends on: )?none`[^\n]*no sibling dependenc/i,
  },
  {
    id: 'unknown-status',
    description: 'a status other than defined, completed or epic is skipped (AC-46)',
    pattern: /(other than `defined`, `completed` or `epic`|any other `Status` value)[^\n]*untouched/i,
  },
  {
    id: 'detail-ignored',
    description: 'the Detail line is ignored',
    pattern: /`\*{0,2}Detail:?\*{0,2}`?[^\n]*ignored/i,
  },
];

function readAgent(file) {
  return fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
}

describe('Registry reader tolerance in generator agents', () => {
  for (const file of GENERATORS) {
    describe(file, () => {
      let text;

      beforeAll(() => {
        text = readAgent(file);
      });

      for (const rule of RULES) {
        test(`states rule [${rule.id}]: ${rule.description}`, () => {
          expect(text).toMatch(rule.pattern);
        });
      }
    });
  }
});
