---
description: "PR Description — generates a pull request description from current branch commits and the linked feature.md. Usage: /pr-description"
allowed-tools: Read, Glob, Grep, Bash
---

Generate a pull request description for the current branch.

Steps:
1. Determine the current branch name: `git rev-parse --abbrev-ref HEAD`.
2. Extract a feature identifier from the branch name (look for `FTR-XXX` or a slug pattern).
3. Find the matching feature folder under `docs/features/`. If multiple match, ask the user.
4. Read `feature.md` (and `{PREFIX}-Requirements.md` if present) for context.
5. Collect the commits on this branch: `git log --no-merges $(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master)..HEAD --pretty=format:"%h %s"`. If neither `main` nor `master` exists, ask the user for the base branch.
6. Produce the PR description using this exact template:

   ```markdown
   ## Summary
   <2–4 bullet points: what changed and why, framed from the feature.md goal>

   ## Changes
   <bullet list grouped by area: Backend / Frontend / DB / Tests / Docs — only include groups that have actual changes>

   ## Test plan
   - [ ] <concrete test step 1>
   - [ ] <concrete test step 2>
   - [ ] <concrete test step 3>

   ## Linked feature
   `docs/features/<folder>/feature.md`
   ```

7. Output ONLY the markdown above (no preamble, no postscript). The user will copy-paste it into the PR.

If you cannot find a matching feature folder, fall back to generating the description from commits alone and note this in a single line above the output.
