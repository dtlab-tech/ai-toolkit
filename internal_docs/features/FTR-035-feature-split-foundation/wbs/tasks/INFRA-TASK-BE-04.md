<a id="task-INFRA-TASK-BE-04"></a>
### INFRA-TASK-BE-04

- **Task ID:** INFRA-TASK-BE-04
- **Title:** Add registry read and entry parse helper
- **Outcome:** feature-split.js has a helper that reads <features root>/REGISTRY.md (returning an empty registry when the file is missing) and parses entries in the '## FTR-NNN — Title' format with Keywords, Status, Summary, Parent, Depends on and Detail lines separated by '---'; an unreadable file throws FeatureSplitError REGISTRY_IO.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 12
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split registry read helper

**Implementation notes:**

This task adds two functions to `src/claude/scripts/feature-split.js`, which BE-01 creates: `parseRegistry(text)` (pure parsing) and `readRegistry(featuresRoot)` (file I/O). Both are added to the existing `exports` object. Do not add a `main` call or any command here. BE-02 owns the facade, so the module must not run anything when `require`d.

Inputs and assumptions:
- `featuresRoot` is passed in by the caller. It is already resolved through `ai-toolkit resolve-features-root`. This helper does not resolve paths itself and does not hard-code `docs/features/` or `internal_docs/features/`.
- `FeatureSplitError` comes from BE-01. The skeleton does not state its constructor signature. The code below assumes `new FeatureSplitError(code, message, { key, file })`. Before writing, check BE-01's actual constructor and adjust the call. Do not guess a different signature silently.
- The registry format is the verified one from Tech-Spec Section 1 and Flow D step 9. Heading: `## FTR-NNN — Title` (em dash). Bold-key lines: `**Keywords:**`, `**Status:**`, `**Summary:**`, `**Parent:**`, `**Depends on:**`. Detail line: `→ [Detail](<relative path>)`. Entries are separated by a line that is exactly `---`.
- The spec does not define the separator used inside the Keywords value. This helper stores Keywords as the trimmed raw string and does not split it.

Implementation (add near the other helpers, before `module.exports`):

```javascript
const REGISTRY_FILE = 'REGISTRY.md';
const HEADING_RE = /^## (FTR-\d{3,}) — (.+?)\s*$/;
const KEY_RE = /^\*\*(Keywords|Status|Summary|Parent|Depends on):\*\*\s?(.*)$/;
const DETAIL_RE = /^→ \[Detail\]\((.+)\)\s*$/;

function emptyEntry(id, title) {
  return { id, title, keywords: '', status: '', summary: '', parent: null, dependsOn: [], detail: null };
}

function assignKey(entry, key, value) {
  switch (key) {
    case 'Keywords':   entry.keywords = value; break;
    case 'Status':     entry.status = value; break;
    case 'Summary':    entry.summary = value; break;
    case 'Parent':     entry.parent = value || null; break;
    case 'Depends on':
      entry.dependsOn = value === '' || value === 'none'
        ? []
        : value.split(',').map(s => s.trim()).filter(Boolean);
      break;
  }
}

// Pure: text -> entries. Lines before the first heading are ignored.
// A non-key, non-blank line directly after **Summary:** continues the summary.
function parseRegistry(text) {
  const entries = [];
  let current = null;
  let lastKey = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === '---') { current = null; lastKey = null; continue; }
    const h = HEADING_RE.exec(line);
    if (h) { current = emptyEntry(h[1], h[2]); entries.push(current); lastKey = null; continue; }
    if (!current) continue;
    const k = KEY_RE.exec(line);
    if (k) { lastKey = k[1]; assignKey(current, k[1], k[2].trim()); continue; }
    const d = DETAIL_RE.exec(line);
    if (d) { current.detail = d[1]; lastKey = 'detail'; continue; }
    if (lastKey === 'Summary' && line.trim() !== '') {
      current.summary = (current.summary + ' ' + line.trim()).trim();
    }
  }
  return entries;
}

// I/O: missing file -> empty registry (not an error). Any other read failure -> REGISTRY_IO.
function readRegistry(featuresRoot) {
  const registryPath = path.join(featuresRoot, REGISTRY_FILE);
  let text;
  try {
    text = fs.readFileSync(registryPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { path: registryPath, exists: false, entries: [] };
    throw new FeatureSplitError('REGISTRY_IO',
      `cannot read registry: ${err.message}`, { file: registryPath });
  }
  return { path: registryPath, exists: true, entries: parseRegistry(text) };
}
```

Add `parseRegistry` and `readRegistry` to the existing `module.exports` object. Keep the existing entries.

Behaviour to preserve:
- A missing file returns `{ exists: false, entries: [] }` and does not throw. A directory named `REGISTRY.md` fails with `EISDIR`, which is not `ENOENT`, so it throws `REGISTRY_IO`.
- `Depends on: none` and an empty value both produce `dependsOn: []`.
- `Parent:` with an empty value produces `parent: null`.
- The helper never writes to disk. The temp-and-rename write belongs to BE-05.
- Do not call `parseRegistry` on the whole file expecting the header text to be an entry. Text before the first heading is skipped.

No test block is required for a BE task. BE-TEST-01 covers this helper later. The verification commands below check syntax, the missing-file path, and the existing suite.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const m=require('./src/claude/scripts/feature-split.js'); const r=m.readRegistry(require('os').tmpdir()+'/ftr-no-such-root-be04'); if(r.exists!==false||r.entries.length!==0) process.exit(1)"
```

```
npm test
```