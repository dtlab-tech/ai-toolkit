# tests/cli/define-feature-checkpoint-text.test.js — New

## Change

This new file is a static test suite that pins the text of the two files FTR-036 changes: the `define-feature` agent (`src/claude/agents/gaia-define-feature.md`) and the `define-feature` skill (`src/claude/skills/define-feature/SKILL.md`). It reads both files as UTF-8 and asserts on their contents with substring and regex checks. It does not execute the agent or the skill, and it does not exercise `feature-split.js`, which `tests/scripts/feature-split.test.js` covers. The file exports nothing; it contains only test cases. The assertions cover the Phase 3a placement, the `check-definition` invocation (D-04), the proposal and accept/edit/reject handling in the main loop (UC-02, BR-01, BR-03), standalone registration with `register` (D-08), the late-child path (UC-03), the features-root resolution (D-10), and the no-overwrite rule (BR-04). Nothing else in the two source files is asserted, so unrelated prose can change without breaking these tests.

Gaps for the host to surface at Gate 1:
- The wording of AC-06 to AC-13 is not in the excerpt I was given. The case list below is derived from feature.md Scope, Core Flow, Business Rules and Decisions, and from the Tech-Spec Section 2.3 rules relayed in the dispatch. Each case should be checked against the AC text when that is supplied.
- The test runner and assertion library are not stated in the excerpt. The file should use whatever runner `tests/scripts/feature-split.test.js` uses, and `AGENTS.md` should confirm the convention.
- feature.md does not fix the exact sentence wording in the agent or skill. The assertions therefore key on stable anchors (`Phase 3a`, the command literal `check-definition`, `resolve-features-root`, `register`, `apply`) rather than full sentences.

## Algorithm

Pseudocode for the suite structure. Each `expect` is a substring or regex check on the file text read from disk.

```js
// tests/cli/define-feature-checkpoint-text.test.js
const fs = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', '..', 'src', 'claude', 'agents', 'gaia-define-feature.md');
const SKILL = path.join(__dirname, '..', '..', 'src', 'claude', 'skills', 'define-feature', 'SKILL.md');
const agent = fs.readFileSync(AGENT, 'utf8');
const skill = fs.readFileSync(SKILL, 'utf8');

// Helper: index of the first match, or -1. Used for ordering checks.
const at = (text, needle) => text.indexOf(needle);

describe('agent: Phase 3a placement (Scope, Core Flow UC-01)', () => {
  // Phase 3a sits strictly between grilling (Phase 3) and writing feature.md (Phase 4).
  test('Phase 3a exists', () => expect(agent).toMatch(/Phase 3a/));
  test('Phase 3a comes after Phase 3 and before Phase 4',
    () => expect(at(agent, 'Phase 3a')).toBeGreaterThan(at(agent, 'Phase 3'))
       && expect(at(agent, 'Phase 3a')).toBeLessThan(at(agent, 'Phase 4')));
});

describe('agent: check-definition invocation (D-03, D-04, D-10)', () => {
  // Exact command shape from D-04; features root is resolved, never hard-coded.
  test('invokes run-asset scripts/feature-split.js ... --check-definition',
    () => expect(agent).toMatch(/run-asset scripts\/feature-split\.js.*--check-definition/s));
  test('passes --features-root and --feature-id', () => {
    expect(agent).toMatch(/--features-root/);
    expect(agent).toMatch(/--feature-id/);
  });
  test('resolves the root with ai-toolkit resolve-features-root', () =>
    expect(agent).toMatch(/ai-toolkit resolve-features-root/));
  test('does not hard-code a features path', () =>
    expect(agent).not.toMatch(/features\/FTR-\d+/));           // no literal path in the prompt
  test('grilling record is passed on stdin as JSON with actors/applications/flows',
    () => expect(agent).toMatch(/"actors"[\s\S]*"applications"[\s\S]*"flows"/));
  test('record is never written to disk (D-03, BR-03)',
    () => expect(agent).toMatch(/in memory/i));
});

describe('agent: no-write before confirmation (BR-01, BR-03)', () => {
  test('states that nothing is created before the user confirms',
    () => expect(agent).toMatch(/before the user confirms|nothing is (created|written)/i));
});

describe('agent: standalone registration (D-08, Tech-Spec 2.3 parent refinement)', () => {
  test('runs register when writing a feature.md that is not split', () =>
    expect(agent).toMatch(/register/));
  test('Summary is the first sentence of the Summary section (D-08)', () =>
    expect(agent).toMatch(/first sentence/i));
  test('split parent is registered with status defined before apply --parent (Tech-Spec 2.3, citing FTR-035 apply initial-mode precondition)',
    () => expect(agent).toMatch(/status defined[\s\S]*apply --parent|apply --parent[\s\S]*status defined/));
});

describe('agent: late child (UC-03; Tech-Spec 2.3 decisions)', () => {
  test('late child uses apply, placed last and depending on the previous last child',
    () => expect(agent).toMatch(/apply[\s\S]*last[\s\S]*depend/i));
  test('late child runs no grilling round', () =>
    expect(agent).toMatch(/no grilling/i));
  test('late child is refused unless the registry status is epic', () =>
    expect(agent).toMatch(/status[\s\S]*epic/));
  test('late child has no standalone fallback and no register call', () =>
    expect(agent).toMatch(/no standalone fallback|never.*standalone/i));
  test('existing child feature.md is reported and stops (Tech-Spec 2.3)', () =>
    expect(agent).toMatch(/already exists[\s\S]*(stop|report)/i));
  test('no match with an epic lists candidates and creates nothing (Tech-Spec 2.3)', () =>
    expect(agent).toMatch(/candidate/i));
});

describe('agent: no overwrite (BR-04)', () => {
  test('never overwrites an existing feature.md', () =>
    expect(agent).toMatch(/never overwrite/i));
});

describe('skill: checkpoint presentation in the main loop (UC-02, BR-01, D-06, D-07)', () => {
  test('shows the proposal with child names, purposes, dependency order, shared parts',
    () => expect(skill).toMatch(/dependency order[\s\S]*shared/is));
  test('lists the flows by name with a one-line reason (D-02)',
    () => expect(skill).toMatch(/flows?[\s\S]*reason/is));
  test('collects accept, edit or reject', () => {
    expect(skill).toMatch(/accept/i);
    expect(skill).toMatch(/edit/i);
    expect(skill).toMatch(/reject/i);
  });
  test('Summary and Keywords are shown as editable items (D-07)',
    () => expect(skill).toMatch(/Summary[\s\S]*Keywords[\s\S]*edit/is));
  test('accept runs apply; reject continues as standalone (D-05, UC-02)', () => {
    expect(skill).toMatch(/apply/);
    expect(skill).toMatch(/standalone/i);
  });
  test('edits follow the foundation warning (D-06)',
    () => expect(skill).toMatch(/foundation/i));
  test('no-signal path shows nothing (UC-01)',
    () => expect(skill).toMatch(/not-flagged|no signal/i));
});

describe('skill: unevaluated signals are named (BR-02, D-04)', () => {
  test('mentions unevaluated and says which signal could not be evaluated',
    () => expect(skill).toMatch(/unevaluated/));
});
```

