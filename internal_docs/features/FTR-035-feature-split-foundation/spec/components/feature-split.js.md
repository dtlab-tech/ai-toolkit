# src/claude/scripts/feature-split.js — New

## Change

Domain: BE. Addresses: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42.

This is a new CommonJS module with Node built-ins only (D-01). It exports `FeatureSplitError`, `loadConfig` (UC-01, D-02 to D-05), `isNewFeature` (UC-02, D-07), `isOverThreshold` and `meetsMinimum` (D-05), `buildProposal` and `editProposal` (UC-03, D-08 to D-12), and `apply` and `register` (UC-04, UC-05, D-13 to D-21). Its CLI entry point is `main(argv)`, run as `run-asset scripts/feature-split.js --project <root> -- <command> [options]` (D-23). The CLI writes one JSON object to stdout and exits 0 on success or 1 on error. `apply` reads the proposal from stdin. The script never hard-codes a features path: the caller passes `--features-root`, obtained from `ai-toolkit resolve-features-root` (D-22). Other design decisions made where feature.md is silent or where the Requirements gaps required one:
- **Project root.** `loadConfig({ projectRoot })` takes the root explicitly. The library callers (FTR-036 and FTR-037) pass it. The toolkit default is located with `__dirname`.
- **Malformed override.** Invalid JSON or an unreadable override raises `CONFIG_INVALID_JSON` or `CONFIG_OVERRIDE_UNREADABLE`, naming the file, following D-04.
- **Unreadable feature folder.** `isNewFeature` distinguishes `ENOENT` (new) from any other failure, which raises `FEATURE_UNREADABLE`. `existsSync` is not used because it would hide permission errors.
- **Tie-break.** Dependency order is a stable topological sort. Among children that are ready at the same time, proposal order decides. The first child in this order is the BR-03 owner reference for the foundation warning.
- **Late mode.** `apply` is in late mode when the parent folder already holds `epic.md`. Late mode takes exactly one child, places it last, and sets its checkpoint to `late` (D-16). Otherwise each child's checkpoint is `proposal.source`. In late mode the `minChildren` check does not apply, and `dependsOn` defaults to the previous last child.
- **Ordering of checks.** `apply` refuses before any file is moved if a `.split-staging-*` directory already exists, if the parent has no registry entry, or if the parent is not new (split mode only).
- **Epic entry.** The epic entry's Detail link points to `epic.md`, not to the removed parent `feature.md`.
- **Shared-foundation content.** The child named by `sharedFoundationOwner` receives the foundation note. For an unedited proposal this is the first child, as D-15 says.
- **Registry format.** The parser and renderer assume the format in the open gaps below.
- **Output.** `apply` returns `epic` as the parent ID. The `epic.md` path is `<parentDir>/epic.md`.

Writes are staged and then committed. `apply` writes the child folders and `epic.md` to `<featuresRoot>/.split-staging-<runId>`, then moves them into place with renames and journals each move. The parent `feature.md` is moved into staging (not deleted) so it can be restored. The registry is written last, using temp-and-rename. Any failure before the registry commit triggers a reverse replay of the journal and removes staging. If a reverse rename fails, the run ends with `ROLLBACK_INCOMPLETE` listing the paths that remain, and staging is kept so the backups survive. Staging is removed after the commit. If that removal fails, the error `STAGING_CLEANUP_FAILED` is reported, and the rollback journal is not replayed because the run is already committed.

**Open gaps for the host (not decided by feature.md or the excerpt):**
1. **Registry format (blocking).** The registry parser and renderer assume the ASSUMED format (`## FTR-NNN: Title` headings, `**Key:** value` lines, entries separated by blank lines, line-ending preserved). This must be confirmed against the live `REGISTRY.md` before implementation. Until then, no registry code is final.
2. **Parent without registry entry (UC-04 step 8b).** The design refuses with `PARENT_NOT_REGISTERED` before any move. Confirm at Gate 1, or choose to create the epic entry instead.
3. **Generated `req/` and `spec/` in the parent folder.** `apply` leaves them untouched and moves only `feature.md`. This does not literally satisfy D-14's "the parent folder holds only `epic.md`". Decide at Gate 1.
4. **Stale staging from a crashed run.** The design refuses with `STALE_STAGING` and lists the leftover paths. It never deletes directories it did not create. Tech-Spec Section 12 must be aligned with this.
5. **Epic entry Detail target.** Set to `epic.md`. This is a design choice that AC-25 must accept.
6. **Late-mode signal.** Late mode is inferred from the presence of `epic.md` in the parent folder. This is a design choice that UC-04 and D-16 must adopt.

