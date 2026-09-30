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
