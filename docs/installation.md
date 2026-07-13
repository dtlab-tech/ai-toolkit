# Installation

The toolkit is published to the **public npm registry** under the `@dtlabs` organization.

- **Package**: `@dtlabs/swf-ai-toolkit`
- **Registry**: `https://registry.npmjs.org/`

No authentication setup required — it is a public package.

---

## Usage

### Local installation (default)

Copies `.claude/`, `docs/`, and `CLAUDE.md` into the current directory:

```bash
npx @dtlabs/swf-ai-toolkit
```

Target a different directory:

```bash
npx @dtlabs/swf-ai-toolkit --local /path/to/project
```

Overwrite existing files without confirmation:

```bash
npx @dtlabs/swf-ai-toolkit --local . --force
```

### Global installation

Merges `.claude/agents`, `.claude/skills`, `docs/`, and `CLAUDE.md` into `~/.claude/`:

```bash
npm install -g @dtlabs/swf-ai-toolkit
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

---

## Verify installation

```bash
npm view @dtlabs/swf-ai-toolkit version
```

---

## Publishing a new version

```bash
npm login                        # authenticate with your npmjs.com account
npm version patch                # bump version (patch / minor / major)
npm publish --access public      # --access public is required for scoped packages
```
