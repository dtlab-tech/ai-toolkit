'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class FeatureSplitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FeatureSplitError';
    this.code = code;
    this.key = details.key ?? null;
    this.file = details.file ?? null;
  }
}

const CONFIG_NAME = 'feature-split.config.json';
const DEFAULT_CONFIG = path.join(__dirname, CONFIG_NAME);
const SHAPE = {
  thresholds: ['useCases', 'acceptanceCriteria', 'components', 'estimatedPhases'],
  definitionSignals: ['minActors', 'minApplications', 'minFlows'],
};
const TOP_KEYS = ['thresholds', 'definitionSignals', 'minChildren'];

const fail = (code, message, extra) => { throw new FeatureSplitError(code, message, extra); };

function readConfigFile(file, required) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;
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

const UNEXPECTED_CODE = 'UNEXPECTED_ERROR';

const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

function invalidName(message) {
  return new FeatureSplitError('INVALID_NAME', message, { key: null, file: null });
}

function slug(name) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (raw === '') throw invalidName('child name is empty');
  if (/[\/\\]/.test(raw)) throw invalidName('child name contains a path separator');
  if (raw.includes('..')) throw invalidName('child name contains ".."');
  const stem = raw.split('.')[0].toUpperCase();
  if (RESERVED_DEVICE_NAMES.has(stem)) {
    throw invalidName(`child name "${raw}" is a reserved Windows device name`);
  }
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s === '') throw invalidName('child name has no ASCII letters or digits');
  return s;
}

function firstSentence(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  const match = s.match(/^[\s\S]*?\.(?=\s)/);
  return match ? match[0] : s;
}

function normaliseChild(c) {
  const purpose = typeof c.purpose === 'string' ? c.purpose : '';
  return {
    name: c.name,
    purpose,
    summary: purpose,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    dependsOn: Array.isArray(c.dependsOn) ? c.dependsOn : [],
    assigned: typeof c.assigned === 'string' ? c.assigned : '',
  };
}

function validateChildNames(children) {
  const names = new Set(), slugs = new Set();
  for (const c of children) {
    const name = c.name;
    if (typeof name !== 'string' || name.trim() === '')
      fail('CHILD_NAME_INVALID', `Child name ${JSON.stringify(name)} is empty or not a string`, { key: String(name) });
    let s;
    try {
      s = slug(name);
    } catch (err) {
      fail('CHILD_NAME_INVALID', `Child "${name}" does not yield a valid folder slug: ${err.message}`, { key: name });
    }
    if (names.has(name) || slugs.has(s))
      fail('CHILD_NAME_DUPLICATE', `Child "${name}" duplicates slug "${s}"`, { key: name });
    names.add(name); slugs.add(s);
  }
}

// Stable topological sort. Among children that are ready at the same time,
// proposal order decides (Requirements UC-03 tie-break).
// Rejects unknown siblings and self-references (DEPENDS_ON_INVALID) and cycles (PROPOSAL_CYCLE).
function dependencyOrder(children) {
  const names = new Set(children.map(c => c.name));
  for (const c of children) {
    for (const d of c.dependsOn) {
      if (d === c.name)
        fail('DEPENDS_ON_INVALID', `${c.name} depends on itself`, { key: c.name });
      if (!names.has(d))
        fail('DEPENDS_ON_INVALID', `${c.name} depends on unknown child "${d}"`, { key: c.name });
    }
  }
  const placed = new Set(), order = [], remaining = [...children];
  while (remaining.length) {
    // findIndex returns the first ready child in proposal order, so ties go to proposal order.
    const i = remaining.findIndex(c => c.dependsOn.every(d => placed.has(d)));
    if (i === -1) fail('PROPOSAL_CYCLE', 'Dependencies between children form a cycle');
    const [next] = remaining.splice(i, 1);
    placed.add(next.name);
    order.push(next);
  }
  return order;
}

// BR-03 (D-10). The shared foundation belongs to the first child in dependency order.
// Warns when the owner is not that child. Warnings only: never throws, never refuses.
function foundationWarnings(p, order) {
  if (!p || !Array.isArray(order) || order.length === 0) return [];
  const owner = p.sharedFoundationOwner ?? null;
  if (owner === order[0].name) return [];
  return [{
    code: 'FOUNDATION_NOT_FIRST',
    message: `BR-03 is broken: the shared foundation is assigned to ${owner ?? 'no child'}, `
      + `not to the first child in dependency order (${order[0].name}). Children before the owner are built `
      + `without the foundation.`,
  }];
}

function validateProposal(p, { checkMin = true } = {}) {
  if (!['definition', 'measured'].includes(p.source))
    fail('PROPOSAL_SOURCE_INVALID', 'source must be "definition" or "measured"');
  if (checkMin && !meetsMinimum(p.children.length, p.minChildren))
    fail('TOO_FEW_CHILDREN', `${p.children.length} children; minimum is ${p.minChildren}`);
  validateChildNames(p.children);
  const names = new Set(p.children.map(c => c.name));
  for (const c of p.children) for (const d of c.dependsOn)
    if (!names.has(d) || d === c.name)
      fail('DEPENDS_ON_INVALID', `${c.name} depends on unknown or self child "${d}"`, { key: c.name });
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
  proposal.children = order;
  proposal.sharedFoundationOwner = sharedFoundationOwner === undefined ? order[0].name : sharedFoundationOwner;
  validateProposal(proposal);
  return { proposal, warnings: foundationWarnings(proposal, order) };
}

