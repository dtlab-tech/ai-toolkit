# E-01 — Exact verified agent + controlled context (evidence + provenance binding)

Audit date: 2026-09-22. Original runs: 2026-09-20/21. **Provenance binding CLOSED 2026-09-28.**

> **RESOLVED 2026-09-28 — provenance binding established (was Case 2).**
> The isolated proof below was executed once under explicit user authorization (hard cap $0.03,
> no retry; actual spend **$0.01727565**). Isolation was verified **without any LLM call** using
> claude.exe's own `--debug` output as ground truth (env-var isolation was first *disproven* — see
> `iso-discovery.js`). Artifacts: `iso-e01-run.js` (harness), `iso-discovery.js` (env-var isolation
> disproof), `positive-source-naming.log` (CLI names the load source), `run-verify-debug-*.log`
> (free isolation probe), `run-paid-debug-*.log` + `run-paid-stdout-*.json` (the single paid run),
> `iso-run-result-*.json` (structured result).
>
> **Proven (this run):** the definition claude.exe loads for `gaia-developer-backend` is
> `C:\Users\Tomada D\.claude\agents\gaia-developer-backend.md` (userSettings) — declared by the CLI
> itself ("Skipping duplicate … already loaded from userSettings"); managed dir ENOENT, plugin
> agents 0, no competing project copy ⇒ **single reachable source**. Its sha256 == `7457e83…f11`
> **before and after** the run (unmodified). The agent executed: exit 0, `is_error:false`,
> schema-valid `{"status":"done","marker":"E01ISO-1790178069710"}`, model **sonnet** (`claude-sonnet-4-6`).
> This binds *verified-hash → loaded-definition* via the CLI's ground truth — **no model-declared
> hash, no modification of the installed agent**.
>
> **Residual limit (this run):** worktree **persistence was NOT reproduced here** — the Write tool
> was **permission-denied** because the isolated cwd sits outside the `//c/ws/**` allow-rule scope
> and `acceptEdits` does not auto-approve in non-interactive `--print` mode (`run-paid-debug-*.log`:
> "Write tool permission denied"). The model still returned `status:done` — a clean demonstration
> that **model self-report ≠ persistence**. Persistence itself remains proven by the original Test B
> (`out-B.json` + `worktree-oq01a-proof.txt`); it is orthogonal to the provenance binding and was
> not re-run (user chose to rely on the prior evidence rather than authorize a second call).

## What the retained artifacts prove

| Artifact | Proves |
|---|---|
| `out-alpha.json` (`result` = `OQ01A-ALPHA-17899413113467`) / `out-beta.json` (`OQ01A-BETA-...`) | **Selection mechanism**: `--agents`+`--agent` loads the selected definition's system prompt, shown by an independently observable output marker (not token/cache inference), no cross-contamination, not a default. |
| `out-B.json` (`structured_output` `{"status":"done","marker":"17899413113467"}`, `canonicalModel: claude-sonnet-4-6`, `is_error: false`) | **Execution + result contract**: a real `--agent gaia-developer-backend` run returns schema-valid structured output; the declared `sonnet` model is honoured. |
| `worktree-oq01a-proof.txt` (= nonce) | **Persistence**: the worker wrote the marker file into the assigned git worktree. |

## Open gap identified 2026-09-22 — provenance binding is NOT established (Case 2)

Code audit of the commands as run (`commands-as-run.sh`, reconstructed from the transcript)
shows **Test B passed only the agent NAME** (`--agent gaia-developer-backend`, `cwd` = worktree,
`--add-dir` = worktree). `claude.exe` **re-resolves that name from its own agent search path**.

The toolkit's `resolveAgent()` hash check (→ `sha256:7457e83…f11`) was a **separate, independent
resolution** performed in Node. The two resolutions matched in bytes only because every copy of
`gaia-developer-backend.md` on disk (worktree, project `.claude/`, global `~/.claude/`) was
byte-identical at the time. **No verified bytes were passed to the process**, and the run does not
record which file `claude.exe` actually loaded. Therefore the chain *verified-hash → loaded-definition*
is **inferential**, not proven, for this run.

Note: a model-declared hash would NOT close this (the model can echo any string), and appending a
signature to the definition would change its hash — neither is admissible.

## Isolated proof (EXECUTED 2026-09-28 — see RESOLVED note at top)

> The method below was the *proposal*; it was refined during execution. Key correction: **environment
> variables do NOT isolate claude.exe's agent search on Windows** (disproven by `iso-discovery.js` —
> HOME/USERPROFILE/HOMEDRIVE/CLAUDE_CONFIG_DIR all failed to remove the real agents). Isolation was
> instead established by claude.exe's own `--debug` output (ground truth of the loaded file) plus
> source-uniqueness (managed ENOENT, plugins 0, no competing project copy), and sha256 before/after.
> The original proposal text is preserved below for history.

Goal: make the definition `claude.exe` loads provably identical to the Node-hash-verified bytes,
using only Node/filesystem evidence, without modifying the installed agent and without any
model-declared hash.

**Method — single reachable definition (search-path isolation):**
1. Node creates an isolated runtime dir `ISO/` and an **empty** isolated HOME `ISO_HOME/` (no `.claude/agents`).
2. Node copies the installed `gaia-developer-backend.md` into `ISO/.claude/agents/`, then computes
   its sha256 and asserts `== 7457e83…f11` (the value `resolveAgent` reports for the source).
3. Node **enumerates every path** `claude.exe` could resolve the agent from given `HOME=ISO_HOME`,
   `cwd=ISO`, `--add-dir ISO`, and asserts **exactly one** `gaia-developer-backend.md` is reachable
   (the verified copy). This is logged.
4. Node spawns `claude.exe --print --output-format json --json-schema <s> --agent gaia-developer-backend
   --add-dir ISO <prompt-with-fresh-nonce>` with `env.HOME=env.USERPROFILE=ISO_HOME`, `cwd=ISO`.
5. Because only one definition is reachable and its hash was verified pre-spawn, the loaded system
   prompt is necessarily the verified bytes.

**Success criteria (all Node/filesystem-observable, no model hash):**
- pre-spawn: `sha256(sole reachable definition) == 7457e83…f11`; enumeration shows exactly ONE candidate.
- run: exit 0, `is_error:false`, `structured_output` schema-valid echoing the fresh nonce.
- marker file persisted in `ISO`.
- negative control: a tampered copy → `resolveAgent(--require-verified)` throws pre-spawn → Node
  refuses to spawn (dispatch gated).

**Assumption the proof itself validates:** that `claude.exe` resolves agents only from
`HOME/.claude/agents` + `cwd/.claude/agents` + `--add-dir`. If it resolved from elsewhere, step 4
would find no definition and error — which would itself surface the hidden source.

**Estimated budget:** ≤ **$0.03** (one small run; ~$0.015 expected), hard-capped via `--max-budget-usd 0.03`.
Runs entirely under `%TEMP%`/isolated HOME; no real install, repo, or auth touched. **Not run yet.**
