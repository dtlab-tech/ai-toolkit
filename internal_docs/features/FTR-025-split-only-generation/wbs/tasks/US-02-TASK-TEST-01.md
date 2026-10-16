<a id="task-US-02-TASK-TEST-01"></a>
### US-02-TASK-TEST-01

- **Task ID:** US-02-TASK-TEST-01
- **Title:** Unit tests for assemble-docs.js
- **Outcome:** tests/assemble-docs.test.js exists covering: assembleReq/assembleSpec/assembleWbs against real split fixtures producing output identical to calling the underlying assemblers/wb-render.js directly; CLI 'all' writing all five files; CLI with an unknown 'which' exiting 1; CLI for req/spec/wbs against a feature directory missing the matching split directory exiting 2 and naming the exact expected path; missing required CLI arguments exiting 1
- **Domain:** TEST
- **Agent type:** developer-testing
- **Dependencies:** US-02-TASK-BE-01
- **Acceptance criteria:** AC-07, AC-11
- **Estimate — agent minutes:** 18
- **Estimate — tokens:** 24000
- **Output count:** 1
- **Grouping rationale:** —
- **Commit type:** test
- **Commit scope:** —
- **Commit subject:** add unit tests for assemble-docs.js

**Implementation notes:**

Follow the same hand-built-fixture pattern `tests/tech-spec-assembler.test.js`/
`tests/req-assembler.test.js` already use: temp directories under `os.tmpdir()`, cleaned up in
`afterEach`, no mocked LLM calls (this script has none). Use `spawnSync('node', [...])` for the CLI
exit-code/stderr assertions, and direct `require(...)` calls for the three exported functions'
own output-correctness assertions.

**Verification commands:**

```
npx jest --testPathPattern=tests/assemble-docs.test.js
```
