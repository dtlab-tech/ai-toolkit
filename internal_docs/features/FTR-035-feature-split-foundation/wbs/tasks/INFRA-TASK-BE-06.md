<a id="task-INFRA-TASK-BE-06"></a>
### INFRA-TASK-BE-06

- **Task ID:** INFRA-TASK-BE-06
- **Title:** Add first-sentence summary helper
- **Outcome:** feature-split.js exports a helper that returns the text up to the first period followed by whitespace from a Summary string.
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** INFRA-TASK-BE-01
- **Acceptance criteria:** —
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 8000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** feat
- **Commit scope:** —
- **Commit subject:** add feature-split first-sentence helper

**Implementation notes:**

This task only adds one pure function to the file created by INFRA-TASK-BE-01 (`src/claude/scripts/feature-split.js`). It does not touch the facade, the registry, or any file on disk. I have not seen the BE-01 file contents, so the export step below assumes BE-01 defined a plain `module.exports = { ... }` object, as its skeleton entry states. If the actual shape differs, adapt the export line to match and keep the function unchanged.

Decisions the Tech-Spec does not settle, which the implementer should keep as written here:

1. **Terminal period is kept.** The spec says "text up to the first period followed by whitespace". The returned string includes that period, because a sentence normally keeps its full stop. The registry Summary line then reads as a sentence.
2. **No period-plus-whitespace match.** The function returns the whole trimmed text. This covers a Summary with no internal sentence break, and a Summary that ends with a period and nothing after it.
3. **Known limitation.** Abbreviations such as "e.g. " or "v1.2 " followed by a space are treated as sentence ends. The spec defines the rule this way, so the helper follows it.

New function (add above the exports block):

```javascript
// Returns the first sentence of a Summary string: the text up to and including
// the first '.' that is followed by whitespace. If there is no such period,
// the whole trimmed text is returned.
function firstSentence(summary) {
  const text = String(summary).trim();
  const match = /^[\s\S]*?\.(?=\s)/.exec(text);
  return match ? match[0] : text;
}
```

Export. Add it to the existing exports object, without removing or renaming the entries BE-01 created:

```javascript
// Before (BE-01 state, shape assumed):
module.exports = { FeatureSplitError };

// After:
module.exports = { FeatureSplitError, firstSentence };
```

If BE-01 has already added other exports, keep them all and append `firstSentence` only.

Guard: BE-02 adds the facade. Make sure requiring the module does not run the CLI. The facade's main dispatch must sit behind `if (require.main === module)`. If it does not, stop and report it, because the verification commands below depend on a side-effect-free `require`. Do not change the facade in this task.

Expected results (these are the cases the verification command checks):

| Input | Output |
|-------|--------|
| `Adds X. Then Y.` | `Adds X.` |
| `No period here` | `No period here` |
| `  Ends here.  ` | `Ends here.` |
| `Version 1.2 is out. Next.` | `Version 1.2 is out.` (the "1.2" period is followed by "2", not whitespace, so it does not end the sentence) |

**Verification commands:**

```
node --check src/claude/scripts/feature-split.js
```

```
node -e "const assert=require('assert');const {firstSentence:f}=require('./src/claude/scripts/feature-split.js');assert.strictEqual(f('Adds X. Then Y.'),'Adds X.');assert.strictEqual(f('No period here'),'No period here');assert.strictEqual(f('  Ends here.  '),'Ends here.');assert.strictEqual(f('Version 1.2 is out. Next.'),'Version 1.2 is out.');console.log('firstSentence ok')"
```

```
npm test
```