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
    pattern: /(neither|lacks both)\s+`?Parent:`?\s+(nor|and)\s+`?Depends on:`?[^\n]*standalone/i,
  },
  {
    id: 'epic-status',
    description: 'Status: epic is recognised as a parent record (AC-44)',
    pattern: /`Status: epic`[^\n]*parent record/i,
  },
  {
    id: 'epic-md',
    description: 'a feature folder that holds epic.md is recognised as the parent record (AC-45)',
    pattern: /folder (holds|contains) `epic\.md`[^\n]*parent record/i,
  },
  {
    id: 'epic-without-epic-md',
    description: 'Status: epic without an epic.md is an error and generation stops (Gate 1 gap 13)',
    pattern: /error[^\n]*epic\.md[^\n]*not found|holds no `epic\.md`[^\n]*error/i,
  },
  {
    id: 'unreadable-registry',
    description: 'a registry that exists but cannot be read is an error and generation stops (Gate 1 gap 13)',
    pattern: /cannot be read[^\n]*error|error[^\n]*cannot be read/i,
  },
  {
    id: 'parent-without-depends-on',
    description: 'a Parent: line without Depends on: is a child with no recorded dependencies (Gate 1 gap 13)',
    pattern: /`Parent:` line without a `Depends on:` line is a child with no recorded dependencies/i,
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
    test(`${file} derives the registry path from the features root, never from a hard-coded docs/features path (BR-14)`, () => {
      const text = readAgent(file);
      expect(text).not.toMatch(/docs\/features\/REGISTRY\.md/);
      expect(text).toMatch(/features root/i);
    });
  }

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
