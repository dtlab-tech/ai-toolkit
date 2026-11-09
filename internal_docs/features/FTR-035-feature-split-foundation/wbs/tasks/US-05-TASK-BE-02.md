<a id="task-US-05-TASK-BE-02"></a>
### US-05-TASK-BE-02

- **Task ID:** US-05-TASK-BE-02
- **Title:** Add and export register function
- **Outcome:** feature-split.js exports register({ featuresRoot, featureDir, keywords }). It reads the registry and appends one defined entry (caller Keywords, first-sentence Summary, Detail link to feature.md, no Parent or Depends on lines). It creates the registry if missing and writes it by temp-and-rename. For an existing entry with status defined, completed or epic it returns { id, status } with that status without writing, so register exits 0 and never adds a duplicate. For an entry with any other status it throws REGISTRY_STATUS and leaves the entry untouched.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-05-TASK-BE-01, INFRA-TASK-BE-04, INFRA-TASK-BE-05, US-04-TASK-BE-01
- **Acceptance criteria:** AC-37, AC-38, AC-39, AC-40, AC-42
- **Estimate — agent minutes:** 15
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add register function for standalone features

**Implementation notes:**

Add one exported function, `register`, to `src/claude/scripts/feature-split.js`. Place it in the UC-05 section, after `apply` and before the CLI facade. Add `register` to `module.exports`. Do not change `apply`, the facade, or the existing helpers.

Reuse the helpers that earlier tasks already provide. Do not re-implement them:
- `readFeatureForRegister(featureDir)` (US-05-TASK-BE-01) returns the feature ID, the title (first H1), and the first sentence of the Summary section. It throws `FEATURE_INVALID` or `PARENT_INVALID`. Destructure the fields using the names and return shape that BE-01 actually defines. The shape `{ id, title, summary }` below is an assumption that must be checked against BE-01.
- `readRegistryText`, `parseRegistry`, `findBlock`, `fieldOf`, `renderEntry`, `renderRegistry`, `firstSentence`, and `writeRegistryAtomically` (INFRA-TASK-BE-04/05, US-04-TASK-BE-01) are used as they are.

Code to add:

```javascript
function register({ featuresRoot, featureDir, keywords = [], runId = newRunId() }) {
  const { id, title, summary } = readFeatureForRegister(featureDir);   // US-05-TASK-BE-01
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);
  const text = readRegistryText(registryFile);                          // '' when missing (created on write)
  const reg = parseRegistry(text);
  if (text === '') reg.head = [];                                       // avoid a leading blank line in a new file

  const existing = findBlock(reg, id);
  if (existing) {
    const status = fieldOf(existing, 'Status');
    if (['defined', 'completed', 'epic'].includes(status)) return { id, status };   // no change, no duplicate (D-21); exit 0
    fail('REGISTRY_STATUS',
      `${id} is registered with status "${status}"; register will not change it`, { file: registryFile });
  }

  const rel = path.relative(featuresRoot, featureDir).split(path.sep).join('/');
  reg.blocks.push({ id, lines: ['', ...renderEntry({
    id, title, keywords, status: 'defined',
    summary,                                                            // already the first sentence
    detail: `./${rel}/feature.md`, detailLabel: 'feature.md',
    // no parent and no dependsOn, so renderEntry emits no Parent or Depends on lines
  })] });
  writeRegistryAtomically(registryFile, renderRegistry(reg), runId);    // temp-and-rename
  return { id, status: 'defined' };
}
```

Required behavior, mapped to the outcome:
- **Entry shape:** `renderEntry` emits `## FTR-NNN — Title`, `**Keywords:**`, `**Status:** defined`, `**Summary:**`, and `**Detail:** [feature.md](./<rel>/feature.md)`. It emits no `Parent` or `Depends on` lines because `parent` is unset.
- **No duplicate:** an existing entry with status `defined`, `completed` or `epic` returns `{ id, status }` with that existing status and the file is never written. It never throws `REGISTRY_STATUS` for these three statuses (Gate 1 decision, D-21).
- **Foreign status:** an existing entry with a status other than `defined`, `completed` or `epic` (for example `in-progress`) throws `REGISTRY_STATUS` and the file is never written (D-34). The earlier reading in which `completed` and `epic` also throw is superseded.
- **Missing registry:** `readRegistryText` returns `''`, and the write creates the file.
- **Atomic write:** `writeRegistryAtomically` writes `REGISTRY.md.tmp-<runId>` and renames it over `REGISTRY.md`. On failure it removes the temp file and rethrows. The previous registry stays intact.

Points to confirm with the host:
1. **Heading separator.** The Tech-Spec component line says the verified format is `## FTR-NNN — Title` with an em dash. The inline design code uses a colon (`## FTR-NNN: Title`) and calls its format ASSUMED. This task follows the verified em-dash form. `parseRegistry` (its ID match) and `renderEntry` (its heading) must use the same separator. Confirm against the live `REGISTRY.md` before merging.
2. **Error codes.** Input validation (missing feature.md, missing title or Summary, bad folder prefix, or epic.md present) belongs to `readFeatureForRegister`. Do not add the design's inline `FEATURE_ID_INVALID`, `FEATURE_TITLE_MISSING`, or `FEATURE_UNREADABLE` checks here. The codes come from BE-01.

Estimate: about 15 minutes. It is one function plus an export, reusing existing helpers, with one short unit-test pass.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); if (typeof m.register !== 'function') { console.error('register is not exported'); process.exit(1); }"
```

```
npx jest tests/scripts/feature-split.test.js -t register
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```