Prose on the non-obvious choices:
- **Ordering checks** (Phase 3a between Phase 3 and Phase 4) use `indexOf` rather than a regex, so a reordering of the phases fails the test even if both headings still exist.
- **Negative checks** (no hard-coded `features/FTR-` path, no `.toMatch` on `features/FTR-`) guard D-10 and are cheap to keep.
- **Anchors, not sentences**: the assertions match command literals and keywords (`register`, `apply`, `resolve-features-root`, `status defined`, `epic`). They do not match full sentences, so wording edits do not break the suite. Phrasing that a future edit could drop (for example `not-flagged`) is the one anchor the author must keep in step with D-04.
- The `describe`/`test`/`expect` syntax above is a placeholder for the project's own runner. The actual file should use the runner and assertion style of `tests/scripts/feature-split.test.js`.

## Tests

This component is itself a test file, so its own test cases are the assertions above. The cases map to the Addresses as follows, pending confirmation against the AC text:

- **AC-06** (UC-01 assess at definition time): Phase 3a placement; `check-definition` command literal and its stdin record shape; in-memory record; `resolve-features-root` used, path not hard-coded; no-signal path shows nothing.
- **AC-07** (UC-02 accept, edit or reject in the main loop): skill presents the proposal with dependency order and shared parts; flows listed with reasons; accept, edit and reject all handled; accept runs `apply`; reject continues as standalone; Summary and Keywords editable; foundation warning on edit.
- **AC-08** (standalone registration, D-08): agent runs `register` for a non-split `feature.md`; Summary is the first sentence of the Summary section; split parent registered with status defined before `apply --parent`.
- **AC-10** (UC-03 late child, placement): `apply` used; child placed last and depends on the previous last child; no grilling round; refused unless the registry status is `epic`; no standalone fallback; no `register` call; existing child reported and stopped; no matching epic lists candidates and creates nothing.
- **AC-11** (BR-04, no overwrite): agent states it never overwrites an existing `feature.md`.
- **AC-12** (BR-02, unevaluated signals): skill names any signal reported in `unevaluated`.
- **AC-13** (BR-01 and BR-03, nothing written before confirmation): agent states that nothing is created or written before the user confirms.

Run the suite with the project's test command (see `AGENTS.md`). It should fail before the FTR-036 text edits to the agent and skill, and pass after them. A failing assertion names the exact anchor that is missing, so it doubles as a checklist for the agent and skill edits.