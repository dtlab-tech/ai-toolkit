# Effort Estimate — FTR-035 — FTR-035

| Metric | Value |
| --- | --- |
| User Stories | 6 |
| Total tasks | 55 |
| Human estimate | ~88h 30min |
| Agent estimate | 668min (sequential estimate) |

## Per-Phase Breakdown

| Phase | Title | Tasks | Est. Human minutes | Actual Human | Actual Agent |
| --- | --- | --- | --- | --- | --- |
| INFRA | Shared infrastructure setup: default configuration file, feature-split.js skeleton with FeatureSplitError and facade contract, slug rule, registry read and temp-and-rename write helpers, staging leftover scan | 9 | 930 | — | — |
| US-01 | As a calling feature script, I want to load the merged configuration with validation so that thresholds are never hard-coded | 6 | 540 | — | — |
| US-02 | As a calling feature script, I want a single new-feature test so that both checkpoints decide newness the same way | 3 | 240 | — | — |
| US-03 | As a user, I want to build and edit a split proposal with warnings so that I can review it before anything is applied | 9 | 900 | — | — |
| US-04 | As a user, I want a confirmed split applied atomically, as an initial split or a late child, so that the epic record, child folders and registry stay consistent | 18 | 1800 | — | — |
| US-05 | As a calling feature script, I want to register a standalone feature in the registry so that it is recorded once as defined | 7 | 600 | — | — |
| US-06 | As a Requirements or Tech-Spec generator agent, I want to read child and epic registry entries and epic.md so that standalone, child and epic features are classified correctly | 3 | 300 | — | — |
