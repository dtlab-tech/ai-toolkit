'use strict';

// A verification command block may carry a language tag (```bash) and the section marker may be written
// "**Verification commands**:". Before, either variant made a task silently lose every command in the
// assembler and in the executor's plan parser, while pm-phase2's resume check called the file valid.

const { parseMarkdown } = require('../../lib/task-executor/plan');
const { parseTaskDetailBlock } = require('../../src/claude/scripts/wbs-assembler');
const { checkTaskDetailShape } = require('../../src/claude/scripts/wb-graph-checks');

const FIELDS = (id) => [
  `- **Task ID:** ${id}`, '- **Title:** T', '- **Outcome:** O', '- **Domain:** BE', '- **Agent type:** developer-backend',
  '- **Dependencies:** —', '- **Acceptance criteria:** —', '- **Estimate — agent minutes:** 8', '- **Estimate — tokens:** 100',
  '- **Output count:** 1', '- **Grouping rationale:** —', '- **Commit type:** feat', '- **Commit scope:** —', '- **Commit subject:** s',
].join('\n');

const detail = (marker, blocks) => `### T-1\n\n${FIELDS('T-1')}\n\n${marker}\n\n${blocks}\n`;
const bare = (c) => '```\n' + c + '\n```';
const tagged = (c, tag = 'bash') => '```' + tag + '\n' + c + '\n```';

describe('wbs-assembler parseTaskDetailBlock', () => {
  test.each([
    ['a bare fence', '**Verification commands:**', bare('test -f a.js'), ['test -f a.js']],
    ['a language-tagged fence', '**Verification commands:**', tagged('test -f a.js'), ['test -f a.js']],
    ['sh and powershell tags', '**Verification commands:**', tagged('test -f a.js', 'sh') + '\n\n' + tagged('Test-Path b.js', 'powershell'), ['test -f a.js', 'Test-Path b.js']],
    ['the marker with the colon outside the bold', '**Verification commands**:', bare('test -f a.js'), ['test -f a.js']],
    ['both at once', '**Verification commands**:', tagged('test -f a.js'), ['test -f a.js']],
  ])('%s', (_n, marker, blocks, expected) => {
    expect(parseTaskDetailBlock(detail(marker, blocks)).verificationCommands).toEqual(expected);
  });

  test('a task with no marker at all still has no commands (the heading is not optional)', () => {
    expect(parseTaskDetailBlock(detail('Verification:', bare('test -f a.js'))).verificationCommands).toEqual([]);
  });

  test('an illustrative marker earlier in the file does not shadow the real, last one', () => {
    const text = `### T-1\n\n${FIELDS('T-1')}\n\n**Verification commands:**\n\n${bare('echo example')}\n\nnotes\n\n**Verification commands:**\n\n${bare('test -f real.js')}\n`;
    expect(parseTaskDetailBlock(text).verificationCommands).toEqual(['test -f real.js']);
  });
});

describe('executor plan parseMarkdown', () => {
  const wb = (marker, blocks) => `# Work Breakdown — FTR-1\n\n## Task Details\n\n<a id="task-T-1"></a>\n${detail(marker, blocks)}\n## Statistics\n`;

  test.each([
    ['a bare fence', '**Verification commands:**', bare('test -f a.js')],
    ['a language-tagged fence', '**Verification commands:**', tagged('test -f a.js')],
    ['the marker with the colon outside the bold', '**Verification commands**:', tagged('test -f a.js')],
  ])('%s', (_n, marker, blocks) => {
    expect(parseMarkdown(wb(marker, blocks))[0].verificationCommands).toEqual(['test -f a.js']);
  });

  test('no marker: no commands, as before', () => {
    expect(parseMarkdown(wb('Verification:', bare('test -f a.js')))[0].verificationCommands).toEqual([]);
  });
});

describe('pm-phase2 early shape check agrees with the parsers', () => {
  test('a tagged fence and the alternative marker are accepted by checkTaskDetailShape too', () => {
    expect(checkTaskDetailShape(detail('**Verification commands**:', tagged('test -f a.js')), 'T-1')).toEqual([]);
  });
  test('no marker is rejected', () => {
    expect(checkTaskDetailShape(detail('Verification:', bare('test -f a.js')), 'T-1')).toHaveLength(1);
  });
});

describe('the writer is told about the two commands that look right and are wrong', () => {
  const fs = require('fs');
  const path = require('path');
  const agent = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'claude', 'agents', 'gaia-generate-work-breakdown-task.md'), 'utf8');
  test('node --check on a non-script file, and exit code 0 for a stub', () => {
    expect(agent).toMatch(/Two ways a command that looks right is wrong/);
    expect(agent).toMatch(/`node --check <file>` compiles the file as a plain script/);
    expect(agent).toMatch(/not "exit code\s+0"/);
    expect(agent).toMatch(/the heading is not optional/);
  });
});
