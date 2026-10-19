<a id="task-US-04-TASK-BE-02"></a>
### US-04-TASK-BE-02

- **Task ID:** US-04-TASK-BE-02
- **Title:** Describe the AC-matched Tech-Spec excerpt contract in the per-task agent
- **Outcome:** gaia-generate-work-breakdown-task.md's Input §2 wording changes from "the relevant Tech-Spec excerpt for this task's domain" to naming the actual Addresses-column matching mechanism and documenting the full-Components-table fallback case
- **Domain:** BE
- **Agent type:** developer-backend
- **Dependencies:** US-04-TASK-BE-01
- **Acceptance criteria:** AC-06
- **Estimate — agent minutes:** 10
- **Estimate — tokens:** 12000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** docs
- **Commit scope:** gaia-generate-work-breakdown-task
- **Commit subject:** describe the AC-matched Tech-Spec excerpt contract

**Implementation notes:**

Edit `src/claude/agents/gaia-generate-work-breakdown-task.md`'s Input §2 only:

```markdown
<!-- BEFORE -->
2. **The relevant Tech-Spec excerpt** for this task's domain (not the whole Tech-Spec — keeps this
   call small, which is the whole point of the per-task split).

<!-- AFTER -->
2. **The relevant Tech-Spec excerpt** for this task's own Acceptance Criteria (matched by the host
   against each component's `Addresses` column in `spec/index.md` — not the whole Tech-Spec, which
   is the whole point of the per-task split). If no component's `Addresses` column cites any of
   this task's Acceptance Criteria, you instead receive the full Components table from
   `spec/index.md` as a fallback — in that case, use your own judgment about which listed
   component(s) are actually relevant, the same way you would if asked to work from the full
   Tech-Spec directly.
```

This corrects a real pre-existing gap: this agent's own `description` frontmatter and this Input
section already claimed to receive an excerpt before US-04-TASK-BE-01 made that claim true — the
wording is now accurate about the actual mechanism (AC/Addresses matching, not "domain", which would
be a cruder filter since a feature can have several same-domain components addressing different ACs).

**Verification commands:**

```
echo "prompt-only change — no automated test; verified by review against US-04-TASK-BE-01's implementation"
```
