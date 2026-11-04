<a id="task-US-05-TASK-BE-01"></a>
### US-05-TASK-BE-01

- **Task ID:** US-05-TASK-BE-01
- **Title:** Add feature.md reader for register
- **Outcome:** feature-split.js has a readFeatureForRegister helper that reads <featureDir>/feature.md and returns the feature ID (from the FTR-NNN folder prefix), the title (first H1) and the first sentence of the Summary section. It throws FeatureSplitError FEATURE_INVALID when feature.md is missing, unreadable, or has no Summary section, and PARENT_INVALID when epic.md is present in the folder.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01, INFRA-TASK-BE-06
- **Acceptance criteria:** AC-37
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 9000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature.md reader for register

**Implementation notes:**

Modify `src/claude/scripts/feature-split.js` (created by INFRA-TASK-BE-01). Add one internal helper, `readFeatureForRegister(featureDir)`, and a small section extractor. Do not export the helper: the Tech-Spec export list is `FeatureSplitError, loadConfig, isNewFeature, isOverThreshold, meetsMinimum, buildProposal, editProposal, apply, register`, and this task does not change it. US-05-TASK-TEST-01 and US-05-TASK-TEST-04 exercise the helper through `register`. Do not change the existing `register` body in this task; US-05-TASK-BE-02 replaces it to call this helper.

Reuse `firstSentence` from INFRA-TASK-BE-06. The Tech-Spec's version also ends sentences on `!` and `?`, but the INFRA-TASK-BE-06 outcome says only "period followed by whitespace". Check the helper that exists in the file before writing this code. If it is period-only, use it as is and note the difference in the commit or PR, since no task in the skeleton decides it.

Decisions this task makes where the outcome is silent:
- **Check order.** Check `epic.md` before reading `feature.md`. After a split the parent folder has no `feature.md`, so a folder holding `epic.md` must report `PARENT_INVALID`, not `FEATURE_INVALID`.
- **Missing FTR prefix.** Throw `FEATURE_INVALID`. The outcome does not cover it.
- **Missing H1.** Throw `FEATURE_INVALID`. The outcome does not list this case, but the title cannot be returned without it.
- **Empty Summary body.** Return `summary: ''`. The outcome does not cover this case, so `register` decides what to do with it.
- **Unreadable file.** Map every read error to `FEATURE_INVALID`, as the outcome says. This overrides the Tech-Spec `register` code, which uses `FEATURE_UNREADABLE`.
- **Section end.** Do not use `\Z` in the regex. In JavaScript that matches a literal `Z`. Find the section by line instead.

```javascript
// Returns the body of a "## <heading>" section (exact heading match), or null if absent.
function sectionBody(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;          // next H2 ends the section; H3 stays inside it
    body.push(line);
  }
  return body.join('\n').trim();
}

// Internal (not exported). Used by register (US-05-TASK-BE-02).
function readFeatureForRegister(featureDir) {
  const dir = path.resolve(featureDir);
  const base = path.basename(dir);
  const idMatch = base.match(/^(FTR-\d+)/);
  if (!idMatch) fail('FEATURE_INVALID', `Folder ${base} has no FTR-NNN prefix`, { file: dir });

  // Checked before feature.md: a split parent has epic.md and no feature.md.
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
```

Behavior to check against the code:
- `fail` is the existing helper from the Tech-Spec skeleton. It throws `FeatureSplitError` with `code`, `key` and `file`.
- `fs.existsSync` is used only for the `epic.md` presence test. A permission error on that path is caught by the next `readFileSync`, which reports `FEATURE_INVALID`.
- The helper returns the three fields only. It never writes a file and never touches the registry.

Keep the file's CommonJS form and Node built-ins only (D-01). Do not add a dependency.

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
npm test
```