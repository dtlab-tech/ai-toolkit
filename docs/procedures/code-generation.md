# Code Generation Procedure

Step-by-step workflow for generating or modifying production code.

## When to use

Before writing any new code or modifying existing code. This ensures pattern compliance and avoids introducing inconsistencies.

## Steps

### 1. Read conventions

- Read `AGENTS.md` in the project root — understand tech stack, patterns, constraints
- If ADR files are referenced, read those too (they contain implementation guardrails)
- Note the build/verify commands

### 2. Search for existing patterns

- Before writing new code, search the codebase for similar implementations
- Find at least one existing file that does something similar to your task
- Match its structure, imports, naming, and style exactly
- If no similar code exists, follow the patterns described in AGENTS.md

### 3. Write code

- Write in small, focused units — one function, one class, one component at a time
- Follow the conventions from Step 1 precisely — no creative deviations
- Use existing utilities, helpers, and abstractions rather than creating new ones
- Name things consistently with the existing codebase

### 4. Verify compilation

- Run the build/type-check command defined in AGENTS.md
- Fix any errors or warnings before proceeding
- If you introduced a new file, verify it's properly imported/registered

### 5. Communicate assumptions

- If you made any assumptions during implementation, state them explicitly
- If you deviated from the spec for a technical reason, explain why
- If you identified potential issues or future work, note them

## Anti-patterns

- Writing code without first reading existing patterns
- Introducing new abstractions when existing ones work
- Guessing at business logic when the spec is ambiguous (ask instead)
- Skipping the verification step
