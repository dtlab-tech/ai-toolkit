# Requirements — Sample Feature for AC Parser Tests

This file is a test fixture for the AC table parser (wb-validate.js, Section 3.2 contract).
It contains UC metadata tables with Priority fields and a ## 7. Acceptance Criteria section
with an AC table in the exact format the parser expects.

---

## 5. Use Cases

### UC-01: Parse and validate work breakdown JSON

| Field | Value |
|-------|-------|
| ID | UC-01 |
| Actor | wb-validate.js |
| Priority | Must |
| Trigger | pm-phase2 invokes the validator CLI |

**Description:** The validator reads a Work-Breakdown.json file, parses it according to schema
v2, and emits a structured JSON report. It must detect all 23 categories of structural error
without invoking an LLM.

---

### UC-02: Render human-readable and CSV output

| Field | Value |
|-------|-------|
| ID | UC-02 |
| Actor | wb-render.js |
| Priority | Should |
| Trigger | pm-phase2 invokes the renderer CLI after a successful validate pass |

**Description:** The renderer reads the validated JSON and produces a Markdown file for human
review and a pipe-separated CSV file for pm-phase3 consumption.

---

## 7. Acceptance Criteria

| ID | Criterion | Related UC |
|----|-----------|------------|
| AC-01 | Given a valid Work-Breakdown.json when wb-validate.js runs then it exits 0 and emits a JSON report with valid=true | UC-01 |
| AC-02 | Given a JSON file with a duplicate task ID when wb-validate.js runs then it exits 1 and reports category unique_id_violation | UC-01 |
| AC-03 | Given a Work-Breakdown.json that passes structural validation when wb-render.js runs then it writes both a .md and a .csv file to the feature directory | UC-01, UC-02 |
| AC-04 | Given a CSV produced by wb-render.js when pm-phase3 parses it then all phases are scheduled in the correct wave order | UC-02 |
| AC-05 | Given any validator or renderer invocation when it completes then a ledger entry is written with the correct status and token count | All UCs |
