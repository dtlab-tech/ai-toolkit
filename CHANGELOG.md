## 0.1.4 (2026-07-21)
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
