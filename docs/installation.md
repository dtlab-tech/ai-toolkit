# Installation

The toolkit is published to a **private Azure Artifacts feed** and can be installed into a single project (local) or made available system-wide (global).

- **Feed**: `swf-ai-toolkit`
- **Registry**: `https://pkgs.dev.azure.com/Fincantieri-Spa/_packaging/swf-ai-toolkit/npm/registry/`
- **Package**: `@fincantieri/swf-ai-toolkit`

## Prerequisites: authenticate to the feed

### Step 1 — Create or edit `~/.npmrc`

Add the scope mapping to your **user-level** `.npmrc` (so it applies to every project):

```ini
registry=https://pkgs.dev.azure.com/Fincantieri-Spa/_packaging/swf-ai-toolkit/npm/registry/
always-auth=true
```

File location:
- **Windows**: `%USERPROFILE%\.npmrc` (e.g. `C:\Users\<you>\.npmrc`)
- **macOS / Linux**: `~/.npmrc`

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
   ```ini
   //pkgs.dev.azure.com/Fincantieri-Spa/_packaging/swf-ai-toolkit/npm/registry/:username=<your-ado-username>
   //pkgs.dev.azure.com/Fincantieri-Spa/_packaging/swf-ai-toolkit/npm/registry/:_password=<BASE64_PAT>
   //pkgs.dev.azure.com/Fincantieri-Spa/_packaging/swf-ai-toolkit/npm/registry/:email=npm requires email to be set but doesn't use the value
   ```

> Never commit your `.npmrc` with tokens into a git repository.

### Step 3 — Verify

```bash
npm view @fincantieri/swf-ai-toolkit version
```

If you see a version number, auth works. If you get `401`, re-run `vsts-npm-auth` (Windows) or check your PAT (macOS/Linux).

---

## Usage

### Local installation (default)

Copies `.claude/`, `docs/`, and `CLAUDE.md` into the current directory:

```bash
npx @fincantieri/swf-ai-toolkit
```

Target a different directory:

```bash
npx @fincantieri/swf-ai-toolkit --local /path/to/project
```

Overwrite existing files without confirmation:

```bash
npx @fincantieri/swf-ai-toolkit --local . --force
```

### Global installation

Merges `.claude/agents`, `.claude/skills`, `docs/`, and `CLAUDE.md` into `~/.claude/`:

```bash
npm install -g @fincantieri/swf-ai-toolkit
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
