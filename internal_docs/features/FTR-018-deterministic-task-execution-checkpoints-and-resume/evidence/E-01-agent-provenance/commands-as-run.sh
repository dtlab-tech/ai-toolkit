#!/usr/bin/env bash
# E-01 — commands AS RUN on 2026-09-20/21 (reconstructed verbatim from the session transcript).
#
# DO NOT RE-RUN casually: Test A and Test B invoke claude.exe and COST MONEY (paid LLM).
# They are recorded here for provenance only. Any re-execution requires explicit user
# budget authorization (hard cap via --max-budget-usd).
#
# IMPORTANT (see README.md): these commands pass the agent by NAME (--agent gaia-developer-backend
# / --agent proof-alpha). claude.exe RE-RESOLVES that name from its own agent search path.
# The Node-side sha256 verification (resolveAgent -> 7457e83...) was a SEPARATE resolution.
# These runs therefore do NOT bind the loaded definition to the verified bytes — Case 2.

CLAUDE="/c/Users/Tomada D/AppData/Local/Claude-3p/claude-code/2.1.260/claude.exe"
SPIKE="/c/Users/Tomada D/AppData/Local/Temp/oq01a-spike"
NONCE="$(cat "$SPIKE/nonce.txt")"   # 17899413113467

# ---- Test A — differential sentinel (proves --agent selects a definition, via observable marker) ----
# agents.json defines two INLINE agents (proof-alpha, proof-beta) passed explicitly via --agents.
AGENTS="$(cat "$SPIKE/agents.json")"
"$CLAUDE" --print --output-format json --agents "$AGENTS" --agent proof-alpha \
  --max-budget-usd 0.02 "go" > "$SPIKE/out-alpha.json" 2> "$SPIKE/err-alpha.txt"
"$CLAUDE" --print --output-format json --agents "$AGENTS" --agent proof-beta \
  --max-budget-usd 0.02 "go" < /dev/null > "$SPIKE/out-beta.json" 2>/dev/null
# Verdict: out-alpha.result == "OQ01A-ALPHA-<nonce>", out-beta.result == "OQ01A-BETA-<nonce>",
# no cross-contamination. Proves the --agents/--agent selection mechanism, NOT the on-disk
# provenance of the installed gaia-developer-backend definition.

# ---- Test B — real installed agent by NAME (Case 2: CLI re-resolves the name) ----
WT="$SPIKE/worktree"
SCHEMA='{"type":"object","properties":{"status":{"type":"string"},"marker":{"type":"string"}},"required":["status","marker"],"additionalProperties":false}'
PROMPT="Using the Write tool, create a file named oq01a-proof.txt in the current working directory whose entire contents are exactly: ${NONCE}. After the file is written, produce the final structured output with status set to \"done\" and marker set to ${NONCE}."
cd "$WT"
"$CLAUDE" --print --output-format json --json-schema "$SCHEMA" \
  --agent gaia-developer-backend --tools Write \
  --permission-mode acceptEdits --add-dir "$WT" \
  --max-budget-usd 0.04 "$PROMPT" < /dev/null > "$SPIKE/out-B.json" 2> "$SPIKE/err-B.txt"
# Result: exit 0, structured_output {"status":"done","marker":"17899413113467"}, model sonnet,
# marker file persisted in the worktree. Proves EXECUTION + PERSISTENCE, NOT provenance binding.
