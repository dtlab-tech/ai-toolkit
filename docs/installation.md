# Installation

The toolkit is published to a **private Azure Artifacts feed** and can be installed into a single project (local) or made available system-wide (global).

## Prerequisites: authenticate to the feed

The package lives at `https://pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/`. Before any `npm` or `npx` command can reach it, your machine needs:

1. **A scope mapping** that tells npm "the `@denistomada` scope lives on this registry".
2. **An auth token** for that registry.

### Step 1 — Create or edit `~/.npmrc`

Add the scope mapping to your **user-level** `.npmrc` (so it applies to every project):

```
@denistomada:registry=https://pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/
```

File location:
- **Windows**: `%USERPROFILE%\.npmrc` (e.g. `C:\Users\<you>\.npmrc`)
- **macOS / Linux**: `~/.npmrc`

#### Example `~/.npmrc` after setup (Windows — token injected by `vsts-npm-auth`)

```ini
# Scope mapping: tells npm where to find @denistomada packages
@denistomada:registry=https://pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/

# Auth token injected automatically by vsts-npm-auth (or manually via PAT)
//pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:_authToken=<TOKEN>
```

#### Example `~/.npmrc` after setup (macOS / Linux — PAT-based)

```ini
# Scope mapping
@denistomada:registry=https://pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/

# PAT-based auth (base64-encoded PAT)
//pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:username=denistomada
//pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:_password=<BASE64_PAT>
//pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:email=npm requires email to be set but doesn't use the value
```

> Never commit your `.npmrc` with tokens into a git repository.

### Step 2 — Add an auth token

#### Option A — Windows (easiest)

Install and run `vsts-npm-auth` once. It opens a browser, logs you into Azure DevOps, and writes the token into `~/.npmrc` automatically.

```bash
npm install -g vsts-npm-auth
vsts-npm-auth -config %USERPROFILE%\.npmrc
```

The token expires every 90 days; re-run the same command to refresh.

#### Option B — macOS / Linux (Personal Access Token)

`vsts-npm-auth` is Windows-only. On other OSes generate a PAT manually:

1. Azure DevOps → top-right user icon → **Personal access tokens** → **+ New Token**
2. Scopes: **Packaging → Read & write**
3. Copy the token, then base64-encode it:
   ```bash
   echo -n "<PASTE_PAT_HERE>" | base64
   ```
4. Append to `~/.npmrc`:
   ```
   //pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:username=denistomada
   //pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:_password=<BASE64_TOKEN>
   //pkgs.dev.azure.com/denistomada/swf-ai-toolkit/_packaging/swf-ai-toolkit/npm/registry/:email=npm requires email to be set but doesn't use the value
   ```

### Step 3 — Verify

```bash
npm view @denistomada/swf-ai-toolkit version
```

If you see a version number, auth works. If you get `401`, re-check the token.

---

## Usage

### Local installation (default)

Copies `.claude/`, `docs/`, and `CLAUDE.md` into the current directory:

```bash
npx @denistomada/swf-ai-toolkit
```

Target a different directory:

```bash
npx @denistomada/swf-ai-toolkit --local /path/to/project
```

Overwrite existing files without confirmation:

```bash
npx @denistomada/swf-ai-toolkit --local . --force
```

### Global installation

Merges `.claude/agents`, `.claude/skills`, `docs/`, and `CLAUDE.md` into `~/.claude/`:

```bash
npm install -g @denistomada/swf-ai-toolkit
swf-ai-toolkit --global
```

Force overwrite:

```bash
swf-ai-toolkit --global --force
```

### What gets copied where

| Mode | Source (in package) | Destination |
|---|---|---|
| Local | `.claude/` | `<target>/.claude/` |
| Local | `docs/` | `<target>/docs/` |
| Local | `CLAUDE.md` | `<target>/CLAUDE.md` |
| Global | `.claude/agents/` | `~/.claude/agents/` |
| Global | `.claude/skills/` | `~/.claude/skills/` |
| Global | `.claude/commands/` | `~/.claude/commands/` |
| Global | `docs/` | `~/.claude/docs/` |
| Global | `CLAUDE.md` | `~/.claude/CLAUDE.md` |

> The asymmetry is intentional: locally you mirror the package layout, globally you merge into Claude Code's standard folder structure.
