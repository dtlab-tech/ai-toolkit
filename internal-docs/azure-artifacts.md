# Publishing to Azure Artifacts (internal)

Internal notes for maintainers publishing the `@denistomada/swf-ai-toolkit` package to Azure Artifacts. This file lives in `internal-docs/` and is **not** included in the published npm package (excluded by the `files` whitelist in `package.json`).

## Feed coordinates

- **Organization**: `denistomada`
- **Project**: `swf-ai-toolkit`
- **Feed**: `swf-ai-toolkit`
- **Registry URL**: `https://pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/`

The URL is hard-coded in two places:

- `azure-pipelines.yml` → `variables.NPM_REGISTRY`
- `package.json` → `publishConfig.registry`

Keep them in sync if the feed moves.

## How the pipeline publishes

`azure-pipelines.yml` is triggered on every push to `master` and runs on `ubuntu-latest`. The flow:

1. **`NodeTool@0`** installs Node 20.
2. **Create `.npmrc` skeleton** — a one-line file with only the `registry=` directive (no credentials).
3. **`NpmAuthenticate@0`** with `workingFile: .npmrc` — injects the Build Service OAuth token into the file as `_authToken`. Cross-platform, supersedes the legacy `vsts-npm-auth` (which is Windows-only).
4. **`npm version "0.1.$(Build.BuildId)" --no-git-tag-version --allow-same-version`** — sets the package version to `0.1.<BuildId>`. Modifies `package.json` in the working directory only (no commit, no push back to git).
5. **`npm publish --userconfig .npmrc`** — publishes the tarball to the feed. `SYSTEM_ACCESSTOKEN` is passed as env var so the token is available even though `NpmAuthenticate@0` already wrote it.

## Required Azure DevOps permissions

The pipeline runs as identity `swf-ai-toolkit Build Service (denistomada)`. It must have:

- **Artifacts → Feed `swf-ai-toolkit` → Permissions**: role **Feed Publisher (Contributor)** (or higher).

No git push permissions are required (versioning is in-memory only).

## Local publish (for testing)

You normally **do not** publish from your local machine — the pipeline does it. If you really need to:

```bash
# Authenticate (Windows). On macOS/Linux generate a PAT manually.
vsts-npm-auth -config .npmrc

# Bump version manually (any unused patch number)
npm version patch --no-git-tag-version

# Publish
npm publish
```

## Versioning strategy

The current strategy is **Build number** (`0.1.$(Build.BuildId)`):

- Pros: zero git permissions, no risk of trigger loops, every build produces a unique version.
- Cons: version numbers are not strictly sequential (`Build.BuildId` increments across all pipelines in the project).

To switch to a semver-driven strategy in the future, restore the previous step that ran `npm version patch -m "..." [skip ci]` + `git push --follow-tags`. That requires the Build Service to have **Contribute** and **Create tag** permissions on the repository, plus the ability to bypass branch policies on `master`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401 Unauthorized` on publish | `NpmAuthenticate@0` step missing, or `--userconfig .npmrc` not passed |
| `403 Forbidden` on publish | Build Service is only a Reader on the feed — promote to Contributor |
| `409 Conflict — cannot publish over existing version` | Same `$(Build.BuildId)` ran twice (rare) — re-run the pipeline |
| `EBADENGINE` / `npm` complains about `always-auth` | Old `.npmrc` cached. Ensure the skeleton step does not write `always-auth=true` |
