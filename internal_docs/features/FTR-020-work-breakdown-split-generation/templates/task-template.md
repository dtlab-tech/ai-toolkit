<!--
TASK DETAIL TEMPLATE — wbs/tasks/{TASK_ID}.md

Canonical structure for a task file in the FTR-020 split Work Breakdown format. Every task file
has exactly three parts, in this order: (1) the field block, (2) Implementation notes,
(3) Verification commands. Fill in every placeholder below (angle brackets) and delete every
HTML comment block (including this one) before treating the file as finished. Do not add, remove,
or reorder the 14 fields — they are parsed positionally as the contiguous run immediately after
the heading (see "Parsing contract" at the bottom of this file).
-->
<a id="task-{TASK_ID}"></a>
### {TASK_ID}

- **Task ID:** {TASK_ID}
- **Title:** <Short, specific, action-oriented. Not a restatement of the outcome.>
- **Outcome:** <The ONE observable thing that exists/changed after this task is done — one
  factual, verifiable sentence. If you need "and" to describe it, the task is probably not
  atomic — split it (see Atomicity Contract in gaia-generate-work-breakdown.md).>
- **Domain:** <one of: BE | FE | DB | DevOps | INFRA | TEST>
- **Agent type:** <one of: developer-backend | developer-frontend | developer-testing | review-solution>
- **Dependencies:** <comma-separated task IDs this task's work requires to exist first, or `—` if none>
- **Acceptance criteria:** <comma-separated AC IDs from Requirements that this task covers, scoped
  to this task's own phase — or `—` if none>
- **Estimate — agent minutes:** <integer. Target ≤15 (no flag); 16–20 acceptable (no flag);
  21–30 is a non-blocking warning — justify in Grouping rationale below; >30 is rejected, split
  the task instead.>
- **Estimate — tokens:** <integer, rough order of magnitude for the agent invocation>
- **Output count:** <integer ≥1. Almost always 1 — see Atomicity Contract. >1 requires a non-null
  Grouping rationale below.>
- **Grouping rationale:** <required (non-`—`) only when Output count >1 or the estimate is in the
  21–30 min warning band; otherwise `—`>
- **Commit type:** <conventional-commit type: feat | fix | refactor | test | chore | docs | ...>
- **Commit scope:** <optional conventional-commit scope, or `—`>
- **Commit subject:** <imperative, concise, no trailing period — the renderer prepends
  `type(scope): ` automatically, do not include it here>

**Implementation notes:**

<!--
This is the part that makes a task file self-sufficient: someone (human or agent) reading ONLY
this file — not the whole Tech-Spec — should know exactly what to do and how.

Write:
- If this task RELOCATES or MODIFIES existing code: name the exact file(s) and, if you know
  them, the exact current line ranges to copy from or change. Show a before/after snippet, not
  just a description of the change.
- If this task CREATES something new: give its real signature(s) (function names, parameters,
  return shape) and the actual algorithm as pseudocode or real code — not just a description of
  what it should do.
- If this task is a TEST: show at least one concrete `test()`/`describe()` block with real
  assertions against the real function/CLI being tested, not a prose list of "things to check".
- Length target: not 10 lines (too thin to act on without re-deriving the design yourself), not
  10 pages (defeats the point of a small, bounded, independently generated task). A few concrete
  snippets plus the reasoning that connects them is usually right.
- It is fine — often good — to include a literal example of this exact task-file format inside a
  fenced code block (e.g. to show another agent's expected output shape). If you do, see the
  parsing-contract warning at the bottom of this file: it is specifically about this situation.
-->

<prose + pseudocode/code here>

**Verification commands:**

<!--
One or more real shell commands (use AGENTS.md's actual build/test commands for this project)
that verify this task's output. Must be non-empty. Each command gets its own fenced block,
preserved byte-for-byte verbatim — never edited, escaped, or "cleaned up" by any tool that
touches this file; this is what lets a command contain `|`, backticks, or other shell syntax
safely.
-->

```
<command>
```

<!--
PARSING CONTRACT (do not delete this section from the real template file; delete only from a
filled-in task instance) — read by wbs-assembler.js's parseTaskDetailBlock:
1. Field values are read from the CONTIGUOUS RUN of `- **Label:** value` lines starting
   immediately after the `### {TASK_ID}` heading. Scanning STOPS at the first line that is not
   in that shape — so an example block further down in Implementation notes that happens to
   contain `- **Task ID:** ...`-shaped lines is never mistaken for the real fields. (A real bug,
   found and fixed during this feature's own definition — see US-03-TASK-INFRA-01.md and
   Tech-Spec §4.)
2. The verification commands are the fenced block(s) after the LAST occurrence of
   "**Verification commands:**" in the file — not the first — for the same reason: an
   illustrative example earlier in the file must never be mistaken for the real section.
3. Conclusion for anyone writing Implementation notes: you may safely show an example of this
   format inside your own notes. You may NOT rely on your example being the last occurrence of
   "**Verification commands:**" in the file — the real one (at the bottom) always is, by
   construction, as long as you don't add a second real verification section.
-->
