# Installation

The toolkit is published to the **public npm registry** under the `@dtlabs` organization.

- **Package**: `@dtlabs/ai-toolkit`
- **Registry**: `https://registry.npmjs.org/`

No authentication setup required — it is a public package.

---

## Usage

### Local installation (default)

Copies all asset categories from the toolkit's `src/claude/` tree into the target project's `.claude/`
directory, plus `docs/` and `CLAUDE.md`:

```bash
npx @dtlabs/ai-toolkit
```

Target a different directory:

```bash
npx @dtlabs/ai-toolkit --local /path/to/project
```

Overwrite existing files without confirmation:

```bash
npx @dtlabs/ai-toolkit --local . --force
```

Preview what would change without writing any files (dry run):

```bash
npx @dtlabs/ai-toolkit --local . --dry-run
```

### Global installation

Merges all asset categories into `~/.claude/<category>/`, plus `docs/` and `CLAUDE.md`:

```bash
npm install -g @dtlabs/ai-toolkit
ai-toolkit --global
```

Force overwrite:

```bash
ai-toolkit --global --force
```

Preview the global install without writing any files:

```bash
ai-toolkit --global --dry-run
```

### Asset catalog

The installer derives the list of installable directories from the **asset catalog**
(`lib/asset-catalog.js`). Each catalog entry defines:

| Field | Description |
|---|---|
| `name` | Category name (e.g. `agents`, `skills`) |
| `sourceDir` | Location inside the package (`src/claude/<name>`) |
| `runtimeDir` | Destination inside the installed `.claude/` folder (`.claude/<name>`) |

Adding a new category to the catalog automatically includes it in every install — no
changes to `bin/cli.js` are required.

### What gets copied where

| Mode | Source (in package) | Destination |
|---|---|---|
| Local | `src/claude/agents/` | `<target>/.claude/agents/` |
| Local | `src/claude/skills/` | `<target>/.claude/skills/` |
| Local | `src/claude/commands/` | `<target>/.claude/commands/` |
| Local | `src/claude/workflows/` | `<target>/.claude/workflows/` |
| Local | `src/claude/scripts/` | `<target>/.claude/scripts/` |
| Local | `docs/` | `<target>/docs/` |
| Local | `CLAUDE.md` | `<target>/CLAUDE.md` |
| Global | `src/claude/agents/` | `~/.claude/agents/` |
| Global | `src/claude/skills/` | `~/.claude/skills/` |
| Global | `src/claude/commands/` | `~/.claude/commands/` |
| Global | `src/claude/workflows/` | `~/.claude/workflows/` |
| Global | `src/claude/scripts/` | `~/.claude/scripts/` |
| Global | `docs/` | `~/.claude/docs/` |
| Global | `CLAUDE.global.md` | `~/.claude/CLAUDE.md` |

> The toolkit sources assets from `src/claude/` (versioned, purity-guarded), not from
> `.claude/` at the project root. The `.claude/` folder in the toolkit repository is for
> personal configuration only (gitignored).

---

## Upgrade path

When a newer version of the toolkit is installed over an existing one, the installer
automatically detects and removes **orphaned files** — files that were part of a previous
installation but no longer exist in the current package.

Orphaned files are moved to `.claude/.ai-toolkit-trash/<timestamp>/` rather than
deleted outright, so they can be recovered if needed. Each upgrade session uses a
unique ISO-timestamp subdirectory, ensuring that repeated upgrades never overwrite
previously trashed files.

The manifest (`.claude/.ai-toolkit-manifest.json`) is updated after each install to
reflect the current file set. The trash directory is excluded from the manifest automatically.

---

## Developer workflow

When developing the toolkit itself, use the convenience scripts in `package.json`:

```bash
# Preview global install without writing files
npm run toolkit:dev-install-global
# (this runs --global --dry-run first, then --global)

# Validate that no test files have crept into src/claude/
npm run toolkit:validate-purity
```

---

## Verify installation

```bash
npm view @dtlabs/ai-toolkit version
```