## Service Interface

```javascript
'use strict';
// src/claude/scripts/feature-split.js — CommonJS, Node built-ins only (D-01)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_NAME = 'feature-split.config.json';
const DEFAULT_CONFIG = path.join(__dirname, CONFIG_NAME);
const REGISTRY_NAME = 'REGISTRY.md';
const STAGING_PREFIX = '.split-staging-';
const SHAPE = {                                   // D-02, exact key names
  thresholds: ['useCases', 'acceptanceCriteria', 'components', 'estimatedPhases'],
  definitionSignals: ['minActors', 'minApplications', 'minFlows'],
};
const TOP_KEYS = ['thresholds', 'definitionSignals', 'minChildren'];

class FeatureSplitError extends Error {           // D-04
  constructor(code, message, { key = null, file = null } = {}) {
    super(message);
    this.name = 'FeatureSplitError';
    this.code = code; this.key = key; this.file = file;
  }
}
const fail = (code, message, extra) => { throw new FeatureSplitError(code, message, extra); };

// ---------- UC-01 configuration (D-02 to D-05) ----------
function readConfigFile(file, required) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;      // D-03: missing override is fine
    fail(required ? 'CONFIG_DEFAULT_UNREADABLE' : 'CONFIG_OVERRIDE_UNREADABLE',
      `Cannot read ${file} (${err.code})`, { file });
  }
  try { return JSON.parse(text); }
  catch { fail('CONFIG_INVALID_JSON', `Invalid JSON in ${file}`, { file }); }
}

function checkValue(value, key, file) {
  if (!Number.isInteger(value) || value < 0)
    fail('CONFIG_INVALID_VALUE', `${key} in ${file} must be a non-negative integer`, { key, file });
}

function validateConfig(obj, file, partial) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj))
    fail('CONFIG_INVALID_VALUE', `${file} must contain a JSON object`, { file });
  for (const k of Object.keys(obj))
    if (!TOP_KEYS.includes(k)) fail('CONFIG_UNKNOWN_KEY', `Unknown key ${k} in ${file}`, { key: k, file });
  for (const [section, keys] of Object.entries(SHAPE)) {
    if (obj[section] === undefined) {
      if (partial) continue;
      fail('CONFIG_INVALID_VALUE', `Missing ${section} in ${file}`, { key: section, file });
    }
    if (obj[section] === null || typeof obj[section] !== 'object')
      fail('CONFIG_INVALID_VALUE', `${section} must be an object in ${file}`, { key: section, file });
    for (const k of Object.keys(obj[section]))
      if (!keys.includes(k)) fail('CONFIG_UNKNOWN_KEY', `Unknown key ${section}.${k} in ${file}`, { key: `${section}.${k}`, file });
    for (const k of Object.keys(obj[section])) checkValue(obj[section][k], `${section}.${k}`, file);
    if (!partial) for (const k of keys)
      if (obj[section][k] === undefined) fail('CONFIG_INVALID_VALUE', `Missing ${section}.${k} in ${file}`, { key: `${section}.${k}`, file });
  }
  if (obj.minChildren === undefined) {
    if (!partial) fail('CONFIG_INVALID_VALUE', `Missing minChildren in ${file}`, { key: 'minChildren', file });
  } else checkValue(obj.minChildren, 'minChildren', file);
}

function loadConfig({ projectRoot = process.cwd(), defaultFile = DEFAULT_CONFIG } = {}) {
  const base = readConfigFile(defaultFile, true);
  validateConfig(base, defaultFile, false);
  const overrideFile = path.join(projectRoot, CONFIG_NAME);
  const override = readConfigFile(overrideFile, false);
  if (override !== undefined) validateConfig(override, overrideFile, true);
  const o = override || {};
  return {
    thresholds: { ...base.thresholds, ...o.thresholds },
    definitionSignals: { ...base.definitionSignals, ...o.definitionSignals },
    minChildren: o.minChildren !== undefined ? o.minChildren : base.minChildren,
  };
}

// D-05: two named comparison rules, used by every caller
const isOverThreshold = (count, threshold) => count > threshold;   // checkpoint 2: strictly greater
const meetsMinimum = (count, minimum) => count >= minimum;         // checkpoint 1: at least N

// ---------- UC-02 isNewFeature (D-07) ----------
function isNewFeature(featureDir) {
  let entries;
  try {
    fs.statSync(featureDir);
    entries = fs.readdirSync(featureDir);
  } catch (err) {
    if (err.code === 'ENOENT') return { isNew: true, reason: 'not-created' };
    fail('FEATURE_UNREADABLE', `Cannot read ${featureDir} (${err.code})`, { file: featureDir });
  }
  const prefix = (path.basename(featureDir).match(/^[A-Z]+-\d+/) || [])[0];
  if (entries.includes('epic.md')) return { isNew: false, reason: 'epic' };
  if (prefix && entries.includes(`${prefix}-Approvals.md`)) return { isNew: false, reason: 'approvals' };
  if (entries.includes('wbs') && fs.statSync(path.join(featureDir, 'wbs')).isDirectory())
    return { isNew: false, reason: 'wbs' };
  return { isNew: true, reason: 'no-markers' };           // req/ and spec/ do not count (D-07)
}

// ---------- UC-03 proposal (D-08 to D-12) ----------
const slugOf = (name) => String(name).trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normaliseChild(c) {
  return {
    name: c.name,
    purpose: c.purpose ?? '',
    summary: c.summary ?? c.purpose ?? '',                // D-11: Summary is the one-line purpose
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    dependsOn: Array.isArray(c.dependsOn) ? c.dependsOn : [],
    assigned: c.assigned ?? '',
  };
}

// Stable topological sort. Ties go to proposal order (Requirements UC-03 tie-break).
function dependencyOrder(children) {
  const placed = new Set(), order = [], remaining = [...children];
  while (remaining.length) {
    const i = remaining.findIndex(c => c.dependsOn.every(d => placed.has(d)));
    if (i === -1) fail('PROPOSAL_CYCLE', 'Dependencies between children form a cycle');
    const [next] = remaining.splice(i, 1);
    placed.add(next.name); order.push(next);
  }
  return order;
}

function foundationWarnings(p, order) {                   // D-10, BR-03
  if (p.sharedFoundationOwner === order[0].name) return [];
  return [{
    code: 'FOUNDATION_NOT_FIRST',
    message: `BR-03 is broken: the shared foundation is assigned to ${p.sharedFoundationOwner ?? 'no child'}, `
      + `not to the first child in dependency order (${order[0].name}). Children before the owner are built `
      + `without the foundation.`,
  }];
}

function validateProposal(p, { checkMin = true } = {}) {
  if (!['definition', 'measured'].includes(p.source))
    fail('PROPOSAL_SOURCE_INVALID', 'source must be "definition" or "measured"');
  if (checkMin && p.children.length < p.minChildren)                        // D-09
    fail('TOO_FEW_CHILDREN', `${p.children.length} children; minimum is ${p.minChildren}`);
  const names = new Set(), slugs = new Set();
  for (const c of p.children) {
    if (typeof c.name !== 'string' || !slugOf(c.name))                     // D-12
      fail('CHILD_NAME_INVALID', `Child name ${JSON.stringify(c.name)} does not yield a folder slug`);
    const slug = slugOf(c.name);
    if (names.has(c.name) || slugs.has(slug))
      fail('CHILD_NAME_DUPLICATE', `Two children resolve to slug "${slug}"`);
    names.add(c.name); slugs.add(slug);
  }
  for (const c of p.children) for (const d of c.dependsOn)
    if (!names.has(d) || d === c.name)
      fail('DEPENDS_ON_INVALID', `${c.name} depends on unknown or self child "${d}"`);
  if (p.sharedFoundationOwner !== null && !names.has(p.sharedFoundationOwner))
    fail('OWNER_INVALID', `Shared-foundation owner "${p.sharedFoundationOwner}" is not a child`);
  dependencyOrder(p.children);
}

function buildProposal({ source, children, sharedFoundationOwner, foundationNote = '', config }) {
  const list = children.map(normaliseChild);
  const proposal = {
    source, children: list,
    sharedFoundationOwner: null, foundationNote, minChildren: config.minChildren,
  };
  validateProposal(proposal);
  const order = dependencyOrder(list);
  proposal.sharedFoundationOwner = sharedFoundationOwner === undefined ? order[0].name : sharedFoundationOwner;
  validateProposal(proposal);
  return { proposal, warnings: foundationWarnings(proposal, order) };
}

// Edits work on a copy. A refused edit leaves the caller's proposal unchanged (D-09).
// op: rename | set | reorder | owner | add | remove | merge
function editProposal(proposal, op) {
  const next = JSON.parse(JSON.stringify(proposal));
  const byName = (n) => {
    const c = next.children.find(x => x.name === n);
    if (!c) fail('CHILD_NOT_FOUND', `No child named "${n}"`);
    return c;
  };
  const relink = (from, to) => {                          // rewrite references to a renamed/merged child
    for (const c of next.children) c.dependsOn = [...new Set(c.dependsOn.map(d => d === from ? to : d))].filter(d => d !== c.name);
    if (next.sharedFoundationOwner === from) next.sharedFoundationOwner = to;
  };
  switch (op.type) {
    case 'rename': byName(op.from).name = op.to; relink(op.from, op.to); break;
    case 'set':
      if (!['purpose', 'summary', 'keywords', 'assigned', 'dependsOn'].includes(op.field))
        fail('EDIT_FIELD_INVALID', `Field ${op.field} cannot be edited`);
      byName(op.name)[op.field] = op.value; break;
    case 'reorder':                                        // op.names must be a permutation of the children
      next.children = op.names.map(byName); break;
    case 'owner': next.sharedFoundationOwner = op.name ?? null; break;   // may be null
    case 'add': next.children.push(normaliseChild(op.child)); break;
    case 'remove':
      next.children = next.children.filter(c => c.name !== op.name);
      for (const c of next.children) c.dependsOn = c.dependsOn.filter(d => d !== op.name);
      if (next.sharedFoundationOwner === op.name) next.sharedFoundationOwner = null;
      break;
    case 'merge': {
      const group = op.names.map(byName);
      const merged = {
        name: op.into, purpose: group[0].purpose, summary: group[0].summary,
        keywords: [...new Set(group.flatMap(c => c.keywords))],
        dependsOn: [...new Set(group.flatMap(c => c.dependsOn))].filter(d => !op.names.includes(d)),
        assigned: group.map(c => c.assigned).filter(Boolean).join('; '),
      };
      const at = next.children.findIndex(c => op.names.includes(c.name));
      next.children = next.children.filter(c => !op.names.includes(c.name));
      next.children.splice(at, 0, merged);
      for (const n of op.names) if (n !== op.into) relink(n, op.into);
      break;
    }
    default: fail('EDIT_UNKNOWN', `Unknown edit ${op.type}`);
  }
  validateProposal(next);                                  // includes the minChildren check (D-09)
  return { proposal: next, warnings: foundationWarnings(next, dependencyOrder(next.children)) };
}

// ---------- Registry (D-18 to D-21) ----------
// ASSUMED format, to be confirmed against the live REGISTRY.md before implementation:
// "## FTR-NNN: Title" headings followed by "**Key:** value" lines, entries separated by blank lines.
// Blocks are kept verbatim, so untouched entries (including unknown statuses) are byte-identical.
function parseRegistry(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const head = [], blocks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const m = line.match(/^## (FTR-\d+):/);
      current = { id: m ? m[1] : null, lines: [line] };
      blocks.push(current);
    } else (current ? current.lines : head).push(line);
  }
  return { eol, head, blocks };
}
const renderRegistry = (r) => [...r.head, ...r.blocks.flatMap(b => b.lines)].join(r.eol);
const findBlock = (r, id) => r.blocks.find(b => b.id === id);
const fieldOf = (block, key) => {
  const m = block.lines.join('\n').match(new RegExp(`^\\*\\*${key}:\\*\\*\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
