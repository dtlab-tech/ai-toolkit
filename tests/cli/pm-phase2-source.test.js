'use strict';
const fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../../src/claude/workflows/pm-phase2.js'), 'utf8');
test('pm-phase2 never uses LLM wrappers for control-plane work', () => {
  expect(source).not.toMatch(/\bagent\s*\(/);
  expect(source).not.toMatch(/subagent_type|agentType\s*:/);
  expect(source).not.toMatch(/require\s*\(|child_process/);
});
test('pm-phase2 uses the owned host or rejects the retired entry point', () => {
  expect(source).toContain('c.run(meta.name'); expect(source).toContain('c.worker(');
});
test('every toolkit template is read via print-asset, never a bare local-install-relative c.read()', () => {
  // A real incident: gaia-user-story-template.md used to be read via a hardcoded
  // c.read('.claude/scripts/templates/...') path, which only resolves when the toolkit happens to
  // be installed LOCALLY into this project's own .claude/ folder — a project with a global-only
  // install got ENOENT. print-asset (already used for gaia-task-template.md) resolves local vs.
  // global correctly in both cases.
  expect(source).not.toMatch(/c\.read\(['"]\.claude\/scripts\/templates/);
  expect(source).toContain("c.command(['print-asset', 'scripts/templates/gaia-user-story-template.md', '--project', c.root])");
  expect(source).toContain("c.command(['print-asset', 'scripts/templates/gaia-task-template.md', '--project', c.root])");
});