// Edits work on a copy, so a refused edit leaves the caller's proposal unchanged (D-09).
// op.type: rename | set | reorder | owner | add | remove | merge
// Returns { proposal, warnings }. Throws FeatureSplitError on refusal. Writes no file.
function editProposal(proposal, op) {
  if (!op || typeof op !== 'object') fail('EDIT_UNKNOWN', 'An edit must be an object with a type');
  const next = JSON.parse(JSON.stringify(proposal));
  const byName = (n) => {
    const c = next.children.find(x => x.name === n);
    if (!c) fail('CHILD_NOT_FOUND', `No child named "${n}"`, { key: String(n) });
    return c;
  };
  const relink = (from, to) => {
    for (const c of next.children)
      c.dependsOn = [...new Set(c.dependsOn.map(d => d === from ? to : d))].filter(d => d !== c.name);
    if (next.sharedFoundationOwner === from) next.sharedFoundationOwner = to;
  };
  switch (op.type) {
    case 'rename':
      byName(op.from).name = op.to;
      relink(op.from, op.to);
      break;
    case 'set': {
      if (!['purpose', 'summary', 'keywords', 'assigned', 'dependsOn'].includes(op.field))
        fail('EDIT_FIELD_INVALID', `Field ${op.field} cannot be edited`, { key: String(op.field) });
      const isList = op.field === 'keywords' || op.field === 'dependsOn';
      const valid = isList
        ? Array.isArray(op.value) && op.value.every(v => typeof v === 'string')
        : typeof op.value === 'string';
      if (!valid)
        fail('EDIT_VALUE_INVALID', `${op.field} must be ${isList ? 'an array of strings' : 'a string'}`, { key: op.field });
      byName(op.name)[op.field] = op.value;
      break;
    }
    case 'reorder': {
      const names = Array.isArray(op.names) ? op.names : [];
      const have = next.children.map(c => c.name).sort();
      const want = [...names].sort();
      if (want.length !== have.length || want.some((n, i) => n !== have[i]))
        fail('REORDER_NOT_PERMUTATION', 'reorder must list every child exactly once');
      next.children = names.map(byName);
      break;
    }
    case 'owner':
      next.sharedFoundationOwner = op.name ?? null;
      break;
    case 'add':
      if (!op.child || typeof op.child !== 'object')
        fail('EDIT_VALUE_INVALID', 'add needs a child object');
      next.children.push(normaliseChild(op.child));
      break;
    case 'remove':
      byName(op.name);
      next.children = next.children.filter(c => c.name !== op.name);
      if (next.sharedFoundationOwner === op.name) next.sharedFoundationOwner = null;
      break;
    case 'merge': {
      if (!Array.isArray(op.names) || op.names.length === 0 || new Set(op.names).size !== op.names.length)
        fail('EDIT_VALUE_INVALID', 'merge needs a non-empty list of distinct child names');
      if (typeof op.into !== 'string')
        fail('EDIT_VALUE_INVALID', 'merge needs a string name for the merged child');
      const group = op.names.map(byName);
      const joined = group.map(c => c.purpose).filter(Boolean).join(' / ');
      const merged = {
        name: op.into, purpose: joined, summary: joined,
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
    default:
      fail('EDIT_UNKNOWN', `Unknown edit ${op.type}`);
  }
  // A remove never rewrites dependsOn: a sibling that still names the removed child is refused here.
  validateProposal(next);
  return { proposal: next, warnings: foundationWarnings(next, dependencyOrder(next.children)) };
}

const REGISTRY_NAME = 'REGISTRY.md';
const ENTRY_HEADING = /^## (FTR-\d+) — (.+)$/;
const ENTRY_SEPARATOR = /^---\s*$/;
const FIELD_LINE = /^\*\*([A-Za-z ]+):\*\*\s*(.*)$/;
const DETAIL_LINK = /^→\s*\[Detail\]\((.*)\)\s*$/;

function splitList(value) {
  if (!value || value.toLowerCase() === 'none') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function parseEntry(id, title, lines) {
  const fields = new Map();
  let detail = null;
  for (const raw of lines) {
    const line = raw.trim();
    const link = line.match(DETAIL_LINK);
    if (link) {
      detail = link[1];
      continue;
    }
    const field = line.match(FIELD_LINE);
    if (field && !fields.has(field[1])) fields.set(field[1], field[2].trim());
  }
  return {
    id,
    title,
    keywords: splitList(fields.get('Keywords')),
    status: fields.get('Status') || null,
    summary: fields.get('Summary') || '',
    detail: detail ?? fields.get('Detail') ?? null,
    parent: fields.get('Parent') || null,
    dependsOn: splitList(fields.get('Depends on')),
  };
}

function parseRegistry(text) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (current) entries.push(parseEntry(current.id, current.title, current.lines));
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(ENTRY_HEADING);
    if (heading) {
      flush();
      current = { id: heading[1], title: heading[2].trim(), lines: [] };
    } else if (ENTRY_SEPARATOR.test(line)) {
      flush();
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return entries;
}

function readRegistry(featuresRoot) {
  const file = path.join(featuresRoot, REGISTRY_NAME);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { exists: false, file, entries: [] };
    throw new FeatureSplitError('REGISTRY_IO', `cannot read ${file} (${err.code || err.message})`, { file });
  }
  return { exists: true, file, entries: parseRegistry(text) };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds the lines of one new registry entry, in the live REGISTRY.md layout.
// The caller adds the '---' separator and blank lines around it.
function renderEntry(e) {
  const keywords = Array.isArray(e.keywords) ? e.keywords.join(', ') : e.keywords;
  const lines = [
    `## ${e.id} — ${e.title}`,
    `**Keywords:** ${keywords}`,
    `**Status:** ${e.status}`,
    `**Summary:** ${e.summary}`,
  ];
  if (e.parent) {
    const deps = e.dependsOn ?? [];
    lines.push(`**Parent:** ${e.parent}`, `**Depends on:** ${deps.length ? deps.join(', ') : 'none'}`);
  }
  lines.push(`→ [Detail](${e.detail})`);
  return lines;
}

const findBlock = (r, id) => r.blocks.find(b => b.id === id);

// Returns the trimmed value of the first "**Key:**" line in the block, or null.
function fieldOf(block, key) {
  const re = new RegExp(`^\\*\\*${escapeRe(key)}:\\*\\*\\s*(.*)$`);
  for (const line of block.lines) {
    const m = line.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// Replaces the first "**Key:**" line in place. If none exists, inserts one after the
// block's last "**Key:**" line (or after the heading when there is none). Mutates and returns the block.
function setField(block, key, value) {
  const line = `**${key}:** ${value}`.trimEnd();
  const re = new RegExp(`^\\*\\*${escapeRe(key)}:\\*\\*`);
  const at = block.lines.findIndex(l => re.test(l));
  if (at !== -1) {
    block.lines[at] = line;
    return block;
  }
  let last = -1;
  block.lines.forEach((l, i) => { if (/^\*\*[^*]+:\*\*/.test(l)) last = i; });
  block.lines.splice(last !== -1 ? last + 1 : Math.min(1, block.lines.length), 0, line);
  return block;
}

// Joins the preserved head and every block's verbatim lines with the detected EOL.
// Untouched blocks are emitted exactly as parsed, so they stay byte-identical.
const renderRegistry = (r) => [...r.head, ...r.blocks.flatMap(b => b.lines)].join(r.eol);

const splitKeywords = (text) => (text || '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
const uniq = (xs) => [...new Set(xs)];

// Replaces the block's "→ [Detail](...)" line in place, or appends one. A "**Detail:**" line
// would leave the old link in place, and parseEntry reads the arrow form first.
function setDetailLink(block, target) {
  const line = `→ [Detail](${target})`;
  const at = block.lines.findIndex(l => DETAIL_LINK.test(l.trim()));
  if (at !== -1) block.lines[at] = line;
  else block.lines.push(line);
  return block;
}

// Pure: returns the full REGISTRY.md text with the apply changes applied. Performs no file I/O.
// registry: block-shaped registry ({ eol, head, blocks }); not mutated
// plan:     [{ id, name, keywords, summary, dir, deps }] in dependency order; deps are sibling IDs
// late:     true for late mode (one child, existing epic)
function buildRegistryText({ registry, parentId, parentDirName, plan, late }) {
  const reg = JSON.parse(JSON.stringify(registry));
  const parent = findBlock(reg, parentId);
  if (!parent) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`, { key: parentId });

  // Initial mode: union over the new children. Late mode: union over every existing child entry
  // of the parent, plus the new child.
  const existingChildKeywords = late
    ? reg.blocks
        .filter(b => b.id && fieldOf(b, 'Parent') === parentId)
        .flatMap(b => splitKeywords(fieldOf(b, 'Keywords')))
    : [];
  setField(parent, 'Keywords',
    uniq([...existingChildKeywords, ...plan.flatMap(p => p.keywords)]).join(', '));

  if (!late) {
    setField(parent, 'Status', 'epic');
    setField(parent, 'Summary', firstSentence(fieldOf(parent, 'Summary') || ''));
    setDetailLink(parent, `./${parentDirName}/epic.md`);
  }

  for (const p of plan) {
    if (findBlock(reg, p.id)) continue;
    const last = reg.blocks.length ? reg.blocks[reg.blocks.length - 1].lines : reg.head;
    const tail = last[last.length - 1];
    const lead = tail === undefined || tail.trim() === '' ? [] : [''];
    reg.blocks.push({ id: p.id, lines: [...lead, ...renderEntry({
      id: p.id, title: p.name, keywords: p.keywords, status: 'defined',
      summary: firstSentence(p.summary),
      detail: `./${p.dir}/feature.md`,
      parent: parentId, dependsOn: p.deps,
    }), '', '---'] });
  }
  return renderRegistry(reg);
}

function writeRegistryAtomic(featuresRoot, runId, content) {
  const registryPath = path.join(featuresRoot, REGISTRY_NAME);
  if (!/^[0-9a-f]+$/i.test(String(runId))) {
    throw new FeatureSplitError('REGISTRY_IO', `invalid run id for registry temp file: ${runId}`, { file: registryPath });
  }
  const tempPath = path.join(featuresRoot, `${REGISTRY_NAME}.tmp-${runId}`);
  let created = false;
  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx' });
    created = true;
    fs.renameSync(tempPath, registryPath);
  } catch (err) {
    if (created) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch (_) {
        // left for the staging leftover scan; this helper removes only the file it created
      }
    }
    throw new FeatureSplitError(
      'REGISTRY_IO',
      `cannot write ${registryPath} (previous registry left unchanged): ${err.code || err.message}`,
      { file: registryPath },
    );
  }
}

const STAGING_PREFIX = '.split-staging-';
const REGISTRY_TEMP_PREFIX = `${REGISTRY_NAME}.tmp-`;

function findStagingLeftovers(featuresRoot) {
  let names;
  try {
    names = fs.readdirSync(featuresRoot);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter(name => name.startsWith(STAGING_PREFIX) || name.startsWith(REGISTRY_TEMP_PREFIX))
    .sort()
    .map(name => path.join(featuresRoot, name));
}

function assertNoStagingLeftovers(featuresRoot) {
  const leftovers = findStagingLeftovers(featuresRoot);
  if (leftovers.length === 0) return;
  const list = leftovers.map(p => `  ${p}`).join('\n');
  throw new FeatureSplitError(
    'STAGING_LEFTOVER',
    `leftover staging paths from an earlier interrupted split were found in ${featuresRoot}; nothing was changed:\n${list}\n` +
      'Confirm that no feature-split run is active, then remove these paths manually and run the command again.',
    { file: null },
  );
}

// stageFiles: [{ rel, text }] paths relative to staging
// moves: [{ from, to }] in commit order (children, parent rollback copy and req/ spec/ backups, then epic.md)
// Returns warning strings (empty when staging was removed). Always throws on failure before the registry commit.
function commitStaged({ featuresRoot, staging, stageFiles, moves, registryFile, registryText, runId }) {
  const journal = [];
  let createdStaging = false;
  const move = (from, to) => { fs.renameSync(from, to); journal.push({ from, to }); };
  try {
    fs.mkdirSync(staging);
    createdStaging = true;
    fs.mkdirSync(path.join(staging, 'parent-backup'));
    for (const f of stageFiles) {
      const full = path.join(staging, f.rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.text);
    }
    for (const m of moves) move(m.from, m.to);
    writeRegistryAtomic(featuresRoot, runId, registryText);
  } catch (cause) {
    rollbackJournal({ journal, staging, createdStaging, registryFile, runId, cause });
  }
  return removeStagingAfterCommit(staging);
}

function rollbackJournal({ journal, staging, createdStaging, registryFile, runId, cause }) {
  const stuck = [];
  for (const step of [...journal].reverse()) {
    try { fs.renameSync(step.to, step.from); }
    catch { stuck.push(step.to); }
  }
  try { fs.rmSync(`${registryFile}.tmp-${runId}`, { force: true }); }
  catch { /* INFRA-TASK-BE-05 already removes its temp file; the leftover scan reports any remainder */ }
  if (stuck.length === 0 && createdStaging) {
    try { fs.rmSync(staging, { recursive: true, force: true }); }
    catch { stuck.push(staging); }
  }
  if (stuck.length)
    throw new FeatureSplitError('ROLLBACK_FAILED',
      `Run failed (${cause.message}); rollback left these paths: ${stuck.join(', ')}`, { file: staging });
  throw cause;
}

function removeStagingAfterCommit(staging) {
  try { fs.rmSync(staging, { recursive: true, force: true }); return []; }
  catch { return [`Committed, but staging could not be removed: ${staging}`]; }
}

// UC-02 (D-07): is this feature folder still new, or has it been split or worked on?
function isNewFeature(featureDir) {
  let entries;
  try {
    fs.statSync(featureDir);
    entries = fs.readdirSync(featureDir);
  } catch (err) {
    if (err.code === 'ENOENT') return { isNew: true, reason: 'not-created' };
    throw new FeatureSplitError('FEATURE_UNREADABLE',
      `Cannot read ${featureDir} (${err.code})`, { file: featureDir });
  }
  const prefix = (path.basename(featureDir).match(/^[A-Z]+-\d+/) || [])[0];
  if (entries.includes('epic.md')) return { isNew: false, reason: 'epic' };
  if (prefix && entries.includes(`${prefix}-Approvals.md`)) return { isNew: false, reason: 'approvals' };
  if (entries.includes('wbs')) {
    let isDir;
    try {
      isDir = fs.statSync(path.join(featureDir, 'wbs')).isDirectory();
    } catch (err) {
      throw new FeatureSplitError('FEATURE_UNREADABLE',
        `Cannot read ${featureDir}/wbs (${err.code})`, { file: featureDir });
    }
    if (isDir) return { isNew: false, reason: 'wbs' };
  }
  return { isNew: true, reason: 'no-markers' };
}

// BR-02: next free IDs from the union of registry headings and feature folder prefixes.
function allocateIds(featuresRoot, registry, count) {
  const used = registry.blocks.map(b => b.id).filter(Boolean);
  const dirs = fs.readdirSync(featuresRoot)
    .map(n => (n.match(/^(FTR-\d+)/) || [])[1])
    .filter(Boolean);
  let next = Math.max(0, ...[...used, ...dirs].map(id => parseInt(id.slice(4), 10))) + 1;
  return Array.from({ length: count }, () => `FTR-${String(next++).padStart(3, '0')}`);
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

const ORIGINAL_HEADING = '## Original feature text';

function renderSplitRow(r) {
  return `| ${r.order} | ${r.id} | ${r.name} | ${r.dir} | ${r.checkpoint} | ${r.deps.join(', ') || 'none'} | ${r.owner ? 'yes' : 'no'} |`;
}

// A child row starts with a numeric Order cell. The header, the separator and the shared foundation
// row (| — | … |) never do. Only lines above the original feature text are considered.
function childRowIndexes(lines) {
  const originalAt = lines.findIndex(l => l.trim() === ORIGINAL_HEADING);
  const end = originalAt < 0 ? lines.length : originalAt;
  const indexes = [];
  for (let i = 0; i < end; i++) {
    if (/^\|\s*\d+\s*\|/.test(lines[i].trim())) indexes.push(i);
  }
  return indexes;
}

// Returns child rows of the epic.md split table, excluding the header and the shared foundation row.
// Rows: [{ order, id, name, dir, checkpoint, deps: string[], owner: boolean }]
function parseEpicRows(text) {
  const lines = text.split('\n');
  return childRowIndexes(lines).map(i => {
    const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const [order, id, name, dir, checkpoint, depends, shared] = cells;
    return {
      order: parseInt(order, 10),
      id,
      name,
      dir,
      checkpoint,
      deps: depends === 'none' || depends === '' ? [] : depends.split(',').map(d => d.trim()).filter(Boolean),
      owner: shared === 'yes',
    };
  });
}

// Pure: returns epic.md text with one late row inserted after the last child row.
// Existing rows, the shared foundation row and the original text are kept byte-for-byte.
// row: { id, name, dir, checkpoint, deps: string[], owner: boolean }; order is always last + 1.
function insertLateRow(text, row) {
  const lines = text.split('\n');
  const indexes = childRowIndexes(lines);
  if (!indexes.length) fail('EPIC_TABLE_MISSING', 'epic.md has no child rows to insert after');
  const order = parseEpicRows(text).reduce((max, r) => Math.max(max, r.order), 0) + 1;
  const anchor = indexes[indexes.length - 1];
  const cr = lines[anchor].endsWith('\r') ? '\r' : '';
  const newLine = renderSplitRow({ ...row, order, deps: row.deps ?? [] }) + cr;
  lines.splice(anchor + 1, 0, newLine);
  return lines.join('\n');
}

// Pure: returns epic.md text. Performs no file I/O.
// rows: [{ order, id, name, dir, checkpoint, deps: string[], owner: boolean }]
// warnings: output of foundationWarnings(), may be []
// originalText: the verbatim feature.md text, appended unchanged
function renderEpic({ parentId, title, rows, originalText, warnings = [] }) {
  const foundation = warnings.length
    ? warnings.map(w => w.message.replace(/\|/g, '\\|')).join(' ')
    : 'none';
  return [
    `# ${title} — epic`, '',
    '## Feature ID', parentId, '',
    '## Split table', '',
    '| Order | ID | Name | Dir | Checkpoint | Depends on | Shared foundation |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(renderSplitRow),
    `| — | — | Shared foundation | — | — | — | ${foundation} |`,
    '', '## Original feature text', '', originalText,
  ].join('\n');
}

// D-08 shape: structural types only. Business rules (source values, names, dependencies,
// minChildren threshold) stay in validateProposal, which raises its own codes.
function assertProposalShape(p) {
  const bad = (why) => fail('INVALID_PROPOSAL', `Proposal shape invalid: ${why}`);
  if (p === null || typeof p !== 'object' || Array.isArray(p)) bad('must be a JSON object');
  if (!Array.isArray(p.children)) bad('children must be an array');
  p.children.forEach((c, i) => {
    if (c === null || typeof c !== 'object' || Array.isArray(c)) bad(`children[${i}] must be an object`);
  });
  if (!Number.isInteger(p.minChildren) || p.minChildren < 0) bad('minChildren must be a non-negative integer');
  if (typeof p.foundationNote !== 'string') bad('foundationNote must be a string');
  if (p.sharedFoundationOwner !== null && typeof p.sharedFoundationOwner !== 'string')
    bad('sharedFoundationOwner must be a string or null');
}

// Only ENOENT and ENOTDIR mean absent; any other error propagates.
function fileExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
    throw err;
  }
}

// feature.md only -> initial; epic.md only -> late; both or neither -> PARENT_INVALID.
function detectMode(parentDir, parentId) {
  const hasFeature = fileExists(path.join(parentDir, 'feature.md'));
  const hasEpic = fileExists(path.join(parentDir, 'epic.md'));
  if (hasFeature === hasEpic)
    fail('PARENT_INVALID', `${parentId} folder must hold exactly one of feature.md or epic.md`, { file: parentDir });
  return hasEpic ? 'late' : 'initial';
}

// Returns the parent's feature folder (named exactly by its ID, or "<ID>-<slug>").
// When no folder matches, returns the bare ID path, which holds neither marker file, so detectMode refuses it.
function findParentDir(featuresRoot, parentId) {
  let names;
  try {
    names = fs.readdirSync(featuresRoot);
  } catch (err) {
    if (err.code === 'ENOENT') names = [];
    else throw new FeatureSplitError('FEATURE_UNREADABLE', `Cannot read ${featuresRoot} (${err.code})`, { file: featuresRoot });
  }
  const matches = names.filter(n => n === parentId || n.startsWith(`${parentId}-`)).sort();
  if (matches.length > 1)
    fail('PARENT_INVALID', `${parentId} matches more than one folder: ${matches.join(', ')}`, { file: featuresRoot });
  return path.join(featuresRoot, matches[0] ?? parentId);
}

// Apply pre-checks. Nothing is moved, written or staged here.
// Order: proposal shape, staging leftovers, parent registry entry, parent folder mode, status, isNewFeature.
// Returns { mode, parentDir, parentEntry }.
function checkApplyPreconditions({ featuresRoot, parentId, proposal }) {
  assertProposalShape(proposal);
  assertNoStagingLeftovers(featuresRoot);
  const parentEntry = readRegistry(featuresRoot).entries.find(e => e.id === parentId);
  if (!parentEntry) fail('PARENT_NOT_REGISTERED', `${parentId} has no registry entry`, { key: parentId });
  const parentDir = findParentDir(featuresRoot, parentId);
  const mode = detectMode(parentDir, parentId);
  const late = mode === 'late';
  const wantStatus = late ? 'epic' : 'defined';
  if (parentEntry.status !== wantStatus)
    fail('PARENT_STATUS_INVALID', `${parentId} has status ${parentEntry.status}; ${mode} mode needs ${wantStatus}`, { key: parentId });
  if (!late && !isNewFeature(parentDir).isNew)
    fail('PARENT_NOT_NEW', `${parentId} has approvals or a WBS`, { file: parentDir });
  return { mode, parentDir, parentEntry };
}

// Internal helper, not exported. Pure planning: reads the features root and never writes.
function targetExists(file) {
  try { fs.lstatSync(file); return true; }
  catch (err) {
    if (err.code === 'ENOENT') return false;
    fail('FEATURE_UNREADABLE', `Cannot inspect ${file} (${err.code})`, { file });
  }
}

// Initial-mode plan. Refusal only for TARGET_EXISTS; BR-03 is a warning, never a refusal.
function planInitial({ featuresRoot, registry, parentId, proposal }) {
  validateProposal(proposal);
  const order = dependencyOrder(proposal.children);
  const warnings = foundationWarnings(proposal, order);
  const ids = allocateIds(featuresRoot, registry, order.length);
  const idOf = new Map(order.map((c, i) => [c.name, ids[i]]));
  const plan = order.map((c, i) => ({
    name: c.name,
    id: ids[i],
    dir: `${ids[i]}-${slug(c.name)}`,
    summary: c.summary,
    keywords: c.keywords,
    assigned: c.assigned,
    checkpoint: proposal.source,
    deps: c.dependsOn.map(d => idOf.get(d)),
    owner: c.name === proposal.sharedFoundationOwner,
  }));
  for (const p of plan) {
    const folder = path.join(featuresRoot, p.dir);
    if (targetExists(folder) || targetExists(path.join(folder, 'feature.md')) || findBlock(registry, p.id))
      fail('TARGET_EXISTS', `${p.id} already exists (folder, feature.md or registry heading)`, { file: folder });
  }
  return { parentId, order, plan, warnings };
}

const LATE_CHILD_COUNT = 1;

// Late-mode plan (D-16): exactly one child appended after the existing epic children.
// Pure planning: reads epic.md text and the registry, never writes. minChildren is not checked.
// Returns plan items shaped like planInitial's items, with checkpoint 'late' and owner false.
function planLate({ featuresRoot, registry, epicText, proposal }) {
  if (proposal.children.length !== LATE_CHILD_COUNT)
    fail('LATE_CHILD_COUNT', `A late apply takes exactly ${LATE_CHILD_COUNT} child; got ${proposal.children.length}`);

  const child = normaliseChild(proposal.children[0]);
  // dependsOn names epic.md child rows, not siblings in this proposal, so it is cleared before validation.
  validateProposal({ ...proposal, children: [{ ...child, dependsOn: [] }], sharedFoundationOwner: null },
    { checkMin: false });

  const rows = parseEpicRows(epicText);
  if (rows.length === 0)
    fail('PARENT_INVALID', 'epic.md has no child rows to place a late child after');

  const byName = new Map(rows.map(r => [r.name, r]));
  const deps = child.dependsOn.length
    ? child.dependsOn.map(n => {
        const row = byName.get(n);
        if (!row) fail('UNKNOWN_DEPENDENCY', `${n} is not a child listed in epic.md`, { key: n });
        return row.id;
      })
    : [rows[rows.length - 1].id];

  const [id] = allocateIds(featuresRoot, registry, 1);
  const dir = `${id}-${slug(child.name)}`;
  const folder = path.join(featuresRoot, dir);
  if (targetExists(folder) || targetExists(path.join(folder, 'feature.md')) || findBlock(registry, id))
    fail('TARGET_EXISTS', `${id} already exists (folder, feature.md or registry heading)`, { file: folder });

  return [{
    name: child.name,
    id,
    dir,
    summary: child.summary,
    keywords: child.keywords,
    assigned: child.assigned,
    checkpoint: 'late',
    deps,
    owner: false,
  }];
}

const newRunId = () => crypto.randomBytes(4).toString('hex');

// Block-shaped registry ({ eol, head, blocks }) for the planners and buildRegistryText.
// Splitting and re-joining with the same EOL keeps untouched lines byte-identical.
function readRegistryBlocks(featuresRoot) {
  const text = fs.readFileSync(path.join(featuresRoot, REGISTRY_NAME), 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const head = [];
  const blocks = [];
  let current = null;
  for (const line of text.split(eol)) {
    const heading = line.match(ENTRY_HEADING);
    if (heading) {
      current = { id: heading[1], lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      head.push(line);
    }
  }
  return { eol, head, blocks };
}

// UC-04 apply. Pre-checks, plan, render in memory, then commit through commitStaged.
// Returns { epic, children: [{ id, dir }], registry: true } plus warnings only when staging removal failed.
function apply({ featuresRoot, parentId, proposal, runId = newRunId() }) {
  const { mode, parentDir } = checkApplyPreconditions({ featuresRoot, parentId, proposal });
  const late = mode === 'late';
  const staging = path.join(featuresRoot, `${STAGING_PREFIX}${runId}`);
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);
  const registry = readRegistryBlocks(featuresRoot);
  const input = { ...proposal, children: proposal.children.map(normaliseChild) };

  const epicText = late ? fs.readFileSync(path.join(parentDir, 'epic.md'), 'utf8') : null;
  const originalFeature = late ? null : fs.readFileSync(path.join(parentDir, 'feature.md'), 'utf8');

  let plan, planWarnings = [];
  if (late) {
    plan = planLate({ featuresRoot, registry, epicText, proposal: input });
  } else {
    ({ plan, warnings: planWarnings } = planInitial({ featuresRoot, registry, parentId, proposal: input }));
  }

  const total = late ? parseEpicRows(epicText).length + 1 : plan.length;
  const childDocs = plan.map((p, i) => ({
    dir: p.dir,
    text: renderChildDoc(p, {
      parentId,
      position: late ? total : i + 1,
      total,
      foundationNote: input.foundationNote,
    }),
  }));
  const epicOut = late
    ? insertLateRow(epicText, plan[0])
    : renderEpic({
        parentId,
        title: (originalFeature.match(/^# (.+)$/m) || [])[1] || parentId,
        rows: plan.map((p, i) => ({
          order: i + 1, id: p.id, name: p.name, dir: p.dir,
          checkpoint: p.checkpoint, deps: p.deps, owner: p.owner,
        })),
        originalText: originalFeature,
        warnings: planWarnings,
      });
  const registryText = buildRegistryText({
    registry, parentId, parentDirName: path.basename(parentDir), plan, late,
  });

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

// UC-05 register (D-20, D-21). Appends one defined entry for a standalone feature. An existing entry
// with status defined, completed or epic is returned unchanged. Any other status raises REGISTRY_STATUS.
// A missing registry is created. The write is temp-and-rename, so a failure leaves the old file intact.
function register({ featuresRoot, featureDir, keywords = [], runId = newRunId() }) {
  const { id, title, summary } = readFeatureForRegister(featureDir);
  const registryFile = path.join(featuresRoot, REGISTRY_NAME);
  let reg;
  try {
    reg = readRegistryBlocks(featuresRoot);
  } catch (err) {
    if (err.code !== 'ENOENT') throw new FeatureSplitError('REGISTRY_IO', `cannot read ${registryFile} (${err.code || err.message})`, { file: registryFile });
    reg = { eol: '\n', head: [], blocks: [] };
  }

  const existing = findBlock(reg, id);
  if (existing) {
    const status = fieldOf(existing, 'Status');
    if (['defined', 'completed', 'epic'].includes(status)) return { id, status };
    fail('REGISTRY_STATUS', `${id} is registered with status "${status}"; register does not change it`, { key: id, file: registryFile });
  }

  const last = reg.blocks.length ? reg.blocks[reg.blocks.length - 1].lines : reg.head;
  const tail = last[last.length - 1];
  const lead = tail === undefined || tail.trim() === '' ? [] : [''];
  const rel = path.relative(featuresRoot, path.resolve(featureDir)).split(path.sep).join('/');
  reg.blocks.push({ id, lines: [...lead, ...renderEntry({
    id, title, keywords, status: 'defined', summary,
    detail: `./${rel}/feature.md`,
  }), '', '---'] });
  writeRegistryAtomic(featuresRoot, runId, renderRegistry(reg));
  return { id, status: 'defined' };
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const next = args[i + 1];
    flags[args[i].slice(2)] = next === undefined || next.startsWith('--') ? '' : next;
    if (next !== undefined && !next.startsWith('--')) i++;
  }
  return flags;
}

function required(flags, name) {
  if (!flags[name]) fail('ARG_MISSING', `--${name} is required`);
  return flags[name];
}

function runApply(args, readStdin) {
  const flags = parseFlags(args);
  const featuresRoot = required(flags, 'features-root');
  const parentId = required(flags, 'parent');
  const text = readStdin();
  let proposal;
  try {
    proposal = JSON.parse(text);
  } catch {
    fail('INVALID_PROPOSAL', 'The proposal on stdin is not valid JSON');
  }
  return apply({ featuresRoot, parentId, proposal });
}

function sectionBody(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

function readFeatureForRegister(featureDir) {
  const dir = path.resolve(featureDir);
  const base = path.basename(dir);
  const idMatch = base.match(/^(FTR-\d+)/);
  if (!idMatch) fail('FEATURE_INVALID', `Folder ${base} has no FTR-NNN prefix`, { file: dir });

  if (fs.existsSync(path.join(dir, 'epic.md')))
    fail('PARENT_INVALID', `${base} holds epic.md; it is a parent epic, not a feature`, { file: dir });

  const file = path.join(dir, 'feature.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail('FEATURE_INVALID', `Cannot read ${file} (${err.code})`, { file });
  }

  const title = (text.match(/^# (.+)$/m) || [])[1];
  if (!title) fail('FEATURE_INVALID', `No H1 title in ${file}`, { file });

  const summary = sectionBody(text, 'Summary');
  if (summary === null) fail('FEATURE_INVALID', `No Summary section in ${file}`, { file });

  return { id: idMatch[1], title: title.trim(), summary: firstSentence(summary) };
}

function runRegister(args) {
  throw new Error('register is not implemented yet');
}

const COMMANDS = { apply: runApply, register: runRegister };

function errorPayload(err) {
  if (err instanceof FeatureSplitError) {
    return { error: { code: err.code, key: err.key ?? null, file: err.file ?? null, message: err.message } };
  }
  return { error: { code: UNEXPECTED_CODE, key: null, file: null, message: String((err && err.message) || err) } };
}

function main(argv, readStdin) {
  const [command, ...rest] = argv;
  try {
    if (!command || !Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
      throw new Error(`unknown or missing command: ${command || '(none)'}; expected apply or register`);
    }
    return { exitCode: 0, payload: COMMANDS[command](rest, readStdin) };
  } catch (err) {
    return { exitCode: 1, payload: errorPayload(err) };
  }
}

function run(argv = process.argv.slice(2)) {
  const readStdin = () => fs.readFileSync(0, 'utf8');
  const { exitCode, payload } = main(argv, readStdin);
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exitCode = exitCode;
}

if (require.main === module) run();

module.exports.FeatureSplitError = FeatureSplitError;
module.exports.loadConfig = loadConfig;
module.exports.isOverThreshold = isOverThreshold;
module.exports.meetsMinimum = meetsMinimum;
module.exports.main = main;
module.exports.run = run;
module.exports.slug = slug;
module.exports.firstSentence = firstSentence;
module.exports.normaliseChild = normaliseChild;
module.exports.validateChildNames = validateChildNames;
module.exports.dependencyOrder = dependencyOrder;
module.exports.foundationWarnings = foundationWarnings;
module.exports.parseRegistry = parseRegistry;
module.exports.readRegistry = readRegistry;
module.exports.renderEntry = renderEntry;
module.exports.findBlock = findBlock;
module.exports.fieldOf = fieldOf;
module.exports.setField = setField;
module.exports.renderEpic = renderEpic;
module.exports.renderRegistry = renderRegistry;
module.exports.buildRegistryText = buildRegistryText;
module.exports.writeRegistryAtomic = writeRegistryAtomic;
module.exports.findStagingLeftovers = findStagingLeftovers;
module.exports.assertNoStagingLeftovers = assertNoStagingLeftovers;
module.exports.isNewFeature = isNewFeature;
module.exports.buildProposal = buildProposal;
module.exports.editProposal = editProposal;
module.exports.allocateIds = allocateIds;
module.exports.parseEpicRows = parseEpicRows;
module.exports.insertLateRow = insertLateRow;
module.exports.assertProposalShape = assertProposalShape;
module.exports.detectMode = detectMode;
module.exports.checkApplyPreconditions = checkApplyPreconditions;
module.exports.apply = apply;
module.exports.register = register;