// Replaces the field line, or inserts it after the last "**Key:**" line of the block.
function setField(block, key, value) { /* replace or insert; see Change */ }

function renderEntry(e) {
  const lines = [
    `## ${e.id}: ${e.title}`, '',
    `**Keywords:** ${e.keywords.join(', ')}`,
    `**Status:** ${e.status}`,
    `**Summary:** ${e.summary}`,
    `**Detail:** [${e.detailLabel}](${e.detail})`,
  ];
  if (e.parent) lines.push(`**Parent:** ${e.parent}`, `**Depends on:** ${e.dependsOn.length ? e.dependsOn.join(', ') : 'none'}`);
  return lines;
}

const firstSentence = (text) => {
  const t = text.trim().replace(/\s+/g, ' ');
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
};

function readRegistryText(file) {                          // missing registry is created (D-21)
  try { return fs.readFileSync(file, 'utf8'); }
  catch (err) {
    if (err.code === 'ENOENT') return '';
    fail('REGISTRY_UNREADABLE', `Cannot read ${file} (${err.code})`, { file });
  }
}

function writeRegistryAtomically(file, text, runId) {     // D-21: temp-and-rename, last step
  const tmp = `${file}.tmp-${runId}`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

// ---------- UC-04 apply (D-13, D-14, D-16, D-19, D-24) ----------
const newRunId = () => crypto.randomBytes(4).toString('hex');

function allocateIds(featuresRoot, registry, count) {  // BR-02: next free from registry ∪ folders
  const used = registry.blocks.map(b => b.id).filter(Boolean);
  const dirs = fs.readdirSync(featuresRoot).map(n => (n.match(/^(FTR-\d+)/) || [])[1]).filter(Boolean);
  let next = Math.max(0, ...[...used, ...dirs].map(id => parseInt(id.slice(4), 10))) + 1;
  return Array.from({ length: count }, () => `FTR-${String(next++).padStart(3, '0')}`);
}

function findParentDir(featuresRoot, parentId) {
  const hit = fs.readdirSync(featuresRoot).find(n => n === parentId || n.startsWith(`${parentId}-`));
  if (!hit) fail('PARENT_NOT_FOUND', `No folder for ${parentId} under ${featuresRoot}`);
  return path.join(featuresRoot, hit);
}

function lastEpicRows(epicText) {                          // split table rows of an existing epic.md
  const head = epicText.split(/^## Original feature text\s*$/m)[0];
  return head.split(/\r?\n/)
    .filter(l => /^\|/.test(l) && !/^\|\s*Order/.test(l) && !/^\|-/.test(l))
    .map(l => {
      const c = l.split('|').slice(1, -1).map(s => s.trim());
      return { order: +c[0], id: c[1], name: c[2], dir: c[3], checkpoint: c[4],
        deps: c[5] === 'none' ? [] : c[5].split(',').map(s => s.trim()), owner: c[6] === 'yes' };
    });
}

function renderChildDoc(p, ctx) {                          // D-15
  return [
    `# ${p.name}`, '',
    '## Feature ID', p.id, '',
    '## Parent epic', `${ctx.parentId}. Position ${ctx.position} of ${ctx.total} in the dependency order.`, '',
    '## Summary', p.summary, '',
    '## Dependencies', `Depends on: ${p.deps.length ? p.deps.join(', ') : 'none'}`, '',
    '## Assigned parts', p.assigned, '',
    ...(p.owner ? ['## Shared foundation', ctx.foundationNote, ''] : []),
  ].join('\n');
}

function renderEpic({ parentId, title, rows, originalText }) {  // D-14
  return [
    `# ${title} — epic`, '', '## Feature ID', parentId, '', '## Split table', '',
    '| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.order} | ${r.id} | ${r.name} | ${r.dir} | ${r.checkpoint} | ${r.deps.join(', ') || 'none'} | ${r.owner ? 'yes' : 'no'} |`),
    '', '## Original feature text', '', originalText,
  ].join('\n');
}

function rollback(journal, staging, cause) {
  const stuck = [];
  for (const step of [...journal].reverse()) {
    try { fs.renameSync(step.to, step.from); } catch { stuck.push(step.to); }
  }
  if (stuck.length === 0) {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch { stuck.push(staging); }
  }
  if (stuck.length) fail('ROLLBACK_INCOMPLETE',
    `Run failed (${cause.message}); rollback left these paths: ${stuck.join(', ')}`);
  throw cause;
}

function apply({ featuresRoot, parentId, proposal, runId = newRunId() }) {
  const staging = path.join(featuresRoot, `${STAGING_PREFIX}${runId}`);
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);

  // 1. Pre-checks: nothing has been moved yet.
  const stale = fs.readdirSync(featuresRoot).filter(n => n.startsWith(STAGING_PREFIX));
  if (stale.length) fail('STALE_STAGING', `Staging left by an earlier run: ${stale.join(', ')}`);
  const registry = parseRegistry(readRegistryText(registryFile));
  const parentBlock = findBlock(registry, parentId);
  if (!parentBlock) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`);
  const parentDir = findParentDir(featuresRoot, parentId);
  const late = fs.existsSync(path.join(parentDir, 'epic.md'));          // late mode (D-16)
  if (!late && !isNewFeature(parentDir).isNew) fail('PARENT_NOT_NEW', `${parentId} has approvals or a WBS`);

  // 2. Resolve children, dependencies and IDs.
  let children, epicText, originalFeature;
  if (late) {
    if (proposal.children.length !== 1) fail('LATE_CHILD_COUNT', 'A late child is exactly one child');
    epicText = fs.readFileSync(path.join(parentDir, 'epic.md'), 'utf8');
    const rows = lastEpicRows(epicText);
    const declared = proposal.children[0].dependsOn;
    children = [{ ...normaliseChild(proposal.children[0]), dependsOn: [] }];
    validateProposal({ ...proposal, children, sharedFoundationOwner: null }, { checkMin: false });
    var lateDeps = declared.length
      ? declared.map(n => { const r = rows.find(x => x.name === n); if (!r) fail('DEPENDS_ON_INVALID', `Unknown epic child ${n}`); return r.id; })
      : [rows[rows.length - 1].id];                                   // D-16: after the previous last child
  } else {
    validateProposal(proposal);                                        // includes minChildren
    children = proposal.children;
    originalFeature = fs.readFileSync(path.join(parentDir, 'feature.md'), 'utf8');
  }
  const order = dependencyOrder(children);
  const ids = allocateIds(featuresRoot, registry, order.length);
  const idOf = new Map(order.map((c, i) => [c.name, ids[i]]));
  const owner = late ? null : proposal.sharedFoundationOwner;
  const plan = order.map((c, i) => ({
    ...c, id: ids[i],
    dir: `${ids[i]}-${slugOf(c.name)}`,
    checkpoint: late ? 'late' : proposal.source,
    deps: late ? lateDeps : c.dependsOn.map(d => idOf.get(d)),
    owner: c.name === owner,
  }));
  for (const p of plan)
    if (fs.existsSync(path.join(featuresRoot, p.dir))) fail('CHILD_DIR_EXISTS', `${p.dir} already exists`);  // D-13/D-17

  // 3. Build every file's content in memory.
  const childDocs = plan.map((p, i) => ({ dir: p.dir, text: renderChildDoc(p, {
    parentId, position: late ? (lastEpicRows(epicText).length + 1) : i + 1,
    total: late ? lastEpicRows(epicText).length + 1 : plan.length,
    foundationNote: proposal.foundationNote,
  }) }));
  const newRows = plan.map((p, i) => ({ order: i + 1, id: p.id, name: p.name, dir: p.dir,
    checkpoint: p.checkpoint, deps: p.deps, owner: p.owner }));
  const epicOut = late
    ? epicText.replace(/\n(?=\n## Original feature text)/, '\n' + newRows.map(r =>
        `| ${(lastEpicRows(epicText).length + 1)} | ${r.id} | ${r.name} | ${r.dir} | ${r.checkpoint} | ${r.deps.join(', ') || 'none'} | no |`).join('\n'))
    : renderEpic({ parentId, title: (originalFeature.match(/^# (.+)$/m) || [])[1] || parentId,
        rows: newRows, originalText: originalFeature });

  const reg = JSON.parse(JSON.stringify(registry));
  const parent = findBlock(reg, parentId);
  const keywords = [...new Set([...(late ? (fieldOf(parent, 'Keywords') || '').split(/,\s*/) : []),
    ...plan.flatMap(p => p.keywords)])].filter(Boolean);
  setField(parent, 'Keywords', keywords.join(', '));                    // D-19
  if (!late) {
    setField(parent, 'Status', 'epic');
    setField(parent, 'Summary', firstSentence(fieldOf(parent, 'Summary') || ''));
    setField(parent, 'Detail', `[epic.md](./${path.basename(parentDir)}/epic.md)`);
  }
  for (const p of plan) reg.blocks.push({ id: p.id, lines: ['', ...renderEntry({
    id: p.id, title: p.name, keywords: p.keywords, status: 'defined',
    summary: firstSentence(p.summary),
    detail: `./${p.dir}/feature.md`, detailLabel: 'feature.md',
    parent: parentId, dependsOn: p.deps,
  })] });
  const registryText = renderRegistry(reg);

  // 4. Stage, then commit with a journal. The registry is the last commit step.
  const journal = [];
  const move = (from, to) => { fs.renameSync(from, to); journal.push({ from, to }); };
  try {
    fs.mkdirSync(staging);
    for (const d of childDocs) {
      fs.mkdirSync(path.join(staging, d.dir));
      fs.writeFileSync(path.join(staging, d.dir, 'feature.md'), d.text);
    }
    fs.writeFileSync(path.join(staging, 'epic.md'), epicOut);
    for (const p of plan) move(path.join(staging, p.dir), path.join(featuresRoot, p.dir));
    if (late) move(path.join(parentDir, 'epic.md'), path.join(staging, 'epic.previous.md'));
    else move(path.join(parentDir, 'feature.md'), path.join(staging, 'feature.original.md'));
    move(path.join(staging, 'epic.md'), path.join(parentDir, 'epic.md'));
    writeRegistryAtomically(registryFile, registryText, runId);
  } catch (err) {
    rollback(journal, staging, err);
  }
  try {
    fs.rmSync(staging, { recursive: true, force: true });
  } catch (err) {
    fail('STAGING_CLEANUP_FAILED', `Committed, but staging could not be removed: ${staging}`);
  }
  return {
    epic: parentId,
    children: plan.map(p => ({ id: p.id, dir: p.dir })),
    registry: true,
  };
}

// ---------- UC-05 register (D-20, D-21, D-25) ----------
function register({ featuresRoot, featureDir, keywords, runId = newRunId() }) {
  const base = path.basename(path.resolve(featureDir));
  const id = (base.match(/^(FTR-\d+)/) || [])[1];
  if (!id) fail('FEATURE_ID_INVALID', `Folder ${base} has no FTR-NNN prefix`);
  let doc;
  try { doc = fs.readFileSync(path.join(featureDir, 'feature.md'), 'utf8'); }
  catch (err) { fail('FEATURE_UNREADABLE', `Cannot read feature.md in ${featureDir} (${err.code})`, { file: featureDir }); }
  const title = (doc.match(/^# (.+)$/m) || [])[1];
  if (!title) fail('FEATURE_TITLE_MISSING', `No title heading in ${featureDir}/feature.md`);
  const summarySection = (doc.match(/^## Summary\s*\n([\s\S]*?)(?=^## |\Z)/m) || [])[1] || '';
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);
  const reg = parseRegistry(readRegistryText(registryFile));
  const existing = findBlock(reg, id);
  if (existing) return { id, status: fieldOf(existing, 'Status') };   // no duplicate (D-21)
  const rel = path.relative(featuresRoot, featureDir).split(path.sep).join('/');
  reg.blocks.push({ id, lines: ['', ...renderEntry({
    id, title: title.trim(), keywords, status: 'defined',
    summary: firstSentence(summarySection),
    detail: `./${rel}/feature.md`, detailLabel: 'feature.md', dependsOn: [],
  })] });
  writeRegistryAtomically(registryFile, renderRegistry(reg), runId);
  return { id, status: 'defined' };
}

// ---------- CLI facade (D-23) ----------
function parseArgs(argv) {
  const opts = {}, positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') continue;
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { command: positional[0], rest: positional.slice(1), opts };
}

function main(argv) {
  const { command, rest, opts } = parseArgs(argv);
  const required = (k) => { if (!opts[k]) fail('ARG_MISSING', `--${k} is required`); return opts[k]; };
  try {
    let result;
    if (command === 'apply') {
      const proposal = JSON.parse(fs.readFileSync(0, 'utf8'));
      result = apply({ featuresRoot: required('features-root'), parentId: required('parent'), proposal });
    } else if (command === 'register') {
      result = register({ featuresRoot: required('features-root'), featureDir: rest[0],
        keywords: (opts.keywords || '').split(',').map(s => s.trim()).filter(Boolean) });
    } else {
      fail('COMMAND_UNKNOWN', `Unknown command ${command}`);
    }
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = 0;
  } catch (err) {
    const body = err instanceof FeatureSplitError
      ? { code: err.code, message: err.message, key: err.key, file: err.file }
      : { code: 'OPERATIONAL_ERROR', message: err.message };
    process.stdout.write(JSON.stringify({ error: body }) + '\n');
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  FeatureSplitError, loadConfig, isNewFeature, isOverThreshold, meetsMinimum,
  buildProposal, editProposal, apply, register,
};
```

The helper `setField` is described in the Change paragraph and is not reproduced here. It replaces the field line, or inserts the field after the block's last `**Key:**` line. Entries whose Status is neither `defined`, `completed` nor `epic` are never edited, because they are not parsed into the epic path.

## Tests

Test file: `tests/scripts/feature-split.test.js`. Use a fresh temporary directory per case (not the repository). Fault injection wraps `fs.renameSync`. Use the project's test runner from `AGENTS.md`. The installer tests in `tests/scripts/feature-split-install.test.js` belong to that file's own component and are not repeated here.

- **Configuration (UC-01, D-02 to D-04).** The default alone returns the default values. A project override with a subset of keys overlays only those keys. A missing override is not an error. An override with an unknown top-level or nested key raises `CONFIG_UNKNOWN_KEY` naming the key and file. A non-integer or negative value raises `CONFIG_INVALID_VALUE`. Malformed JSON in the override raises `CONFIG_INVALID_JSON`. A missing or unreadable default raises `CONFIG_DEFAULT_UNREADABLE`. `loadConfig` reads the override from the `projectRoot` argument, not from the working directory.
- **Comparison rules (D-05).** `isOverThreshold(30, 30)` is false and `isOverThreshold(31, 30)` is true. `meetsMinimum(2, 2)` is true and `meetsMinimum(1, 2)` is false.
- **New-feature test (UC-02, D-07).** A missing folder is new. A folder with `FTR-NNN-Approvals.md` is not new. A folder with a `wbs/` directory is not new. A folder with `epic.md` is not new. A folder with only `req/` and `spec/` is new. Mock `fs.readdirSync` to raise `EACCES` and assert `FEATURE_UNREADABLE`.
- **Proposal (UC-03, D-08 to D-12).** The owner defaults to the first child in dependency order. Ties in dependency order are broken by proposal order. A cycle raises `PROPOSAL_CYCLE`. Fewer than `minChildren` raises `TOO_FEW_CHILDREN`. A name with no slug raises `CHILD_NAME_INVALID`. Two names with the same slug raise `CHILD_NAME_DUPLICATE`. An invalid source raises `PROPOSAL_SOURCE_INVALID`.
- **Edits (D-09, D-10).** A rename updates `dependsOn` references and the owner. Removing a child below `minChildren` is refused, and the caller's proposal is unchanged. Moving the owner away from the first child returns `FOUNDATION_NOT_FIRST` and is not refused. A merge redirects references to the merged child. `reorder` must be a permutation.
- **Apply, split mode (UC-04, D-13, D-14, D-19, D-24).** Creates one folder and `feature.md` per child. IDs are the next free values, assigned in dependency order, and never reuse the parent ID. `epic.md` holds the split table with checkpoint `definition` or `measured`, followed by the verbatim original text. The parent `feature.md` is removed. Registry entries are written: the parent entry changes in place to `epic` with the Summary's first sentence and the union of child keywords. Each child is appended with `defined`, `Parent:` and `Depends on:`. The output is exactly `{ epic, children: [{ id, dir }], registry: true }`.
- **Apply, late mode (D-16).** A parent folder holding `epic.md` takes one child. The child is placed last with `dependsOn` defaulting to the previous last child and checkpoint `late`. The `minChildren` check is not applied. The epic keywords are extended, not replaced. An explicit `dependsOn` naming an unknown epic child raises `DEPENDS_ON_INVALID`.
- **Apply refusals (no files touched).** A parent with no registry entry raises `PARENT_NOT_REGISTERED`. A parent with approvals or a WBS raises `PARENT_NOT_NEW`, in split mode only. An existing child folder raises `CHILD_DIR_EXISTS` (never overwritten). A leftover `.split-staging-*` directory raises `STALE_STAGING`. Assert that the features root is unchanged in each case.
- **Atomicity (D-13, D-21).** Inject a failure at each commit step: child move, parent `feature.md` move, `epic.md` move, registry write. For each, assert that the features root matches its state before the run, that the original `feature.md` is restored, that the staging directory is gone, and that the registry is unchanged. A failure during a reverse rename raises `ROLLBACK_INCOMPLETE` listing the remaining paths, and staging is kept.
- **Registry (D-18, D-21).** Entries with other statuses, and non-FTR `##` blocks, are byte-identical after a write. A missing registry is created. A re-run of `register` does not duplicate an entry and returns the existing status. A failure in the temp-and-rename step leaves the registry unchanged and removes the temp file.
- **Register (UC-05, D-20, D-25).** A standalone feature gets one `defined` entry. Its Summary is the first sentence of its Summary section. Its Detail link is relative to the features root.
- **CLI (D-23).** Each invocation writes exactly one JSON object to stdout. Success exits 0. `FeatureSplitError` and operational failures exit 1 with `{ error: { code, message, key, file } }`. `apply` reads the proposal from stdin. `--project` selects the override root.
- **ID allocation (BR-02).** The next ID is one more than the largest among registry entries and folder prefixes, so an ID missing from the registry but present as a folder is still skipped.