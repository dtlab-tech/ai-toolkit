## 0.1.4 (2026-07-21)
## [0.10.1](https://github.com/dtlab-tech/ai-toolkit/compare/v0.10.0...v0.10.1) (2026-08-12)


### Bug Fixes

* **installer:** exclude .claude/scripts/tests from distribution and npm pack ([9ac27c8](https://github.com/dtlab-tech/ai-toolkit/commit/9ac27c8bfe84707f177325afbf71843865a0aa7d))
* **installer:** exclude .claude/scripts/tests from distribution and npm pack ([3489618](https://github.com/dtlab-tech/ai-toolkit/commit/34896181a873daa17495c0682bd11fd529a11330))

## [0.10.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.9.0...v0.10.0) (2026-08-12)


### Features

* **FTR-014:** Atomic Work Breakdown validation pipeline ([59a3be5](https://github.com/dtlab-tech/ai-toolkit/commit/59a3be511238229ca49f280262306b26e5ceb9a0))
* **FTR-014:** INFRA-T01 Create .claude/scripts/ directory structure ([27773ac](https://github.com/dtlab-tech/ai-toolkit/commit/27773ac03d916ddb64acba03e2f9a21985a59886))
* **FTR-014:** INFRA-T02 Define WB JSON schema v2 constants ([52c45d0](https://github.com/dtlab-tech/ai-toolkit/commit/52c45d06576e2a7717f98d056953ae6ad821cc75))
* **FTR-014:** INFRA-T03 Create AC table parser test fixture ([4e6a7a3](https://github.com/dtlab-tech/ai-toolkit/commit/4e6a7a3490f4de53354ac7ae384a00f0e4f98e34))
* **FTR-014:** INFRA-T04 Define WB_WRAPPER_SCHEMA and WB_RENDER_SCHEMA in pm-phase2.js ([b92e81c](https://github.com/dtlab-tech/ai-toolkit/commit/b92e81c348f3ec4fc2b3b8fe14fd6ecdbd60c3fa))
* **FTR-014:** INFRA-T05 Create valid and invalid WB JSON test fixtures ([ea5233c](https://github.com/dtlab-tech/ai-toolkit/commit/ea5233c4b1fccd782682533596ddd4febadd3c29))
* **FTR-014:** INFRA-T06 Extract buildWaves algorithm as shared test utility ([0b2fd25](https://github.com/dtlab-tech/ai-toolkit/commit/0b2fd25bf0d11679b0fef9140bf688b811316f8c))
* **FTR-014:** INFRA-T07 Define duration policy constants in wb-validate.js ([cd6cfee](https://github.com/dtlab-tech/ai-toolkit/commit/cd6cfee7bffb4dfd1d9ebbf1cc4732cc9def6acf))
* **FTR-014:** INFRA-T08 Define wb-validate error catalog constants ([06a9cd8](https://github.com/dtlab-tech/ai-toolkit/commit/06a9cd8d4f4e3583b84ac62ae94138184a8d96b8))
* **FTR-014:** US-01-T01 Update generate-work-breakdown.md to produce schema v2 JSON ([44a9674](https://github.com/dtlab-tech/ai-toolkit/commit/44a9674f897bcb70cbddd11cd9f72f220765e512))
* **FTR-014:** US-01-T02 Generate Work Breakdown JSON for a test feature ([8b1f3ed](https://github.com/dtlab-tech/ai-toolkit/commit/8b1f3ed65cb75350c2f2c181f5a1e8a8a7642a10))
* **FTR-014:** US-01-T03 Verify schema v2 compliance of generated JSON ([afdc774](https://github.com/dtlab-tech/ai-toolkit/commit/afdc774b0fc56466eaddbb462bb1230ad31b7792))
* **FTR-014:** US-02-T01 Implement wb-validate.js entry point and schema version check ([8ff1c30](https://github.com/dtlab-tech/ai-toolkit/commit/8ff1c308934830551c0bae6a1122e68af10dbcd9))
* **FTR-014:** US-02-T02 Implement unique ID and required field validation ([c426adc](https://github.com/dtlab-tech/ai-toolkit/commit/c426adc3796cc0705a40bb8ac34b1b79ca9f85d0))
* **FTR-014:** US-02-T03 Implement task ID format, domain, agentType validation ([a2166f7](https://github.com/dtlab-tech/ai-toolkit/commit/a2166f76a1b9e4f1cd7de0925e9ff20fe6d2cb36))
* **FTR-014:** US-02-T04 Implement task dependency resolution — refs, self-dep, phase consistency ([8fe5906](https://github.com/dtlab-tech/ai-toolkit/commit/8fe59060643a2704ce8aa1bd8a363c8a4a1794ef))
* **FTR-014:** US-02-T05 Implement task cycle detection (DFS gray/black coloring) ([94e18a3](https://github.com/dtlab-tech/ai-toolkit/commit/94e18a342ae025ff7574ee1fd9b038a6de4dea60))
* **FTR-014:** US-02-T06 Implement phase-level dependency projection and cycle detection ([a6e7469](https://github.com/dtlab-tech/ai-toolkit/commit/a6e7469541957a2dab3a3d525a87f060f64b2ecd))
* **FTR-014:** US-02-T07 Implement phase schedulability check (buildWaves) ([6a710a1](https://github.com/dtlab-tech/ai-toolkit/commit/6a710a13c4a4e3132f79f90f9f0d286120e64fb0))
* **FTR-014:** US-02-T08 Implement duration policy checks (four-band classification) ([44a61fb](https://github.com/dtlab-tech/ai-toolkit/commit/44a61fb62370e06eb7ac1f6e20d0b3e2ec628195))
* **FTR-014:** US-02-T09 Implement verification commands, commit subject, grouping rationale checks ([cbd64f0](https://github.com/dtlab-tech/ai-toolkit/commit/cbd64f00331e03ac9582b656c3e75b0921246630))
* **FTR-014:** US-02-T10 Implement AC table parser (Section 3.2 contract) ([317abe4](https://github.com/dtlab-tech/ai-toolkit/commit/317abe4f4a5848370a68d6ad3bae7e8a92755c53))
* **FTR-014:** US-02-T11 Implement AC existence and scope validation (checks 19-20) ([132e97a](https://github.com/dtlab-tech/ai-toolkit/commit/132e97a804175a2d5b2a97cfbc8816031ea81c87))
* **FTR-014:** US-02-T12 Implement AC priority derivation and Must coverage check (check 21) ([6483986](https://github.com/dtlab-tech/ai-toolkit/commit/6483986959a603ba1dc75c321db9b08d8808a2be))
* **FTR-014:** US-02-T13 Implement text field character validation and empty phase detection (checks 22-23) ([d93464e](https://github.com/dtlab-tech/ai-toolkit/commit/d93464e13444e0969a5cb9e58ad0a1c0fc3b865c))
* **FTR-014:** US-02-T14 Implement domain distribution in validator report output ([2d462f0](https://github.com/dtlab-tech/ai-toolkit/commit/2d462f07a00be04275d15608d2916e15b56df44b))
* **FTR-014:** US-02-T15 Add Jest suite for wb-validate checks 1-7 (schema, IDs, fields, format, domain, agentType) ([0affff6](https://github.com/dtlab-tech/ai-toolkit/commit/0affff6d986ab3da1b321e1baae91cc49fa402e1))
* **FTR-014:** US-02-T16 Add Jest suite for wb-validate checks 8-10 (task deps, self-dep, phase consistency) ([17427a2](https://github.com/dtlab-tech/ai-toolkit/commit/17427a2ab900238bf757a11040bb1380dc49fa4e))
* **FTR-014:** US-02-T17 Add Jest suite for wb-validate check 11 (task cycle detection) ([43e06aa](https://github.com/dtlab-tech/ai-toolkit/commit/43e06aa95fc7203be5d5594443d5dd8a891ba71a))
* **FTR-014:** US-02-T18 Add Jest suite for wb-validate checks 12-14 (phase graph, cycles, schedulability) ([a4f710e](https://github.com/dtlab-tech/ai-toolkit/commit/a4f710e6ab996251d98af5006f519a497d7ca850))
* **FTR-014:** US-02-T19 Add Jest suite for wb-validate checks 15-18 (duration policy, commands, commit, rationale) ([3bdfc81](https://github.com/dtlab-tech/ai-toolkit/commit/3bdfc810f4dea82e29493e06fb98e83991d21c9c))
* **FTR-014:** US-02-T20 Add Jest suite for wb-validate checks 19-21 (AC parsing, scope, priority, Must coverage) ([e237c8e](https://github.com/dtlab-tech/ai-toolkit/commit/e237c8e03f83a499e4f265c2f67ed51b629967f2))
* **FTR-014:** US-02-T21 Add Jest suite for wb-validate checks 22-23 and report output contract ([9cbb57a](https://github.com/dtlab-tech/ai-toolkit/commit/9cbb57a5f8d781fb20e84235d8c492032c102893))
* **FTR-014:** US-03-T01 Create validate-work-breakdown-semantic agent definition ([6b34656](https://github.com/dtlab-tech/ai-toolkit/commit/6b3465634632f03f9c79ab27f31a8e842971d66d))
* **FTR-014:** US-03-T02 US-03-T03 Semantic analysis logic and structured output (covered by T01 agent definition) ([762b648](https://github.com/dtlab-tech/ai-toolkit/commit/762b64853d52b42f9535f4531cb4010d66ae4da2))
* **FTR-014:** US-03-T04 Manual semantic validation on test features (7/7 schema checks PASS) ([db6ee3c](https://github.com/dtlab-tech/ai-toolkit/commit/db6ee3cefc698216876f479b5fdbe64120e7e2bf))
* **FTR-014:** US-04-T01 Implement wb-render.js entry point (arg parsing, JSON read, file path setup) ([3d82ca3](https://github.com/dtlab-tech/ai-toolkit/commit/3d82ca3d7427df5e6208c58d1d1625224bcd079f))
* **FTR-014:** US-04-T02 Implement phase-level depends_on aggregation in wb-render.js ([726a756](https://github.com/dtlab-tech/ai-toolkit/commit/726a756cfee589ea9a2879c7f5d2732ccea682c8))
* **FTR-014:** US-04-T03 Implement defensive character stripping and commit message construction ([d9262dc](https://github.com/dtlab-tech/ai-toolkit/commit/d9262dc25866100afe74fe468a963c5034745c9a))
* **FTR-014:** US-04-T04 Implement Markdown output generation in wb-render.js ([2a7a384](https://github.com/dtlab-tech/ai-toolkit/commit/2a7a3842f642cb514e6efd48d94d8f818a3a1414))
* **FTR-014:** US-04-T05 Implement CSV output generation in wb-render.js ([1c2a386](https://github.com/dtlab-tech/ai-toolkit/commit/1c2a386078ae54015048f32b76a3789efa82f03a))
* **FTR-014:** US-04-T06 Tests for Markdown structure, CSV structure, dependency aggregation ([03de433](https://github.com/dtlab-tech/ai-toolkit/commit/03de433b1643751d68abc5dc121715c75872775d))
* **FTR-014:** US-04-T07 Tests for character stripping, commit construction, output file paths ([ace21ba](https://github.com/dtlab-tech/ai-toolkit/commit/ace21ba2f1eff5777254a9174a3f4b2ff0383b97))
* **FTR-014:** US-04-T08 CSV regression test against pm-phase3 parser ([3a83ed5](https://github.com/dtlab-tech/ai-toolkit/commit/3a83ed5a1dd3f9bb8add57e8abc97b8f80303a62))
* **FTR-014:** US-05-T01..T06 Update pm-phase2.js with validation pipeline and gate2_payload ([711b71e](https://github.com/dtlab-tech/ai-toolkit/commit/711b71e8b3d3f78a7cac43841fc9b42625d4749b))
* **FTR-014:** US-05-T07 Update implement-feature SKILL.md Gate 2 presentation with validator results ([e617b3d](https://github.com/dtlab-tech/ai-toolkit/commit/e617b3d28036969adecff78c26df382e871e9ed2))
* **FTR-014:** US-05-T08 Tests for orchestration flow wb-validate to semantic to render ([c1341e2](https://github.com/dtlab-tech/ai-toolkit/commit/c1341e23566d6efaa33c58db368d52fdbbef9fe1))
* **FTR-014:** US-05-T09 Tests for Gate 2 blocking logic and gate2_payload assembly ([8421695](https://github.com/dtlab-tech/ai-toolkit/commit/8421695ff0aeee3f9fd0d01d21cfc863a9344c91))
* **FTR-014:** US-06-T01..T04 Ledger tracking for wb-validate, semantic, wb-render in pm-phase2 ([2f9a9f7](https://github.com/dtlab-tech/ai-toolkit/commit/2f9a9f7ff935314bb591a4d1bb8ea8eaf9ad19bc))
* **FTR-014:** US-07-T01..T02 Add .claude/scripts/ to installer distribution for wb-validate and wb-render ([bcba12a](https://github.com/dtlab-tech/ai-toolkit/commit/bcba12ad340d071b794dd6608318e34dea7e846b))
* **FTR-014:** US-07-T03..T05 Tests for installer script distribution verification ([2bb57bd](https://github.com/dtlab-tech/ai-toolkit/commit/2bb57bd4a918052ed05a421d310ae2124252a6f8))


### Bug Fixes

* **FTR-014:** align warning/split task details field to agentMinutes ([ba7dbf8](https://github.com/dtlab-tech/ai-toolkit/commit/ba7dbf8f8dd5e34f55bc825bdefabdaaf2160eba))
* **FTR-014:** enforce groupingRationale as a required task field in check 4 ([e5cb733](https://github.com/dtlab-tech/ai-toolkit/commit/e5cb7336e91f44c653d979cfeba8f21de3da3d19))
* **FTR-014:** guard wb.phases in checks 22 and 23 against missing/non-array ([32ec505](https://github.com/dtlab-tech/ai-toolkit/commit/32ec50560c5e1fe855ac15bf9d40ec7b0ba3d8ae))
* **FTR-014:** preserve completed_at for skipped ledger entries (I6) ([389f280](https://github.com/dtlab-tech/ai-toolkit/commit/389f280d4ebdfc6a3d694e9c9e43e57042043493))
* **FTR-014:** relax symmetric-wrapping assertion in pm-phase2-source test ([8bc663e](https://github.com/dtlab-tech/ai-toolkit/commit/8bc663ec098d645cf3e6dcdd7793a08e44104784))
* **FTR-014:** use exit(2) for parseAcTable fatal errors (I5) ([1244066](https://github.com/dtlab-tech/ai-toolkit/commit/12440663cf57ddfea523535829ebbb9a66a300fd))

## [0.9.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.8.0...v0.9.0) (2026-08-05)


### Features

* **FTR-020:** add initial documentation for Atomic Work Breakdown, Execution Ledger, and Task Checkpoints and Resume ([c5f724a](https://github.com/dtlab-tech/ai-toolkit/commit/c5f724af068e003d36ec196cdec3502fe0c47333))


### Bug Fixes

* **pm-phase3:** replace require/fs/execSync with agent()-based ledger helpers ([1166d6f](https://github.com/dtlab-tech/ai-toolkit/commit/1166d6f17e913405ea737e74236742569740cd0a))
* **pm-phase3:** replace require/fs/execSync with agent()-based ledger helpers ([bf4077c](https://github.com/dtlab-tech/ai-toolkit/commit/bf4077cca28920876185535aa553ec91c6ffc08b))
* **pm-phase3:** replace require/fs/execSync with agent()-based ledger helpers ([bb4c88d](https://github.com/dtlab-tech/ai-toolkit/commit/bb4c88df20c62db09de327975ab57e045247dc51))
* **workflows:** remove new Date() from all workflow call sites ([343b604](https://github.com/dtlab-tech/ai-toolkit/commit/343b604dba2d4d0b12e5590c1b5323b2a9e888f2))

## [0.8.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.7.0...v0.8.0) (2026-08-04)


### Features

* **FTR-011:** implement shared infrastructure (INFRA) ([718b0eb](https://github.com/dtlab-tech/ai-toolkit/commit/718b0ebe684814028b0457351a40b171ea80a197))
* **FTR-011:** implement US-01 — Implement readManifest() Function ([aad7de1](https://github.com/dtlab-tech/ai-toolkit/commit/aad7de19aa6aaf48578c46eebd3bb236ebb4fadb))
* **FTR-011:** implement US-02 — Implement computeOrphans() Function ([3a70517](https://github.com/dtlab-tech/ai-toolkit/commit/3a705173e649aa7782d036b5790c830c88a1d797))
* **FTR-011:** implement US-03 — Implement moveToTrash() Function ([a6ac7d2](https://github.com/dtlab-tech/ai-toolkit/commit/a6ac7d2d841905bba24f5349a7d763c9f43527e8))
* **FTR-011:** implement US-04 — Implement writeManifest() Function ([dc43ea1](https://github.com/dtlab-tech/ai-toolkit/commit/dc43ea1e35c2e4981876ad5f46b3138890851fcd))
* **FTR-011:** implement US-05 — Integrate Prune Phase into runInstall() and Add UI Display ([bca87ea](https://github.com/dtlab-tech/ai-toolkit/commit/bca87ea8f8843f6a8a07371eaef072b1fc004453))
* **FTR-011:** implement US-06 — Add CI Safety Net — Agent Name-to-Filename Alignment Check ([06db318](https://github.com/dtlab-tech/ai-toolkit/commit/06db3180b4867b611a2793bf2c74e8510e66827c))
* **FTR-011:** Installer Manifest and Orphan Pruning ([764eff4](https://github.com/dtlab-tech/ai-toolkit/commit/764eff4dd3b13ee34e7e4be7159c08168e49fe1d))
* **FTR-011:** update effort and token estimates, add implementation summary, and log completion details ([ce5660d](https://github.com/dtlab-tech/ai-toolkit/commit/ce5660dec691b75bb501bcadb149c2f4eaabdb5a))
* **FTR-012:** implement shared infrastructure (INFRA) ([da14ae1](https://github.com/dtlab-tech/ai-toolkit/commit/da14ae15d19301c47231e73872ecba75f180e739))
* **FTR-012:** implement US-01 — Fresh Installation with Allowlist Opt-In ([803018a](https://github.com/dtlab-tech/ai-toolkit/commit/803018aafe77abb06390849540f7fb214fccbc40))
* **FTR-012:** implement US-02 — Merge Allowlist into Existing Settings ([9855abc](https://github.com/dtlab-tech/ai-toolkit/commit/9855abc940443d4e75b7a1b3340715d8e1403fcf))
* **FTR-012:** implement US-03 — Ask-Beats-Allow Conflict Resolution ([9c51984](https://github.com/dtlab-tech/ai-toolkit/commit/9c5198490824647bac7b1850b09e624d9f00e883))
* **FTR-012:** implement US-04 — Reinstall with Idempotent Merge ([8e9a49f](https://github.com/dtlab-tech/ai-toolkit/commit/8e9a49f69d7bb761a698b2ac7f7a405d5d2d833e))
* **FTR-012:** implement US-05 — .gitignore Creation and Idempotent Update ([20e19de](https://github.com/dtlab-tech/ai-toolkit/commit/20e19de3c38cbbfcd5dd27c8b8b5ab629036b101))
* **FTR-012:** Installer Bash Allowlist ([2deb73e](https://github.com/dtlab-tech/ai-toolkit/commit/2deb73ef4ad4189c6eea1ae46ec0f0dc6ece469e))
* **FTR-012:** mark feature as completed in registry ([ab90d58](https://github.com/dtlab-tech/ai-toolkit/commit/ab90d5878a4091ccaef38863c14634ebd2082623))
* **FTR-013:** add additional agent entries for US-03 and US-04 in ledger ([6f756ed](https://github.com/dtlab-tech/ai-toolkit/commit/6f756edfaa0d75b48809aa3964261efa65fd69f9))
* **FTR-013:** add registry entry and update ledger actuals ([23f5138](https://github.com/dtlab-tech/ai-toolkit/commit/23f513801486c36e95782ea513e15fcfcb755d06))
* **FTR-013:** implement shared infrastructure (INFRA) ([99d564f](https://github.com/dtlab-tech/ai-toolkit/commit/99d564f8ca543b7cd95c5cf1a5687961ef402921))
* **FTR-013:** implement US-01 — Initialize and Track Ledger in define-feature Agent ([ce0b010](https://github.com/dtlab-tech/ai-toolkit/commit/ce0b010afd40e94f9e9e2618eca1fbcc60ede7ae))
* **FTR-013:** implement US-01 — Initialize and Track Ledger in define-feature Agent ([ca84538](https://github.com/dtlab-tech/ai-toolkit/commit/ca84538d6980828313d331e4a07e10bde5cb34c7))
* **FTR-013:** implement US-02 — Track Phase 1 Agent Invocations ([a4e3b10](https://github.com/dtlab-tech/ai-toolkit/commit/a4e3b1001bb0b6201c873c4608c23c94c37ca5e0))
* **FTR-013:** implement US-02 — Track Phase 1 Agent Invocations ([85d86e4](https://github.com/dtlab-tech/ai-toolkit/commit/85d86e406d9ace96b22214de5aef14a6b0cde0b2))
* **FTR-013:** implement US-03 — Track Phase 2 Agent Invocations ([819f3c3](https://github.com/dtlab-tech/ai-toolkit/commit/819f3c33a954ce89bb221461ee21092b9429c085))
* **FTR-013:** implement US-03 — Track Phase 2 Agent Invocations ([7d6f9bb](https://github.com/dtlab-tech/ai-toolkit/commit/7d6f9bba8a794e83a12b31a306e27a5d8505c3f7))
* **FTR-013:** Ledger Pipeline Activity Tracker ([f1bf49a](https://github.com/dtlab-tech/ai-toolkit/commit/f1bf49a4c7496fba8f0c04c5770fe2ad08a6b4ac))
* **pm:** add EUR cost columns to Token-Estimate ([b0faf0d](https://github.com/dtlab-tech/ai-toolkit/commit/b0faf0dc15c40358bf64b55a0a34987be8db19a2))


### Bug Fixes

* **FTR-011:** remediate review issues ([c34d824](https://github.com/dtlab-tech/ai-toolkit/commit/c34d8246fff5548401cb50cc300043679ede4bba))
* **FTR-012:** remediate review issues ([f9ea280](https://github.com/dtlab-tech/ai-toolkit/commit/f9ea280c394a6436fa6a0840f0110b1b620b6025))
* **pm:** commit actuals after write-actuals; restore zero-delta ledger entries on resume ([83bbaec](https://github.com/dtlab-tech/ai-toolkit/commit/83bbaecdbbbbf9aa436af8d56a6e823500868b1b))
* **pm:** correct write-actuals token estimate output ([d45653a](https://github.com/dtlab-tech/ai-toolkit/commit/d45653a2c9f999ec8478836e01128428295fa95a))

## [0.7.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.6.0...v0.7.0) (2026-07-29)


### Features

* **pipeline:** centralized test run + persistent token ledger + validation report fix + smarter define-feature ([c9fad6e](https://github.com/dtlab-tech/ai-toolkit/commit/c9fad6e4e5dfe25823df1d6534b4e597baa97001))
* **pm-phase3:** add centralized test run phase to streamline testing process ([972fac5](https://github.com/dtlab-tech/ai-toolkit/commit/972fac55d0754743859a7d75379a41acd49a890d))
* **pm-phase3:** persist token ledger to disk after every phase ([b6ad681](https://github.com/dtlab-tech/ai-toolkit/commit/b6ad6814770fae31cda60f25298dab9b2739eeaa))

## [0.6.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.5.0...v0.6.0) (2026-07-29)


### Features

* **define-feature:** context ingestion + adaptive grilling; add AGENTS.md ([581b783](https://github.com/dtlab-tech/ai-toolkit/commit/581b783a18626796ae764ce69f658556b83ab490))


### Bug Fixes

* **pipeline:** persist Validation Report + smarter define-feature + AGENTS.md ([a5bae6a](https://github.com/dtlab-tech/ai-toolkit/commit/a5bae6aab65ca78aa5daa08a4a731b7c16051754))
* **pm-phase1:** guarantee Validation Report is persisted to disk ([53e10c0](https://github.com/dtlab-tech/ai-toolkit/commit/53e10c0e8f20021da9408d6b9e0c077142a449ae))

## [0.5.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.4.0...v0.5.0) (2026-07-29)


### Features

* **pm-phase3:** Option C review architecture + estimate format improvements ([b385b3e](https://github.com/dtlab-tech/ai-toolkit/commit/b385b3e35ef9121b8d9008223c77c88291c4173a))

## [0.4.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.3.1...v0.4.0) (2026-07-29)


### Features

* **effort-estimate:** add Est./Actual Human/Agent columns to Per-Phase Breakdown ([696146c](https://github.com/dtlab-tech/ai-toolkit/commit/696146cc583ca13ee18914af19ff4de87a91cb60))
* FTR-010 unit tests, process-log, OPT-02/03/04, remove Matt Pocock dependency ([1f43a4e](https://github.com/dtlab-tech/ai-toolkit/commit/1f43a4e6bf98a4b5821f1a0ae2dac33aca090597))
* **token-estimate:** split tokens into Est./Actual columns in pm-phase2 and pm-phase3 ([d85b6e4](https://github.com/dtlab-tech/ai-toolkit/commit/d85b6e4aa871a934190e1d65995cb8e7e8db4495))


### Bug Fixes

* **pm-phase3:** read CSV as raw string instead of schema-wrapped object ([1737842](https://github.com/dtlab-tech/ai-toolkit/commit/17378422f6a9dc9168a35c7114cdd227e9214ce8))
* **pm-phase3:** remove duplicate const prefix declaration ([85455e8](https://github.com/dtlab-tech/ai-toolkit/commit/85455e83929ccc6274d7d888fd429fc83ad78137))

## [0.3.1](https://github.com/dtlab-tech/ai-toolkit/compare/v0.3.0...v0.3.1) (2026-07-28)


### Bug Fixes

* include README.md in npm package files ([1998d47](https://github.com/dtlab-tech/ai-toolkit/commit/1998d476d23de1c2791af97b3217492b1364a9c8))
* include README.md in npm package files ([f710534](https://github.com/dtlab-tech/ai-toolkit/commit/f71053472afeb87c2a4cd8e8a0b826103c6205f0))

## [0.3.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.2.3...v0.3.0) (2026-07-28)


### Features

* **FTR-010:** add feature docs and delivery artifacts for unit test suite ([0ffd712](https://github.com/dtlab-tech/ai-toolkit/commit/0ffd7123d899655aea4d5acaee5e8b25ce2e1b43))
* **FTR-010:** add token estimate and process log for unit test suite ([ef2f38e](https://github.com/dtlab-tech/ai-toolkit/commit/ef2f38e03d063161f0521ca0c5b54119eff37cb6))
* **FTR-010:** implement shared infrastructure (INFRA) ([dfbc72c](https://github.com/dtlab-tech/ai-toolkit/commit/dfbc72caf0906e5ea0421f079881e6b020d3124c))
* **FTR-010:** implement US-01 — Developer Runs Unit Tests for CLI Functions ([60170aa](https://github.com/dtlab-tech/ai-toolkit/commit/60170aa21f245cbb76a1a201feab53439f4588f3))
* **FTR-010:** implement US-02 and US-03 — coverage report and frontmatter validation ([d939bc2](https://github.com/dtlab-tech/ai-toolkit/commit/d939bc20fe04ab5832e556f7df42a525833de1ab))
* **FTR-010:** implement US-04 — CI Pipeline Test Automation ([466ab0b](https://github.com/dtlab-tech/ai-toolkit/commit/466ab0bf6dc77d53e67304c2fde2a1be06ad1b70))
* **FTR-010:** Unit Test Suite — CLI Logic and Frontmatter Validation ([ad7d012](https://github.com/dtlab-tech/ai-toolkit/commit/ad7d012c7e6ac1cbb339d0249deaf34c2f42ee7a))
* **pm-phase2/3:** generate Work-Breakdown CSV for deterministic phase dispatch ([3ffa25e](https://github.com/dtlab-tech/ai-toolkit/commit/3ffa25ef30fdee6033f045e84a941ef9fc97a0cd))
* **wb-csv:** add depends_on column and parallel wave execution in pm-phase3 ([6939972](https://github.com/dtlab-tech/ai-toolkit/commit/6939972813573a893b070be2770826212172f5c3))


### Bug Fixes

* **pm-phase3:** dispatch specialist agents per US instead of single orchestrator ([bef21c1](https://github.com/dtlab-tech/ai-toolkit/commit/bef21c1e4c1354c29bc9366b959237986a588f91))

## [0.2.3](https://github.com/dtlab-tech/ai-toolkit/compare/v0.2.2...v0.2.3) (2026-07-28)


### Bug Fixes

* **pm-phase2:** generate full Effort-Estimate and Token-Estimate in phase 2 ([f3afbae](https://github.com/dtlab-tech/ai-toolkit/commit/f3afbae8b445632e8d8dd0ba8930d89042e9f3f4))

## [0.2.2](https://github.com/dtlab-tech/ai-toolkit/compare/v0.2.1...v0.2.2) (2026-07-28)


### Bug Fixes

* restore process-log trace across pm-phase1/2/3 workflow scripts ([6748cf9](https://github.com/dtlab-tech/ai-toolkit/commit/6748cf9aab94efc76aa41c6c97cfe9493bc8db92))
* restore process-log trace across pm-phase1/2/3 workflow scripts ([844965a](https://github.com/dtlab-tech/ai-toolkit/commit/844965abe5f0486cc5915819e5879b0486a3e993))

## [0.2.1](https://github.com/dtlab-tech/ai-toolkit/compare/v0.2.0...v0.2.1) (2026-07-27)


### Bug Fixes

* validate-feature-docs always writes report; fix false-positive gap detection ([68caf3e](https://github.com/dtlab-tech/ai-toolkit/commit/68caf3e25214bcb219df1654c4b3ede5cc42eb3b))
* validate-feature-docs always writes report; fix false-positive gap detection in pm-phase1 ([d99fdb3](https://github.com/dtlab-tech/ai-toolkit/commit/d99fdb39be1663539bd0ed7e6ca4facc2c53fd76))

## [0.2.0](https://github.com/dtlab-tech/ai-toolkit/compare/v0.1.7...v0.2.0) (2026-07-27)


### Features

* **FTR-007:** explicit per-agent model assignment ([853eb0f](https://github.com/dtlab-tech/ai-toolkit/commit/853eb0f956a9a1aa64dedac7100fb1ad9eab4b08))
* **FTR-007:** implement US-01 — explicit per-agent model assignment ([0fe5fba](https://github.com/dtlab-tech/ai-toolkit/commit/0fe5fba9b25dc261e840d99d97105dec7c0c9318))
* **FTR-008:** compact instructions block for ~/.claude/CLAUDE.md ([738df59](https://github.com/dtlab-tech/ai-toolkit/commit/738df597e2da3edc04de68462f0e4555b232941d))
* **FTR-008:** implement compact instructions block ([0dab04d](https://github.com/dtlab-tech/ai-toolkit/commit/0dab04d9c14392866c9046eee9e7052a2beac586))
* **FTR-009:** implement shared infrastructure (INFRA) ([31bceb9](https://github.com/dtlab-tech/ai-toolkit/commit/31bceb9788a1f403eea3f2971b87959fa9e33f97))
* **FTR-009:** implement US-01 — Feature Delivery Workflow Scripts ([7f6dd7d](https://github.com/dtlab-tech/ai-toolkit/commit/7f6dd7da8280d9bc6b5b9922bf7f751c1837f8ad))
* **FTR-009:** implement US-02 — Assessment Workflow Scripts ([7b1e668](https://github.com/dtlab-tech/ai-toolkit/commit/7b1e668217f89ef16011fbe253a8e4bfb5714d0c))
* **FTR-009:** rewrite orchestrators as Workflow scripts ([7f63b20](https://github.com/dtlab-tech/ai-toolkit/commit/7f63b209e6f4826115c74189847f68d77dc16ac1))
* release develop → main (FTR-007, FTR-008, FTR-009) ([66c9e05](https://github.com/dtlab-tech/ai-toolkit/commit/66c9e05dde12be03f2c3d2a13eea112103fd6a20))


### Bug Fixes

* **FTR-009:** remediate review issues; update registry ([6aaeeb0](https://github.com/dtlab-tech/ai-toolkit/commit/6aaeeb0465b4d2003e61f33f7c6d0641bc477f9c))
* **FTR-009:** rewrite all 5 workflow scripts with correct Workflow SDK API ([2c6da04](https://github.com/dtlab-tech/ai-toolkit/commit/2c6da041c07a1c233678cd0d64dfeaf66f0674a5))

## 0.1.7 (2026-07-23)


### Features

* add effort estimation and actuals tracking to project manager workflow ([0b81915](https://github.com/dtlab-tech/ai-toolkit/commit/0b819154584c725ccca09a825888aee8f3f5f34f))
* add effort estimation and actuals tracking to project manager workflow ([f9e74ef](https://github.com/dtlab-tech/ai-toolkit/commit/f9e74ef39972e3f0f3b0d3b6e4311d15fa9035cc))
* add GitHub Actions workflow to auto-publish to npm on merge to main ([f8d89ea](https://github.com/dtlab-tech/ai-toolkit/commit/f8d89ea20364796ce699b8228041f7f436ff3bdd))
* add GitHub Actions workflow to auto-publish to npm on merge to main ([abe2c45](https://github.com/dtlab-tech/ai-toolkit/commit/abe2c45336586794267d4ac7faf164cb82758fb6))
* add option to install Matt Pocock's skills during toolkit installation ([441183d](https://github.com/dtlab-tech/ai-toolkit/commit/441183d30214ed6eb570ae41ddf858229276b6d5))
* add option to install Matt Pocock's skills during toolkit installation ([f0d4fa3](https://github.com/dtlab-tech/ai-toolkit/commit/f0d4fa3ff783498d77e5b399d22d5828c8b157a6))
* add pricing documentation for cost estimation and blended cost formula ([91f6392](https://github.com/dtlab-tech/ai-toolkit/commit/91f63926ef2eabd20ad09a186f323d00abba9963))
* add pricing documentation for cost estimation and blended cost formula ([a9361ed](https://github.com/dtlab-tech/ai-toolkit/commit/a9361eda75b2c36d2515df976782af67bba1c4e4))
* Add SWF AI Toolkit with agents, skills, commands, and procedures for software feature delivery ([327a282](https://github.com/dtlab-tech/ai-toolkit/commit/327a2826bf4a147bcf2f993bc3ea254eaa12b18b))
* Add SWF AI Toolkit with agents, skills, commands, and procedures for software feature delivery ([97eb589](https://github.com/dtlab-tech/ai-toolkit/commit/97eb589a2b63a9ea45634c71aaae07d08bc1deaf))
* add version check during toolkit installation and update installed version file ([0e0eeea](https://github.com/dtlab-tech/ai-toolkit/commit/0e0eeea1bafe78e4d5c4214efc1b7acab9799ac8))
* add version check during toolkit installation and update installed version file ([4681ed4](https://github.com/dtlab-tech/ai-toolkit/commit/4681ed445a83c7f3bee5677bb773deaa7b0f86e2))
* assessment pipeline enhancements — token/effort estimation, registry, intervention commands, and Gaia assistant ([0cb512c](https://github.com/dtlab-tech/ai-toolkit/commit/0cb512cfd6d18c38216584ca454ab2077e641762))
* auto-generate CHANGELOG.md on publish via conventional-changelog ([6fdbd69](https://github.com/dtlab-tech/ai-toolkit/commit/6fdbd69c011ad3d568f3070f4c2dcd87092623e9))
* auto-generate CHANGELOG.md on publish via conventional-changelog ([49df865](https://github.com/dtlab-tech/ai-toolkit/commit/49df865633ebcede49f6c879921e775f1945271b))
* Enhance agent descriptions and add completion summaries ([a3aa811](https://github.com/dtlab-tech/ai-toolkit/commit/a3aa81169f102a09c95a46a98aa3b4f82bbb3b31))
* Enhance agent descriptions and add completion summaries ([1b2fe4a](https://github.com/dtlab-tech/ai-toolkit/commit/1b2fe4a2bf1c52107c8605533f2a0cdd85d1afbf))
* enhance file installation process with detailed status reporting and user prompts ([c12ca72](https://github.com/dtlab-tech/ai-toolkit/commit/c12ca72e111ead2f3c53b8846507f61fb572125b))
* enhance file installation process with detailed status reporting and user prompts ([10b56a4](https://github.com/dtlab-tech/ai-toolkit/commit/10b56a4d10455366cfec0690b8e9e428399f845a))
* enhance installation process with version checks and optional Matt Pocock skills installation ([16411e7](https://github.com/dtlab-tech/ai-toolkit/commit/16411e755c6586e8d33bd13b62402b3648e05b9c))
* enhance installation process with version checks and optional Matt Pocock skills installation ([8c1f0ae](https://github.com/dtlab-tech/ai-toolkit/commit/8c1f0ae92828e27b8a7ffb110eb35e27094b7006))
* enhance project manager with feature registry checks for cross-feature analysis ([30eb5e5](https://github.com/dtlab-tech/ai-toolkit/commit/30eb5e50fc16501e9cc38a5b4a8264e3eac96e5d))
* enhance project manager with feature registry checks for cross-feature analysis ([0d44ec3](https://github.com/dtlab-tech/ai-toolkit/commit/0d44ec35caa0460203c7c55d7eacff9320ef681f))
* enhance SWF AI Toolkit guide with detailed introduction and context awareness ([60bb2b8](https://github.com/dtlab-tech/ai-toolkit/commit/60bb2b86f3915f9844b58e7eeb44e88ce3877a4c))
* enhance SWF AI Toolkit guide with detailed introduction and context awareness ([f4ca293](https://github.com/dtlab-tech/ai-toolkit/commit/f4ca2938f6b4103785274018376ac2997e28cfc2))
* enhance token tracking and reporting in project manager and implement feature workflow ([fa873b8](https://github.com/dtlab-tech/ai-toolkit/commit/fa873b82b84bd3b332b44c0e2dd458820defd502))
* enhance token tracking and reporting in project manager and implement feature workflow ([92336ed](https://github.com/dtlab-tech/ai-toolkit/commit/92336edb3b523a5f5ed40d21b6fe38f7024ba322))
* **FTR-001:** add token estimation to assessment pipeline ([2f8a630](https://github.com/dtlab-tech/ai-toolkit/commit/2f8a63077e79c09ac25b2d60c74946fc7d229282))
* **FTR-001:** add token estimation to assessment pipeline ([93879ad](https://github.com/dtlab-tech/ai-toolkit/commit/93879ad00c60e9985424f07c104fa332883a4921))
* **FTR-002:** Add assessment pipeline effort estimation documentation and process log ([873c28f](https://github.com/dtlab-tech/ai-toolkit/commit/873c28f925a820292a1dc68600b1ebf991336903))
* **FTR-002:** Add assessment pipeline effort estimation documentation and process log ([30c891b](https://github.com/dtlab-tech/ai-toolkit/commit/30c891be8e337c63064982413570c1c4ade4d08f))
* **FTR-003:** reduce assessment pipeline to read-only — findings gate replaces remediation gate ([681f6fc](https://github.com/dtlab-tech/ai-toolkit/commit/681f6fc6500514c21f03ae61ee82e788ff65a6c6))
* **FTR-003:** reduce assessment pipeline to read-only — findings gate replaces remediation gate ([918ca26](https://github.com/dtlab-tech/ai-toolkit/commit/918ca2608e25d0ee2aa91b9047d921b7eaa5c021))
* **FTR-004:** generate requirements, tech-spec, validation, and work breakdown docs ([5ba2da7](https://github.com/dtlab-tech/ai-toolkit/commit/5ba2da7bee2e7bde5136874f277f19ad83be8464))
* **FTR-004:** implement INFRA + US-01 through US-03 — assessment registry write logic ([1989e38](https://github.com/dtlab-tech/ai-toolkit/commit/1989e38fc1b0ef5b40ff2e54cc83a2cd49e5c5d3))
* **FTR-004:** implement US-04 through US-06 — test specification ([baad095](https://github.com/dtlab-tech/ai-toolkit/commit/baad09524d8c352330a024fc7a80e89c635c0fc8))
* **FTR-004:** update project-manager token estimates to complete status ([959cc99](https://github.com/dtlab-tech/ai-toolkit/commit/959cc9921d470bfa874c5108f320848718d97c9a))
* **FTR-005:** add /next-intervention and /check-interventions commands ([f744ad2](https://github.com/dtlab-tech/ai-toolkit/commit/f744ad2032abe936feff9ae67ddd863ba86511a1))
* **FTR-006:** add assessment-aware PR description command to enhance context for intervention branches ([3023729](https://github.com/dtlab-tech/ai-toolkit/commit/302372919a2c07de313175c61f51000fcb2c99bc))
* refactor Matt Pocock skills installation checks and simplify version handling ([58d3efd](https://github.com/dtlab-tech/ai-toolkit/commit/58d3efddf35b453cf25de701ed5f4b829d0a1a34))
* refactor Matt Pocock skills installation checks and simplify version handling ([7de059e](https://github.com/dtlab-tech/ai-toolkit/commit/7de059e01fe5d71b75331732a833e00acfbb2a98))
* rename help skill to hi-gaia and introduce Gaia as toolkit assistant ([4c7c6f4](https://github.com/dtlab-tech/ai-toolkit/commit/4c7c6f422c8f97b9e79361faed4c95ed5001322c))
* rename help skill to hi-gaia and introduce Gaia as toolkit assistant ([c45fef0](https://github.com/dtlab-tech/ai-toolkit/commit/c45fef09a475dc795dfbbc12485e1ea01f4776d4))
* update Azure pipeline to dynamically resolve NPM registry URL ([2c6a817](https://github.com/dtlab-tech/ai-toolkit/commit/2c6a81777475f9ed6ad3f9f4b42fe7e7b2ada67e))
* update Azure pipeline to dynamically resolve NPM registry URL ([0f4601f](https://github.com/dtlab-tech/ai-toolkit/commit/0f4601fabb4b885dadc28e3f868feacdb97e474b))
* update Matt Pocock skills check to verify 'grilling' skill presence ([47b0592](https://github.com/dtlab-tech/ai-toolkit/commit/47b0592be0438c2d5152030e95674f0d0c23bf9a))
* update Matt Pocock skills check to verify 'grilling' skill presence ([d92d729](https://github.com/dtlab-tech/ai-toolkit/commit/d92d72946920c1cd9bf29f470a7a95b7bd84a254))
* update package name and installation instructions to reflect new organization ([b67193a](https://github.com/dtlab-tech/ai-toolkit/commit/b67193a630e3bb95cc5b58e4ead1b914cc74b9dc))
* update package name and installation instructions to reflect new organization ([0b09994](https://github.com/dtlab-tech/ai-toolkit/commit/0b09994220a563f1d3d12e5286be4a884af34aab))


### Bug Fixes

* add git tag on publish so conventional-changelog can read commit range ([6d4e427](https://github.com/dtlab-tech/ai-toolkit/commit/6d4e427d068da80d607db6e356cc79ea6e6ded9d))
* add git tag on publish so conventional-changelog can read commit range ([114f558](https://github.com/dtlab-tech/ai-toolkit/commit/114f55871c8e5892b36754cad3ba5d88b082706a))
* correct shell syntax in version bump commit message ([f988609](https://github.com/dtlab-tech/ai-toolkit/commit/f98860994d1cd3c4ef3d9b86aade6155e0ec6408))
* correct shell syntax in version bump commit message ([8e25e16](https://github.com/dtlab-tech/ai-toolkit/commit/8e25e160496125387e4a69707b04c24739008c5c))
* enhance NPM registry resolution by adding ADO_FEED_SCOPE variable ([2ff13e4](https://github.com/dtlab-tech/ai-toolkit/commit/2ff13e44510f507453136b5840d9dfc5c2afc3c5))
* enhance NPM registry resolution by adding ADO_FEED_SCOPE variable ([77b79c6](https://github.com/dtlab-tech/ai-toolkit/commit/77b79c6f1836b71bf96e1b7457d1c1ca28324253))
* **FTR-005:** address review warnings + add gate protocol to CLAUDE.md ([2e64780](https://github.com/dtlab-tech/ai-toolkit/commit/2e647809ba5279c492060dde52ab8134490fc59d))
* pull --rebase before pushing version bump to avoid rejection ([cf751d0](https://github.com/dtlab-tech/ai-toolkit/commit/cf751d0984bdddc683dfc67e378b4f563c6cfbe2))
* pull --rebase before pushing version bump to avoid rejection ([b70c748](https://github.com/dtlab-tech/ai-toolkit/commit/b70c74832f48e9261fbe894542de5977c3bcafa4))
* remove project-specific references and fix stale artifact filenames ([c272354](https://github.com/dtlab-tech/ai-toolkit/commit/c2723549f1a3de4f099b85b44c87603b9c601e72))
* remove project-specific references and fix stale artifact filenames ([1861fb9](https://github.com/dtlab-tech/ai-toolkit/commit/1861fb98708ce8ff8fcae7f5947f4e9dc9ba6937))
* remove run_in_background from PM and assessment-manager — background notifications not delivered to sub-agent contexts ([29a7b97](https://github.com/dtlab-tech/ai-toolkit/commit/29a7b97649ad5798eaf96c5a1acabb214c0c0c96))
* update installation instructions in README for clarity and completeness ([293a2dd](https://github.com/dtlab-tech/ai-toolkit/commit/293a2ddf0bebd386ba799ee24f6465b317897495))
* update installation instructions in README for clarity and completeness ([d682026](https://github.com/dtlab-tech/ai-toolkit/commit/d6820268dc1a60d99e80162e262adaba2974f9f7))
* update package references from [@denistomada](https://github.com/denistomada) to [@fincantieri](https://github.com/fincantieri) in README and installation documentation ([32ad6ae](https://github.com/dtlab-tech/ai-toolkit/commit/32ad6ae24db1719ad3cb1f4eea02bc11494cacd6))
* update package references from [@denistomada](https://github.com/denistomada) to [@fincantieri](https://github.com/fincantieri) in README and installation documentation ([5854119](https://github.com/dtlab-tech/ai-toolkit/commit/585411991604acc06a85ecf5b8a9beffe1ef82a2))
* update package.json to correct author and package name ([53dae47](https://github.com/dtlab-tech/ai-toolkit/commit/53dae47132da53e4fce98fdd683eb7acb4678b5a))
* update package.json to correct author and package name ([81a6b7c](https://github.com/dtlab-tech/ai-toolkit/commit/81a6b7c1ebfe6fab632eb44ddc48c962efc69997))
* update repository URL in package.json and remove publishConfig ([7f3dc15](https://github.com/dtlab-tech/ai-toolkit/commit/7f3dc15df57653bed00b139123396d5d2ba24d3e))
* update repository URL in package.json and remove publishConfig ([b912958](https://github.com/dtlab-tech/ai-toolkit/commit/b9129582804758128f3e9dffdd8cd9302d4e529f))

## 0.1.3 (2026-07-14)
