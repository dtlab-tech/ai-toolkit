# Testing Procedure

Strategy and guidelines for writing and validating tests.

## When to use

When adding tests to the project, either as part of a feature implementation or as standalone test coverage improvement.

## Steps

### 1. Identify what to test

Prioritized test targets:
1. **Business logic** — core domain operations, calculations, state transitions
2. **Security** — authorization checks, input validation
3. **Edge cases** — null/empty inputs, boundaries, error conditions
4. **API contracts** — request/response shapes, status codes
5. **Integration points** — database operations, external API calls

### 2. Determine test type

| Type | When | Characteristics |
|------|------|-----------------|
| Unit | Isolated logic, pure functions, services | Fast, no I/O, mocked dependencies |
| Integration | Multi-layer operations, DB queries | Real (or in-memory) DB, slower |
| API/Controller | HTTP endpoint behavior | Full request pipeline, auth headers |
| Component | UI component rendering and interaction | DOM rendering, user events |

### 3. Check test infrastructure

- Read existing tests to understand the established patterns
- Check for test helpers, fixtures, and factories already available
- Use the project's test framework and libraries (defined in AGENTS.md)

### 4. Write tests

- **Naming**: describe the scenario and expected outcome (e.g., `CreateUser_WithInvalidEmail_Returns422`)
- **AAA pattern**: Arrange (setup), Act (execute), Assert (verify)
- **One logical assertion per test** — test one behavior at a time
- **Isolation**: each test creates its own state, never depends on others
- **Readability**: a test should be understandable without reading the implementation

### 5. Verify

- Run the test command from AGENTS.md
- All tests must pass (new and existing)
- Check for flaky tests (tests that sometimes pass, sometimes fail)

## What NOT to test

- Framework/library behavior (e.g., "does the ORM save correctly?")
- Trivial code (getters, setters, data classes)
- Static configuration
- Third-party code behavior
- Implementation details that may change during refactoring

## Anti-patterns

- Testing implementation instead of behavior
- Tests that break when internal code is refactored
- Tests with hidden dependencies (shared state, execution order)
- Overly specific mocks that mirror the implementation
- Missing edge case coverage for the happy path
