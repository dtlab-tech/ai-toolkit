# Code Review Procedure

Process for reviewing code or preparing a pull request.

## When to use

Before committing code, when reviewing a PR, or when the architect review agent runs.

## Steps

### 1. Understand the change

- Read the diff (or the files in scope)
- Understand what the change is trying to accomplish
- Cross-reference with the Tech-Spec or task description if available

### 2. Verify convention adherence

- Read `AGENTS.md` — check every rule against the change
- Pay special attention to:
  - Directory structure and file naming
  - Import/export patterns
  - Styling approach (no forbidden CSS patterns)
  - Responsive design requirements
  - i18n completeness (all locale files updated)
  - Type safety (no `any`, proper nullability)
  - Authorization patterns (all endpoints/pages protected)

### 3. Apply checklists

**General checklist (all projects):**
- [ ] No hardcoded secrets, tokens, or API keys
- [ ] No `console.log` or debug statements left in
- [ ] Error handling is present and meaningful
- [ ] Loading/empty states handled
- [ ] No unused imports or dead code
- [ ] Types/interfaces match between layers (DTO ↔ frontend interface)

**Project-specific checklist:**
- Derive from AGENTS.md's constraints and "do NOT" list
- Check any ADR guardrails that apply

### 4. Report findings

For each issue, provide:
- Severity: CRITICAL / WARNING / INFO
- Location: file path + line number
- Description: what's wrong
- Fix suggestion: what to do about it

## PR Description Template

When preparing a PR:

```
## Summary
- [1-3 bullet points describing what changed and why]

## Test plan
- [ ] Build/type-check passes
- [ ] [Specific test scenarios for this change]
- [ ] No regressions in related features
```
