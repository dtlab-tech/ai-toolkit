# Functional Requirements — Example Feature With UI

## Document Info
| Field | Value |
|-------|-------|
| Feature | FTR-999 Example Feature With UI |
| Version | 1.0 |
| Date | 2026-01-01 |
| Status | Draft |

## 1. Introduction

### 1.1 Purpose
Example fixture feature exercising a non-empty UI Requirements section.

### 1.2 Scope
In scope: one use case with a real UI. Out of scope: everything else.

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

**First Thing Page** — a single form with one button labeled "Do it". Clicking the button
triggers UC-01's main flow.

### 6.2 Navigation Flow

The user lands on the First Thing Page directly from the app's home screen; there is no
further navigation beyond it in this example.

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|-----------|
| AC-01 | Given a user, when they do the first thing, then it is done | UC-01 |

## 8. Dependencies & Assumptions

- None

## 9. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | None | - | - |
