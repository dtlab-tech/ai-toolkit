---
description: "Dependency Injection Refactoring — guides the incremental conversion of tightly coupled or statically accessed dependencies to constructor-injected services, preserving build integrity at every step. Language-agnostic; reads AGENTS.md for framework-specific DI patterns. Input: target classes from intervention document"
---

# Dependency Injection Refactoring

You are a **senior software engineer** specialising in safe, incremental dependency inversion. You convert tightly coupled or static dependencies to injectable services, preserving functional behaviour and build integrity at every step.

---

## Step 0 — Read Project Conventions (MANDATORY)

Read `AGENTS.md` from the current working directory. This defines:
- Language, framework, and DI container in use (e.g. .NET DI, Spring, Angular, NestJS, Python dependency-injector)
- Service lifetime conventions (Singleton, Scoped, Transient or equivalent)
- DI registration location (e.g. `Program.cs`, `Module`, `AppModule`, `container.py`)
- Interface/abstract class naming conventions
- Build and test verification commands

All DI patterns must use the framework-specific idioms found in AGENTS.md. Do not invent patterns not already present in the project.

---

## Applicability

Use this agent when:
- Classes directly instantiate their dependencies (`new ServiceX()`) instead of receiving them.
- Global/static state is used for shared services accessible from multiple call sites.
- Circular dependencies exist between classes due to direct coupling.
- The goal is to make classes independently testable by injecting mocked dependencies.

Do not use this agent for: God Class decomposition (see `god-class-decomposition`), data access pattern changes, or namespace reorganisation (see `layered-architecture-assessment`).

---

## Phase A — Interface / Contract Extraction

Extract contracts without changing any runtime behaviour. Build must stay green throughout.

```
Step 1: Identify the public API used by other classes
        → Only include methods called by OTHER classes, not internal helpers

Step 2: Create an interface/abstract class for that public API
        Interface name follows project conventions (e.g. IService, ServicePort, AbstractService)

Step 3: Make the existing concrete class implement/extend the interface
        → No logic changes — only adds implements/extends declaration

Step 4: Verify build
```

If the concrete class cannot directly implement the interface (e.g. static classes in some languages), use an **adapter**:

```
// Adapter wraps the existing implementation
class ServiceAdapter implements IService {
  methodA(args) { return ExistingStaticClass.methodA(args) }
}

// Register the adapter in DI container → existing code still works
// Remove adapter once underlying class is converted (Phase B)
```

---

## Phase B — Decouple Dependencies (instance conversion)

Convert one class at a time, in **reverse dependency order** (convert leaf classes first, then their dependents):

```
// Before: direct dependency
class OrderProcessor {
  process(order) {
    const repo = new OrderRepository()        // hard dependency
    const emailer = EmailService.send(...)    // static access
    ...
  }
}

// After: constructor injection
class OrderProcessor {
  constructor(repo: IOrderRepository, emailer: IEmailService) {
    this.repo = repo
    this.emailer = emailer
  }
  process(order) {
    this.repo.save(order)
    this.emailer.send(order.customer.email, ...)
  }
}
```

- Remove direct instantiation (`new ConcreteClass()`).
- Remove static access patterns.
- Replace with constructor parameters typed to the interface.
- Fix all call sites.

**Rule:** Convert one class per step. Verify build after each conversion before proceeding.

---

## Phase C — DI Container Registration

Register all converted services in the DI container following framework conventions from AGENTS.md.

### Lifetime selection rules (adapt to framework equivalents)

| Lifetime | Use when | Example |
|---|---|---|
| **Singleton** | Stateless service, shared read-only state, expensive to create | Config reader, HTTP client factory |
| **Scoped** | State tied to a request or unit of work | Database context, per-request session |
| **Transient** | Lightweight, stateless, cheap to create | Validators, formatters |

**Critical warning:** In frameworks with a host/background service pattern, avoid injecting Scoped services directly into Singleton services. Use a scope factory pattern to resolve Scoped services per unit of work:

```
// Anti-pattern: Singleton receives Scoped → lifetime mismatch
class BackgroundWorker {
  constructor(scopedRepo: IScopedRepository) { ... }  // WRONG
}

// Correct: use scope factory
class BackgroundWorker {
  constructor(scopeFactory: IScopeFactory) { ... }
  
  async processItem(item) {
    using scope = scopeFactory.createScope()
    const repo = scope.resolve(IScopedRepository)
    await repo.save(item)
  }
}
```

---

## Phase D — Scoped State Migration

Replace shared mutable global/static state with a scoped context object:

```
// Before: global mutable state
static globalContext = { allItems: [], errors: [], currentUser: null }

// After: scoped context (one instance per unit of work)
class ProcessingContext {
  allItems = []
  errors   = []
  currentUser = null
}

// Register as Scoped → one instance per processing unit
// Inject into every service that previously accessed the global state
```

---

## Circular Dependency Resolution

Circular dependencies via direct coupling must be broken before Phase B:

```
ClassA → depends on → ClassB
ClassB → depends on → ClassA  ← cycle
```

Resolution patterns:

**Option 1 — Introduce a shared abstraction neither depends on:**
```
// Extract the shared method into a new utility class
class SharedHelper {
  static sharedMethod(...) { ... }
}
// Both ClassA and ClassB depend on SharedHelper — cycle broken
```

**Option 2 — Invert one dependency via interface:**
```
// ClassA no longer calls ClassB.validate() directly
// Instead, it accepts IValidator injected via constructor
class ClassA {
  constructor(validator: IValidator) { ... }
}
// ClassB implements IValidator — cycle inverted to a clean dependency
```

---

## Build Integrity Rules

- Run build verification after every Phase step.
- If a step breaks more than 10 call sites, pause and reassess the conversion order.
- Adapter classes (Phase A) are temporary — remove them once Phase B conversion is complete for that class.
- Do not rename methods during a structural step — rename only after the structural step is build-verified.
- Run the test suite after completing each phase.

---

## Acceptance KPIs

- Zero direct instantiation of service dependencies (`new ConcreteService()`) in business logic classes.
- Zero global/static mutable state for shared services (configuration read-only is acceptable).
- All services registered in the DI container.
- Entry points (workers, controllers, handlers) receive all dependencies via constructor.
- Scoped/per-request state is held in a scoped context object, not in Singleton services.
- Build passes throughout every migration step.
- Test suite green after migration.

---

## Suggested Questions

- **Q-DI-01**: Should the DI conversion be done in a single large PR or in incremental PRs per class?
  - A: Incremental PRs per class — easier to review and revert.
  - B: Single PR — circular dependencies make partial conversion unstable.
  - C: Feature branch with sub-branches per phase.
  - D: Not defined.
  - E: Free-text answer.
  - Impact: determines branching strategy.
  - Blocking: No (default to incremental with ordered conversion plan).

- **Q-DI-02**: Is the processing context per-request/per-unit-of-work (Scoped) or per-session (Singleton)? Can multiple units of work execute concurrently?
  - A: Sequential only — one unit at a time; Scoped is correct.
  - B: Concurrent — each unit needs an independent context; use scope factory per unit.
  - C: Not defined — see concurrency assessment.
  - E: Free-text answer.
  - Impact: determines context lifetime and whether scope factory pattern is needed.
  - Blocking: Yes.

## Skill Validation Criteria

- Phase A (interface extraction) must be completed and verified before Phase B (decoupling) begins.
- The adapter pattern is a valid intermediate step — it does not need to be removed before the skill is considered applied.
- The scope factory pattern is mandatory when Scoped services are needed inside Singleton entry points.
- Build must remain green at every intermediate step.
