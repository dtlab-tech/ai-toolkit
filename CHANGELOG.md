## 0.2.0 (2026-07-27)

### Features

* **FTR-009** — Rewrite orchestrators as Workflow scripts ([#22](https://github.com/dtlab-tech/ai-toolkit/pull/22))
  - `project-manager.md` and `assessment-manager.md` replaced by 5 deterministic Workflow scripts (`pm-phase1.js`, `pm-phase2.js`, `pm-phase3.js`, `am-phase1.js`, `am-phase2.js`)
  - `implement-feature` and `assess-codebase` skills updated to invoke workflows with gate handling in the main loop
  - Real per-phase token tracking via `budget.spent()` deltas; per-agent proportional distribution with disclaimer
  - `install-toolkit` agent and `bin/cli.js` updated to copy `.claude/workflows/` to destination projects

* **FTR-008** — Compact instructions block for `~/.claude/CLAUDE.md` ([#21](https://github.com/dtlab-tech/ai-toolkit/pull/21))
  - `install-toolkit` skill now offers opt-in to add `# Compact instructions` trigger to the global CLAUDE.md
  - Reduces context consumption on long sessions by enabling proactive compaction suggestions

* **FTR-007** — Explicit per-agent model assignment ([#20](https://github.com/dtlab-tech/ai-toolkit/pull/20))
  - All 15 agents carry explicit `model:` frontmatter (14 × sonnet, 1 × opus for `review-solution`)
  - 7 lightweight haiku agents unchanged (already optimal)

### Configuration

* `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` required for nested subagent spawning — installer verifies and advises, never writes user settings
* `install-toolkit` never copies `settings.json` or `settings.local.json`

---

## 0.1.3 (2026-07-14)
