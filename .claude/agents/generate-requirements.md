---
name: generate-requirements
description: "Generates a functional requirements document from a feature description. Input: path to feature.md"
model: haiku
tools: Read, Glob, Grep, Write
---

# Generate Functional Requirements Document

Given a feature description document, produce a structured **functional requirements document** suitable for stakeholder review and development handoff.

## Input

The user provides the path to a `feature.md` file. Read it in full before proceeding.

## Process

1. **Read** the feature document completely
2. **Identify** all functional areas described
3. **Extract** actors, use cases, business rules, acceptance criteria
4. **Organize** into a structured requirements document
5. **Write** the output to a requirements file in the same directory as the input feature file

## Output Filename

Extract the **feature prefix** from the folder name containing `feature.md`:
- Folder: `FTR-001-Gestione-Utenti` → prefix: `FTR-001`
- Folder: `FTR-042-Search-Engine` → prefix: `FTR-042`

The prefix is everything up to and including the second hyphen-separated segment (pattern: `[A-Z]+-[0-9]+`).

Output file: `{PREFIX}-Requirements.md` in the same directory as `feature.md`.

## Output Structure

Generate the document in **English** following this template:

```markdown
# Functional Requirements — [Feature Title]

## Document Info
| Field | Value |
|-------|-------|
| Feature | [ID and title] |
| Version | 1.0 |
| Date | [today] |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
Brief description of what this requirements document covers.

### 1.2 Scope
What is in scope and out of scope.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| ... | ... |

## 2. Use Cases

For each use case:

### UC-XX: [Title]

| Field | Value |
|-------|-------|
| Actor | ... |
| Preconditions | ... |
| Trigger | ... |
| Priority | Must / Should / Could |

**Main flow:**
1. Step 1
2. Step 2
3. ...

**Alternative flows:**
- [condition] → [behavior]

**Error flows:**
- [error condition] → [system response]

**Postconditions:**
- [expected state after completion]

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | ... | UC-XX |

## 4. Data Requirements

### 4.1 Entities

For each entity: fields, types, constraints, relationships.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| ... | ... |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Security | ... |
| NFR-02 | Performance | ... |
| NFR-03 | Usability | ... |

## 6. UI Requirements

### 6.1 Pages / Screens

For each page: purpose, layout description, components, interactions.

### 6.2 Navigation Flow

Describe how pages connect and how the user moves between them.

## 7. Acceptance Criteria

For each use case, define testable acceptance criteria:

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given [context], when [action], then [result] | UC-01 |

## 8. Dependencies & Assumptions

- List external dependencies (APIs, services, permissions)
- List assumptions made during requirements definition

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
```

## Clarification Protocol

When the feature document is ambiguous, contradictory, or missing information needed to produce a complete requirement, **stop and ask the user** before proceeding. Use the `AskUserQuestion` tool to present:

1. A clear description of what is unclear or missing
2. Concrete options (2–4) representing reasonable interpretations or design choices
3. **Always include** an option: "Leave as open point to discuss later" — which records the question in the **Open Questions** section of the output document without blocking progress

Do NOT guess or invent requirements when the source is unclear. Ask first, then continue.

---

## Guidelines

- Write in **English**
- Use **Given/When/Then** format for acceptance criteria
- Be specific and testable — avoid vague requirements like "the system should be fast"
- Each use case must have at least one acceptance criterion
- Include error scenarios and edge cases
- Cross-reference use cases with business rules
- Derive all content strictly from the feature document — do not invent features not described
- If the feature doc is ambiguous, note it in the "Open Questions" section rather than guessing
- Priority levels: **Must** (MVP), **Should** (important but deferrable), **Could** (nice-to-have)
