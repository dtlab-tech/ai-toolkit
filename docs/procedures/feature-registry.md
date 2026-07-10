# Procedure: Feature Registry

`docs/features/REGISTRY.md` is a cross-feature index maintained by the Project Manager.

## Entry format

```markdown
## {PREFIX} — {Title}
**Keywords:** keyword1, keyword2, keyword3, ...
**Status:** in-progress | completed
**Summary:** 4–5 lines. What was built, which entities/endpoints were introduced,
which shared infrastructure was added (e.g. auth middleware, base components),
and any constraints or decisions that affect future features.
→ [Detail]({PREFIX}-{slug}/feature.md)
```

## File structure

```markdown
# Feature Registry

This file is maintained automatically by the Project Manager.
Each entry summarises a feature for cross-reference by future features.

---

## FTR-001 — ...
...

---

## FTR-002 — ...
...
```

## Cross-reference analysis

When starting a new feature, check each registry entry for:
- **OVERLAP** — same domain, entities, or user flows
- **DEPENDENCY** — requires something delivered by an existing feature
- **CONFLICT** — contradicts existing business rules or data models

Show findings to the user before executing the plan. If conflicts are found, use `AskUserQuestion` before continuing.

## Rules

- **Max 5 lines for Summary** — brevity is the point
- **Keywords must be specific** — avoid generic terms like "feature", "user", "data"
- **Append-only** — never delete existing entries; only update `Status` from `in-progress` to `completed`
- **Set Status to `completed`** when the PR is successfully created
