<a id="task-US-04-TASK-BE-11"></a>
### US-04-TASK-BE-11

- **Task ID:** US-04-TASK-BE-11
- **Title:** Wire and export apply orchestration
- **Outcome:** feature-split.js exports apply({ featuresRoot, parentId, proposal }). It runs the pre-checks of US-04-TASK-BE-06, builds the plan for the selected mode, renders the documents and the registry text, calls the commit routine of US-04-TASK-BE-10, which removes staging, and returns { epic, children: [{ id, dir }], registry: true }, plus a warnings array only when removing staging failed.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-03, US-04-TASK-BE-04, US-04-TASK-BE-07, US-04-TASK-BE-08, US-04-TASK-BE-09, US-04-TASK-BE-10
- **Acceptance criteria:** AC-21, AC-36
- **Estimate — agent minutes:** 20
- **Estimate — tokens:** 25000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** wire apply orchestration

**Implementation notes:**

Scope. This task adds the `apply` function to `src/claude/scripts/feature-split.js` and exports it. It is the orchestrator. It calls helpers from sibling tasks and does not re-implement them: `slugOf`, `normaliseChild`, `validateProposal`, `dependencyOrder` (BE-03 and earlier), `parseRegistry`, `findBlock`, `fieldOf`, `setField`, `renderEntry`, `renderRegistry`, `firstSentence` (BE-04 and BE-09), `allocateIds` (BE-02), `renderChildDoc` (BE-03), `renderEpic`, `lastEpicRows` (BE-04), `insertLateRow` (BE-05), and the commit and rollback engine (BE-10). The body below is the Tech-Spec `apply` reference, with the decisions listed below. It runs in this order: pre-checks, plan, render, commit, cleanup.

Decisions (Gate 1 review, 2026-11-04). Use these; they are not open:

1. **Registry heading format.** The registry uses the em dash form `## FTR-NNN — Title` (checked against the live `internal_docs/features/REGISTRY.md`). Use the single heading constant from US-04-TASK-BE-04, for example `const HEADING = /^## (FTR-\d+) — /`, for both parsing and rendering. The colon form in the reference body below is wrong and must not be used.
2. **Pre-checks.** Use the replacement block of US-04-TASK-BE-06 unchanged: `assertProposalShape`, `assertNoStagingLeftovers` (INFRA-TASK-BE-07, error code `STAGING_LEFTOVER`), `detectMode`, the registry status check and `isNewFeature`. Do not inline another scan. `STALE_STAGING` no longer exists.
3. **Commit routine.** Call `commitStaged` from US-04-TASK-BE-10 and do not inline the journal, the rollback or the staging cleanup. The error code is `ROLLBACK_FAILED` (`ROLLBACK_INCOMPLETE` is superseded). Staging cleanup after a commit returns a warning and never throws.
4. **Late-mode row insertion.** Use BE-05's `insertLateRow` and not an inline `replace`.
5. **Parent req/ and spec/.** In initial mode, add the moves of the parent's `req/` and `spec/` folders (when they exist) into `<staging>/parent-backup/` to the `moves` list, as shown in step 4. The parent folder then ends with `epic.md` only.

Also: normalise every child with `normaliseChild` in both modes, so a raw stdin proposal without `dependsOn` or `keywords` still works. Guard late mode against an epic with no child rows.

