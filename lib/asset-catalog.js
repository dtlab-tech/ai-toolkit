'use strict';

const ASSET_CATEGORIES = [
  {
    name: 'agents',
    sourceDir: 'src/claude/agents',
    runtimeDir: '.claude/agents',
    description: 'Agent definition files (.md with YAML frontmatter)',
  },
  {
    name: 'commands',
    sourceDir: 'src/claude/commands',
    runtimeDir: '.claude/commands',
    description: 'Slash command definition files',
  },
  {
    name: 'skills',
    sourceDir: 'src/claude/skills',
    runtimeDir: '.claude/skills',
    description: 'User-invocable skill directories with SKILL.md',
  },
  {
    name: 'workflows',
    sourceDir: 'src/claude/workflows',
    runtimeDir: '.claude/workflows',
    description: 'Claude Code Workflow orchestrator scripts (.js)',
  },
  {
    name: 'scripts',
    sourceDir: 'src/claude/scripts',
    runtimeDir: '.claude/scripts',
    description: 'Utility and helper scripts',
  },
];

function getAssetCategories() {
  return ASSET_CATEGORIES;
}

function getCategoryByName(name) {
  return ASSET_CATEGORIES.find(cat => cat.name === name);
}

if (require.main === module) {
  console.log(JSON.stringify(ASSET_CATEGORIES, null, 2));
} else {
  module.exports = {
    ASSET_CATEGORIES,
    getAssetCategories,
    getCategoryByName,
  };
}
