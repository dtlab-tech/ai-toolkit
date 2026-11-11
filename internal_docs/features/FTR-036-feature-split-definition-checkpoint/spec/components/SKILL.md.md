# src/claude/skills/define-feature/SKILL.md — Modified

## Change

The current `SKILL.md` is a thin wrapper: it spawns `gaia-define-feature` with the user's source reference and a fixed prompt. This change adds the main-loop half of checkpoint 1 (FTR-036 UC-02, UC-03). The agent itself (Phase 3a, `check-definition`, Phase 4 writes) lives in `gaia-define-feature.md` and `feature-split.js`, not here. The skill's new responsibilities are: (1) pass a `Mode:` line (`define` or `late-child`) as the first line of the spawn prompt; (2) receive the agent's PROPOSAL block when a split is flagged and present it to the user; (3) collect accept, edit, or reject in the main loop, since a subagent cannot ask the user mid-run; (4) pass the decision back to the agent together with the in-memory grilling record and the current proposal, because the record is never written to disk (FTR-036 D-03); and (5) relay DONE or ERROR outcomes, including the partial-apply recovery choice. The existing spawn block and its sentence "Do not add instructions telling it to skip discovery" stay verbatim. The skill never writes files and never runs `check-definition` or `apply` itself. The skill does not hard-code any features-root path (D-10).

Gaps resolved here: the `skipped` criterion is referenced from FTR-035's `isNewFeature` (epic.md, `{PREFIX}-Approvals.md`, or a `wbs/` directory present). `resolve-features-root` failure and `RECORD_INVALID` both stop, report, and write nothing. The parent is written and registered (status `defined`) before `apply --parent`, which is a refinement of D-08 (see below). Partial apply failure follows the retry, edit, or reject offer with a `.split-staging-*` block. The late-child rules follow UC-03. Refinements: for a late child, Summary and Keywords come from the child's stated purpose and the epic's Summary, not from grilling answers, since the late path has no grilling round (refinement of D-07). Parent registration before apply is an explicit refinement of D-08, required by the FTR-035 apply initial-mode precondition.

Open gaps not decided by the excerpt I was given: the exact stdin payload of `apply` and the exact `register` argument list are FTR-035 contracts that this file names but does not restate; the outcome of "reject" after a partial apply failure is taken from the Tech-Spec summary and should be checked against FTR-035 apply's rollback semantics; the registry-status lookup used to refuse late children that are not `epic` is assumed to come from the FTR-035 facade.

## Orchestration Flow

Main-loop pseudocode. Agent outputs are blocks, not free text, so the skill can parse them.

```
route(user_request):
  if request names an existing epic FTR-ID AND asks for a missing child:
      mode = "late-child"
  elif request is ambiguous between the two:
      ask user: "new feature, or add a missing child to an existing epic?"  (no spawn yet)
  else:
      mode = "define"

  spawn gaia-define-feature with prompt:
      Mode: {mode}
      Start the feature definition session.
      Source reference (may be empty): {{user arguments verbatim}}

on agent return:
  case DONE:            relay written feature.md path / created children; stop
  case ERROR:           relay reason; stop (agent guarantees nothing was written,
                        except the partial-apply case below)
  case PROPOSAL:        present to user (below); collect decision
  case LATE_PROPOSAL:   present single-child proposal; collect decision
```

Handoff from agent to skill (returned when the check flags, or for late-child proposals). Not returned when `status` is `skipped` or `not-flagged`: the agent then writes the standalone `feature.md`, registers it, and returns DONE. Unevaluated signals are reported in every path, per BR-02.

```
CHECKPOINT: split-proposal
feature_id: FTR-XXX
record: { "actors": [...], "applications": [...], "flows": [{"name":"","reason":""}] }   # in-memory, D-03
check: { status: "flagged", signals: {...}, flows: [...], unevaluated: [...] }
proposal:
  parent: FTR-XXX
  children: [{ name, purpose, summary, keywords }]
  order: [child names, dependency order]
  shared_first_child: [grilling answer ids]
```

Handoff from skill to agent (decision round). The record and proposal are passed back in the prompt, not from disk.

```
CHECKPOINT: decision
feature_id: FTR-XXX
decision: accept | edit | reject
record: <unchanged from PROPOSAL>
proposal: <unchanged, or with user edits applied>
edits: "<user's free-text edits>"        # only when decision = edit
```

Decision handling in the skill:

- `edit`: send `decision: edit` with the user's edits. The agent validates them per FTR-035 D-09 and D-10, including the foundation warning, and returns an updated PROPOSAL with no writes. The skill re-presents it. Repeat until accept or reject.
- `reject`: send `decision: reject`. The agent writes the standalone `feature.md`, registers it as standalone (D-05, D-08), and returns DONE.
- `accept`: send `decision: accept`. The agent runs, in order: write the parent `feature.md`; `register` the parent with status `defined` (D-08 refinement, required because `apply` in initial mode needs a defined parent); `apply --parent`. It returns DONE, or on failure returns ERROR with the created children, and the skill offers retry, edit, or reject. While a `.split-staging-*` leftover exists, later `apply` calls are refused by the agent and the skill reports that.

Late-child mode (UC-03, no grilling round):

```
late-child:
  target = exact FTR-ID named by user
  if no FTR-ID named: agent lists candidate epic folders (containing epic.md); user picks one
  if no epic matches: stop, create nothing
  if registry status(target) != "epic": refuse, create nothing, no standalone fallback
  if feature.md of the requested child already exists: report and stop
  propose child: name, purpose, placed last, depends on previous last child
      summary  = from child purpose + target epic Summary     (D-07 refinement)
      keywords = from child title + purpose                    (editable)
  decision accept -> apply (no register call from this path)
  decision reject -> nothing created; no standalone fallback
```

## Tests

Static tests in `tests/cli/define-feature-checkpoint-text.test.js`. They pin the text of this skill and the agent's routing and state contract. They do not execute the agent.

- The existing spawn block is still present verbatim, including "Do not add instructions telling it to skip discovery".
- The spawn prompt includes a `Mode:` line with values `define` and `late-child`.
- The skill contains a PROPOSAL block schema and a decision block schema with keys `feature_id`, `decision`, `record`, `proposal`.
- The skill states that `accept`, `edit`, and `reject` are collected in the main loop, and that the grilling record is passed in the prompt and not written to disk.
- The skill contains no path hard-coded to a features root and references `resolve-features-root`.
- The skill states that `resolve-features-root` failure and `RECORD_INVALID` stop with nothing written.
- The skill states the `skipped` criterion via FTR-035 `isNewFeature` (epic.md, Approvals, or `wbs/`).
- The accept path text orders parent write, parent register with status `defined`, then `apply --parent`.
- The partial-failure text offers retry, edit, or reject and blocks later applies while `.split-staging-*` exists.
- The late-child text refuses unless registry status is `epic`, has no grilling round, has no standalone fallback, and has no `register` call.
- The late-child text states that a missing target epic creates nothing, and that an existing child feature.md is reported and stops.
- The unevaluated-signal note appears in the not-flagged path as well as the flagged path (BR-02).