```javascript
function apply({ featuresRoot, parentId, proposal, runId = newRunId() }) {
  const staging = path.join(featuresRoot, `${STAGING_PREFIX}${runId}`);
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);

  // 1. Pre-checks. Nothing has been moved yet. Use the replacement block of
  //    US-04-TASK-BE-06 here, unchanged. It defines registry, parentBlock, parentDir, mode and late.

  // 2. Plan: resolve children, dependencies, IDs and directory names.
  let children, epicText = null, originalFeature = null, rows = [], lateDeps = null;
  if (late) {
    if (proposal.children.length !== 1) fail('LATE_CHILD_COUNT', 'A late child is exactly one child');
    epicText = fs.readFileSync(path.join(parentDir, 'epic.md'), 'utf8');
    rows = lastEpicRows(epicText);
    if (!rows.length) fail('PARENT_INVALID', `epic.md for ${parentId} has no child rows`);
    const declared = normaliseChild(proposal.children[0]).dependsOn;
    children = [{ ...normaliseChild(proposal.children[0]), dependsOn: [] }];
    validateProposal({ ...proposal, children, sharedFoundationOwner: null }, { checkMin: false });
    lateDeps = declared.length
      ? declared.map(n => {
          const r = rows.find(x => x.name === n);
          if (!r) fail('DEPENDS_ON_INVALID', `Unknown epic child ${n}`);
          return r.id;
        })
      : [rows[rows.length - 1].id];                                      // D-16 default
  } else {
    validateProposal(proposal);                                          // includes minChildren
    children = proposal.children.map(normaliseChild);
    originalFeature = fs.readFileSync(path.join(parentDir, 'feature.md'), 'utf8');
  }
  const order = dependencyOrder(children);
  const ids = allocateIds(featuresRoot, registry, order.length);
  const idOf = new Map(order.map((c, i) => [c.name, ids[i]]));
  const owner = late ? null : proposal.sharedFoundationOwner;
  const plan = order.map((c, i) => ({
    ...c, id: ids[i], dir: `${ids[i]}-${slugOf(c.name)}`,
    checkpoint: late ? 'late' : proposal.source,
    deps: late ? lateDeps : c.dependsOn.map(d => idOf.get(d)),
    owner: c.name === owner,
  }));
  for (const p of plan)
    if (fs.existsSync(path.join(featuresRoot, p.dir)))
      fail('CHILD_DIR_EXISTS', `${p.dir} already exists`);               // never overwritten

  // 3. Render every file in memory before anything is written.
  const total = late ? rows.length + 1 : plan.length;
  const childDocs = plan.map((p, i) => ({
    dir: p.dir,
    text: renderChildDoc(p, {
      parentId, position: late ? total : i + 1, total,
      foundationNote: proposal.foundationNote ?? '',
    }),
  }));
  const newRows = plan.map((p, i) => ({
    order: late ? total : i + 1, id: p.id, name: p.name, dir: p.dir,
    checkpoint: p.checkpoint, deps: p.deps, owner: p.owner,
  }));
  const epicOut = late
    ? insertLateRow(epicText, newRows[0])
    : renderEpic({
        parentId,
        title: (originalFeature.match(/^# (.+)$/m) || [])[1] || parentId,
        rows: newRows, originalText: originalFeature,
      });

  const reg = JSON.parse(JSON.stringify(registry));
  const parent = findBlock(reg, parentId);
  const keywords = [...new Set([
    ...(late ? (fieldOf(parent, 'Keywords') || '').split(/,\s*/) : []),  // late: extend, not replace
    ...plan.flatMap(p => p.keywords),
  ])].filter(Boolean);
  setField(parent, 'Keywords', keywords.join(', '));
  if (!late) {
    setField(parent, 'Status', 'epic');
    setField(parent, 'Summary', firstSentence(fieldOf(parent, 'Summary') || ''));
    setField(parent, 'Detail', `[epic.md](./${path.basename(parentDir)}/epic.md)`);
  }
  for (const p of plan) reg.blocks.push({ id: p.id, lines: ['', ...renderEntry({
    id: p.id, title: p.name, keywords: p.keywords, status: 'defined',
    summary: firstSentence(p.summary), detail: `./${p.dir}/feature.md`, detailLabel: 'feature.md',
    parent: parentId, dependsOn: p.deps,
  })] });
  const registryText = renderRegistry(reg);

  // 4. Commit: US-04-TASK-BE-10's commitStaged stages the files, moves them with a journal, writes
  //    the registry last, rolls back on any failure (ROLLBACK_FAILED if a reverse rename fails) and,
  //    after a successful commit, removes staging and the parent-backup inside it.
  const moves = [
    ...plan.map(p => ({ from: path.join(staging, p.dir), to: path.join(featuresRoot, p.dir) })),
    late
      ? { from: path.join(parentDir, 'epic.md'), to: path.join(staging, 'epic.previous.md') }
      : { from: path.join(parentDir, 'feature.md'), to: path.join(staging, 'feature.original.md') },
    ...(late ? [] : ['req', 'spec']
      .filter(name => fs.existsSync(path.join(parentDir, name)))
      .map(name => ({ from: path.join(parentDir, name), to: path.join(staging, 'parent-backup', name) }))),
    { from: path.join(staging, 'epic.md'), to: path.join(parentDir, 'epic.md') },
  ];
  const warnings = commitStaged({
    featuresRoot, staging, runId, registryFile, registryText, moves,
    stageFiles: [
      ...childDocs.map(d => ({ rel: path.join(d.dir, 'feature.md'), text: d.text })),
      { rel: 'epic.md', text: epicOut },
    ],
  });

  return {
    epic: parentId,
    children: plan.map(p => ({ id: p.id, dir: p.dir })),
    registry: true,
    ...(warnings.length ? { warnings } : {}),
  };
}
```

Exports: `module.exports` must include `apply`. The verification section below checks that it is a function.

Known limit of this task: the orchestration body depends on helper signatures from BE-03 to BE-10. The Tech-Spec does not fix `insertLateRow(epicText, row)`, so its signature is assumed from BE-05's outcome. If BE-05 differs, adjust the single call site and nothing else.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); if (typeof m.apply !== 'function') { console.error('apply not exported'); process.exit(1); }"
```

```
npm test -- --testPathIgnorePatterns="node_modules|workflow-runtime"
```