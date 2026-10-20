# Functional Requirements — Example Feature

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-999 Example Feature |
| Version | 1.0 |
| Date | 2026-01-01 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
Example fixture feature for req-skeleton-check.js tests.

### 1.2 Scope
In scope: a minimal two-use-case example. Out of scope: everything else.

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| User | A regular end user |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-01 | Do the first thing | User | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |
| UC-02 | Do the second thing | User | Should | [use-cases/UC-02.md](use-cases/UC-02.md) |

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Example rule | UC-01, UC-02 |

## 4. Data Requirements

### 4.1 Entities

None.

### 4.2 Validation Rules

| Field | Rule |
|-------|------|
| name | required |

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Fast enough |

## 6. UI Requirements

### 6.1 Pages / Screens

None — no UI for this example fixture.

### 6.2 Navigation Flow

N/A

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a user, when they do the first thing, then it is done | UC-01 |
| AC-02 | Given a user, when they do the second thing, then it is done | UC-02 |

## 8. Dependencies & Assumptions

- None

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | None | - | - |
