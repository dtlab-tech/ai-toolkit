<a id="task-US-04-TASK-BE-09"></a>
### US-04-TASK-BE-09

- **Task ID:** US-04-TASK-BE-09
- **Title:** Add apply registry content builder
- **Outcome:** feature-split.js has a buildRegistryText helper that appends one defined entry per child with Parent, Depends on and a Detail link to its feature.md, without duplicating existing IDs. In initial mode it changes the parent entry in place to epic with the first-sentence Summary, the union of Keywords and a Detail link to epic.md. In late mode it recomputes the epic Keywords as the union over all children and leaves the Summary and the existing child entries unchanged.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01, INFRA-TASK-BE-06
- **Acceptance criteria:** AC-29, AC-30, AC-35, AC-39
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 15000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add apply registry content builder

**Implementation notes:**

**Target file:** `src/claude/scripts/feature-split.js`. Add `buildRegistryText` in the Registry section, after `renderEntry` and `firstSentence`, and before the UC-04 apply section. Add it to `module.exports`. This is an additive export; the existing exports stay unchanged.

**Registry format.** The verified `REGISTRY.md` format in the Tech-Spec excerpt uses an em dash: `## FTR-NNN — Title`. The design's ASSUMED colon form (`## FTR-NNN: Title`) is superseded. `renderEntry` (US-04-TASK-BE-01) must emit the em dash, and `parseRegistry` (INFRA-TASK-BE-04) must match `/^## (FTR-\d+) —/`. If either still uses the colon, this task's output will not round-trip against the live file. Do not write a colon variant here.

**Inputs and dependencies.** This task only builds text. It does not touch the filesystem, and the caller owns staging and commit. It uses these helpers, which must already exist:
- `renderEntry(e)` from US-04-TASK-BE-01 returns the entry's lines.
- `setField(block, key, value)` from US-04-TASK-BE-01 replaces a `**Key:**` line, or inserts one after the block's last `**Key:**` line.
- `findBlock`, `fieldOf`, `renderRegistry`, `firstSentence` and `fail` are already in the design.

**Signature:**

```javascript
// registry: the parsed registry from parseRegistry (not mutated)
// plan:     [{ id, name, keywords, summary, dir, deps }] in dependency order; deps are sibling IDs
// late:     true for late mode (one child, existing epic)
// returns:  the full REGISTRY.md text, ready for writeRegistryAtomically
function buildRegistryText({ registry, parentId, parentDirName, plan, late })
```

**Code:**

```javascript
const splitKeywords = (text) => (text || '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];

function buildRegistryText({ registry, parentId, parentDirName, plan, late }) {
  const reg = JSON.parse(JSON.stringify(registry));        // never mutate the caller's parse
  const parent = findBlock(reg, parentId);
  if (!parent) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`);

  // Keywords. Initial mode: union over the new children.
  // Late mode: union over every existing child entry of the parent, plus the new child.
  const existingChildKeywords = late
    ? reg.blocks
        .filter(b => b.id && fieldOf(b, 'Parent') === parentId)
        .flatMap(b => splitKeywords(fieldOf(b, 'Keywords')))
    : [];
  setField(parent, 'Keywords',
    uniq([...existingChildKeywords, ...plan.flatMap(p => p.keywords)]).join(', '));

  if (!late) {                                             // initial mode only
    setField(parent, 'Status', 'epic');
    setField(parent, 'Summary', firstSentence(fieldOf(parent, 'Summary') || ''));
    setField(parent, 'Detail', `[epic.md](./${parentDirName}/epic.md)`);
  }
  // Late mode leaves Summary and Status untouched.

  for (const p of plan) {
    if (findBlock(reg, p.id)) continue;                    // never duplicate an existing ID
    reg.blocks.push({ id: p.id, lines: ['', ...renderEntry({
      id: p.id, title: p.name, keywords: p.keywords, status: 'defined',
      summary: firstSentence(p.summary),
      detail: `./${p.dir}/feature.md`, detailLabel: 'feature.md',
      parent: parentId, dependsOn: p.deps,
    })] });
  }
  return renderRegistry(reg);
}
```

**Rewiring `apply`.** Replace the inline registry block in `apply` (step 3 of the design). The "before" is the run of lines from `const reg = JSON.parse(...)` through `const registryText = renderRegistry(reg);`. The "after" is one call:

```javascript
const registryText = buildRegistryText({
  registry, parentId, parentDirName: path.basename(parentDir), plan, late,
});
```

After this change, `apply` no longer references `fieldOf(parent, 'Keywords')` directly.

**Interpretation points to confirm in review:**
- Initial-mode epic Keywords are the union over the new children only. The parent's old Keywords are replaced. This follows the design's D-19 reading.
- Late-mode epic Keywords are the union over all child entries (`Parent:` equal to the epic ID) plus the new child. This follows the skeleton wording, "union over all children". It means an epic keyword that no child carries is dropped. If that is unwanted, add the existing epic Keywords to the union. This is a one-line change, but it contradicts "union over all children", so ask first.

**Do not** write the registry file, do not rename, and do not read `epic.md` in this helper.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js');if(typeof m.buildRegistryText!=='function')process.exit(1)"
```

```
npm test
```