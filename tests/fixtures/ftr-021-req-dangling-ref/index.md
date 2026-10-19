# Functional Requirements — Dangling Reference Fixture

## 1. Introduction

### 1.1 Purpose
Fixture whose AC table references a UC ID that doesn't exist in the Use Cases table.

### 1.2 Scope
N/A

### 1.3 Actors

| Actor | Description |
|-------|-------------|
| User | A regular end user |

## 2. Use Cases

| UC ID | Title | Actor | Priority | File |
|-------|-------|-------|----------|------|
| UC-01 | Do the first thing | User | Must | [use-cases/UC-01.md](use-cases/UC-01.md) |

## 3. Business Rules

| ID | Rule | Applies to |
|----|------|-----------|
| BR-01 | Example rule | UC-01 |

## 4. Data Requirements

None.

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Performance | Fast enough |

## 6. UI Requirements

N/A

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a user, when they do the first thing, then it is done | UC-99 |

## 8. Dependencies & Assumptions

- None

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
