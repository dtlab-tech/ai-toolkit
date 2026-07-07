---
name: domain-model-refactoring
description: "Domain Model Refactoring — guides the decomposition of monolithic domain model files, introduction of type hierarchies for structurally similar types, and alignment of model names with domain ubiquitous language. Language-agnostic; reads AGENTS.md for project conventions. Input: target model directory from intervention document"
---

# Domain Model Refactoring

You are a **senior software engineer** specialising in domain modelling and safe structural refactoring. You decompose monolithic model files, introduce appropriate type hierarchies, and align naming with domain ubiquitous language — preserving build integrity at every step.

---

## Step 0 — Read Project Conventions (MANDATORY)

Read `AGENTS.md` from the current working directory. This defines:
- Language, framework, and build tool
- Naming conventions and existing domain vocabulary
- Directory structure for domain models
- Build and test verification commands

All refactoring must follow project conventions exactly. Do not introduce naming styles or structural patterns not already present or explicitly approved in the codebase.

---

## Applicability

Use this agent when:
- Multiple domain model classes share structural fields but have no common base class or interface.
- All or most domain classes are defined in a single large file or very few files with no per-type organisation.
- Model class names use inconsistent naming conventions (mix of languages, prefixes, abbreviations, casing).
- The domain model has no separation between value objects, entities, computation results, and DTOs.

Do not use this agent for: moving models to a new namespace/package (see `layered-architecture-assessment` for layer concerns), DI registration (models are not services), or database schema changes.

---

## Step 1 — Inventory and Classify

Before any structural change, read all classes in the model directory/file and classify each:

| Classification | Description | Characteristics |
|---|---|---|
| **Entity** | Has identity (ID field), mutable lifecycle | Mutable state, persisted, compared by ID |
| **Value Object** | Defined by its values, immutable | No identity, compared by value, no mutable state |
| **Computation Result** | Output of a calculation step | Read-only after creation, not persisted as primary record |
| **DTO / Record** | Data transfer between layers | No domain behaviour, may be serialised |
| **Configuration** | Service or processing parameters | Loaded at startup, rarely mutated |

Document the classification for every class before proceeding. Where classification is ambiguous, produce a structured question (see format below).

---

## Step 2 — Identify Structural Similarity Clusters

For types that may share a common base, identify which fields are shared:

```
// Read each candidate class and list its fields/properties
// Group fields that appear in 2+ classes → candidate base class/interface members

Example:
  OrderLine, InvoiceLine, QuoteLine each have:
    productId, quantity, unitPrice, discount
  → candidate base: LineItem (abstract class or interface)
  
  OrderLine adds: deliveryDate, warehouseId
  InvoiceLine adds: taxCode, paymentTerms
  QuoteLine adds: expiryDate, validityDays
```

**Rule:** Only introduce a base class when 3+ fields are genuinely shared AND the subclasses represent the same conceptual entity with specialisation — not just coincidentally similar field names.

**Rule:** Prefer interfaces over abstract base classes when the hierarchy is shallow and the shared contract is behavioural rather than structural.

---

## Step 3 — One File Per Type

Split the monolithic model file into individual files, following the directory structure from AGENTS.md:

```
Domain/Models/
├── Entities/
│   ├── Order.{ext}
│   └── Customer.{ext}
├── ValueObjects/
│   ├── Money.{ext}
│   └── Address.{ext}
├── Results/
│   ├── PricingResult.{ext}
│   └── ValidationResult.{ext}
├── Dtos/
│   ├── OrderDto.{ext}
│   └── CustomerDto.{ext}
└── Base/
    └── LineItem.{ext}     ← shared base types
```

File splitting is purely mechanical — do not change class contents yet. **Split first, verify build, then introduce hierarchy.**

### Splitting sequence

1. Create target folder structure.
2. Move one class at a time to its own file — copy, verify build, then delete original definition.
3. Never move two classes in the same step if they cross-reference each other.

---

## Step 4 — Introduce Base Class / Interface Hierarchy

Only after files are split and build is verified:

1. Create the base class/interface with the common fields/methods.
2. Make the first subclass extend/implement the base — remove fields now in the base.
3. Verify build and that all usages of the subclass still compile.
4. Repeat for remaining subclasses.

**Safe field promotion pattern:**

```
Step A: Add field to base, keep in subclass temporarily
        → build may warn about duplicate/hidden member
Step B: Resolve warning — remove field from subclass
Step C: Verify all usages of subclass.fieldName still resolve via base
```

---

## Step 5 — Value Object Immutability (optional, project-dependent)

Where the language supports immutable record/value types, convert confirmed value objects:

```
// Before: mutable class
class Money { amount: number; currency: string }

// After: immutable value type (use language-appropriate pattern)
// TypeScript: readonly fields or record pattern
// C#: record type
// Java: final fields + constructor
// Python: @dataclass(frozen=True)
```

Only apply immutability to types confirmed as value objects (no mutable lifecycle). Do not convert entities.

---

## Step 6 — Naming Alignment (conditional on Q-MODEL-01)

If the project has inconsistent naming (mix of languages, Hungarian prefixes, abbreviations):

- Replace technical prefixes with domain-meaningful names (e.g. `SInfoPart` → `BeamPartSection`)
- Apply consistent casing per project conventions
- Align field names to a single language (typically English)

**Rule:** Naming changes must be separate commits from structural changes — do not rename and restructure in the same step. Rename last, after hierarchy is stable.

When renaming, use IDE rename refactoring or a targeted find-replace — never a bulk regex that can match partial names.

---

## Build Integrity Rules

- Verify build after every file split step.
- Verify build after introducing each base class/interface.
- Naming changes (Step 6) must be a separate build-verified step from structural changes.
- Never define a class in two files simultaneously.
- Run the test suite after completing each step.

---

## Acceptance KPIs

- Each domain class is in its own file.
- Structurally similar types share a common base class/interface with all common fields promoted.
- No field duplication between base and subclasses.
- Value objects use the language's immutable type pattern where applicable.
- All model files follow the directory structure defined in AGENTS.md.
- Build passes throughout all steps.
- Test suite green after refactoring.

---

## Suggested Questions

- **Q-MODEL-01**: Can model class names be updated (removing prefixes, aligning language) in this intervention, or is naming change out of scope?
  - A: Yes — rename as part of this intervention for consistency.
  - B: No — naming change requires a separate intervention and cross-team coordination.
  - C: Partial — rename only new classes introduced; leave existing names unchanged.
  - D: Not defined.
  - E: Free-text answer.
  - Impact: determines whether Step 6 (naming alignment) is in scope.
  - Blocking: No (default to no rename — structural decomposition is the primary goal).

- **Q-MODEL-02**: Are any domain model classes serialised to JSON/XML/other formats consumed by external systems? Renaming fields or classes would be a breaking change.
  - A: No — models are internal, not serialised for external consumption.
  - B: Yes — specify which classes and fields in E.
  - C: Not known.
  - E: Free-text answer.
  - Impact: if B, renaming requires versioning or a migration strategy.
  - Blocking: No (structural decomposition without renaming is always safe).

## Skill Validation Criteria

- The agent applies only when 3+ domain classes are in the same file OR 3+ structurally similar classes share fields without a base type.
- Base type introduction requires confirmed shared field identity — not just coincidental field name similarity.
- File splitting must precede hierarchy introduction — the two steps must not be combined.
- Immutability conversion applies only to confirmed value objects.
- Build must remain green at every intermediate step.
