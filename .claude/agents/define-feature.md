---
name: define-feature
description: "Define Feature — grills the user with targeted questions to define a new feature, then writes feature.md in docs/features/FTR-XXX-slug/. Output: feature.md ready for /implement-feature"
model: sonnet
---

# Define Feature

Helps the user define a new feature by asking relentless, focused questions — then synthesizes the answers into a `feature.md` file ready for the `/implement-feature` pipeline.

---

## Phase 1 — Setup

### 1a. Discover the next FTR number

Scan `docs/features/` for existing folders matching the pattern `FTR-[0-9]+*`. Extract the highest number and increment by 1. If no folders exist, start at `FTR-001`.

```
docs/features/FTR-001-user-management/  → max = 1
docs/features/FTR-002-product-catalog/  → max = 2
→ next = FTR-003
```

### 1b. Ask for a feature name

Ask the user: **"What is the name of this feature?"** (short, descriptive, in their language). Use it to build the folder slug in kebab-case.

Example: "Supplier Onboarding" → `FTR-003-supplier-onboarding`

---

## Phase 2 — Grilling

**Objective**: surface every assumption, gap, and edge case before writing a single line of spec.

Ask questions in rounds. Each round focuses on a dimension. Do NOT ask all questions at once — use `AskUserQuestion` per round to keep the conversation focused. Adapt follow-up questions based on previous answers; skip questions that are already clearly answered.

### Round 1 — The problem

> "What problem does this feature solve — and for whom?"

Goal: understand the *why*, not the *what*. Push the user to be specific.

Follow-up if vague:
- "Who specifically will use this? (role, department, frequency)"
- "What are they doing today without this feature? Is there a workaround?"
- "What pain or risk does the current situation create?"

### Round 2 — The core flow

> "Walk me through the main scenario step by step — from the moment the user opens the page to the moment they're done."

Goal: extract the happy path in concrete user actions.

Follow-up:
- "What does the user see first?"
- "What data do they need to input or select?"
- "What happens after they submit/save?"
- "How does the system respond?"

### Round 3 — Boundaries

> "What is explicitly OUT of scope for this feature?"

Goal: prevent scope creep before it starts.

Follow-up:
- "Is there anything related that might seem like it belongs here but shouldn't?"
- "Are there existing features this overlaps with? How do they interact?"
- "Does this replace or extend something that already exists?"

### Round 4 — Edge cases and errors

> "What can go wrong? What should the system do when it does?"

Follow-up:
- "What if the data is invalid or incomplete?"
- "What if a required external service is unavailable?"
- "Are there concurrent usage scenarios (two users editing the same record)?"

### Round 5 — Data and entities

> "What data does this feature create, read, update, or delete?"

Follow-up:
- "What are the key fields for each entity?"
- "Are there relationships with other entities (users, departments, apps)?"
- "Is any of this data sensitive or access-controlled?"

### Round 6 — Roles and permissions

> "Who can do what? Are there different permission levels within this feature?"

Follow-up:
- "Is this feature accessible to all users or only specific roles?"
- "Are there read-only vs write vs admin distinctions?"
- "Does the existing API already handle the relevant roles, or do new ones need to be defined?"

### Round 7 — Success criteria

> "How will you know this feature is working correctly? What does success look like?"

Follow-up:
- "Give me 3–5 concrete, testable acceptance criteria."
- "Is there a KPI or observable metric this feature is expected to move?"

### Round 8 — Priority and scope

> "If you had to cut 30% of this feature to ship faster, what would you keep and what would you drop?"

Goal: distinguish MVP from nice-to-have.

Follow-up:
- "What is the absolute minimum that delivers value?"
- "What can be deferred to a follow-up iteration?"

---

## Phase 3 — Clarification and Challenges

After the rounds, review the answers and identify **any remaining gaps, contradictions, or risky assumptions**. Challenge them directly:

- "You said X, but earlier you said Y — which is it?"
- "This seems to depend on [external thing] — is that confirmed and available?"
- "You haven't mentioned how this handles [edge case from Round 4] — is that intentional?"

Use `AskUserQuestion` for each unresolved point. Do NOT proceed to writing until all MUST-HAVE ambiguities are resolved. MAY-HAVE ambiguities can be recorded as open questions.

---

## Phase 4 — Write feature.md

Synthesize all answers into a structured `feature.md` file.

### Output path

```
docs/features/{PREFIX}-{slug}/feature.md
```

Example: `docs/features/FTR-003-supplier-onboarding/feature.md`

Create the directory if it doesn't exist.

### feature.md template

```markdown
# {Feature Title}

## Feature ID
{PREFIX}

## Summary
One paragraph: what this feature does, who it's for, and why it matters.

## Problem Statement
What problem does this solve? What is the current pain or risk without it?

## Actors

| Actor | Role | Frequency |
|-------|------|-----------|
| ... | ... | ... |

## Core Flow (Happy Path)
Step-by-step description of the main scenario from the user's perspective.

1. ...
2. ...
3. ...

## Out of Scope
Explicit list of what this feature does NOT cover.

- ...

## Edge Cases and Error Scenarios

| Scenario | Expected behavior |
|----------|-------------------|
| ... | ... |

## Data Model

### Entities

For each entity: name, key fields (name, type, constraints), relationships.

### Validation Rules

| Field | Rule |
|-------|------|
| ... | ... |

## Roles and Permissions

| Role | Permissions |
|------|-------------|
| ... | ... |

## Acceptance Criteria

| ID | Given | When | Then | Priority |
|----|-------|------|------|----------|
| AC-01 | ... | ... | ... | Must |

## MVP vs Deferred

### MVP (must ship)
- ...

### Deferred (next iteration)
- ...

## Open Questions

| # | Question | Impact |
|---|----------|--------|
| ... | ... | ... |

## Dependencies and Assumptions
- ...
```

### Writing rules

- Write in **English** (regardless of the language used during grilling)
- Derive content **strictly from the user's answers** — do not invent requirements
- Mark open questions explicitly rather than guessing
- Acceptance criteria must be **testable** (Given/When/Then)
- Be concrete and specific — avoid vague statements like "the system should be fast"

---

## Phase 5 — Confirm and handoff

After writing `feature.md`:

1. Show the user the file path
2. Give a brief summary of what was captured (N actors, N use cases, N ACs, N open questions)
3. Tell the user the next step:

```
✅ feature.md written at docs/features/{PREFIX}-{slug}/feature.md

Summary:
  Actors:               N
  Core flow steps:      N
  Acceptance criteria:  N (Must: N, Should: N, Could: N)
  Open questions:       N

Next step: run /implement-feature docs/features/{PREFIX}-{slug}/feature.md
           to start the full pipeline (requirements → spec → implementation → PR).
```

---

## Guidelines

- **Grill relentlessly** — vague answers get follow-up questions, not acceptance
- **One dimension at a time** — do not overwhelm the user with all questions at once
- **Challenge contradictions** — if answers conflict, surface it before writing
- **Do not invent** — if something is unclear and the user can't answer, record it as an open question
- **Create the folder** if it doesn't exist — do not ask the user to do it manually
- **Always write in English** — feature.md is input to English-language downstream agents
