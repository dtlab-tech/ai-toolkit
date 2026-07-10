# Procedure: Issues Register

The Issues Register tracks all non-CRITICAL review findings throughout implementation.

**File**: `{PREFIX}-Issues.md` in the same directory as `feature.md`.

## Format

```markdown
# Issues Register — {PREFIX}

| # | Severity | US / Scope | File(s) | Description | Status | Resolved by |
|---|----------|-----------|---------|-------------|--------|-------------|
| 1 | WARNING | US-01 | file.tsx:45 | Description | OPEN | — |
| 2 | INFO | US-02 | file.tsx | Description | OPEN | — |
```

## Rules

- **CRITICAL findings** are NOT tracked here — they trigger immediate rework during US review
- **WARNING and INFO findings** are logged here and do NOT block the current phase
- Every review pass appends new findings — never delete rows
- Final statuses after remediation: `FIXED`, `DEFERRED`
- The register is the input for the Remediation phase
