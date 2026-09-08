'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');

// ── Resolution status vocabulary ──────────────────────────────────────────────
//
//   resolveAgent() returns one of:
//     "verified"          — agent present, manifest has fileHashes, hash matches on disk
//     "hash-unverifiable" — agent present, manifest lacks fileHashes entry (v0.12.0 manifest)
//     "hash-mismatch"     — agent present, computed hash differs from manifest record
//     "not-found"         — canonical ID not in catalog
//     "not-installed"     — ID in catalog but file absent from manifest or absent on disk
//     "manifest-missing"  — no manifest found or manifest unreadable / corrupt
//     "conflict"          — ambiguous installation (both local + global manifests present)
//                           or scope collision (same native name in both observable scopes)
//
//   listRegisteredAgents() uses the doctor-agents vocabulary (per AC-13):
//     "verified"          — as above
//     "conflict"          — scope collision or hash-mismatch; detail in integrityDetail
//     "hash-unverifiable" — as above
//     "unobservable"      — plugin / session scope; filesystem enumeration impossible
//     "not-installed"     — as above
//     "not-applicable"    — platform not supported

// ── Canonical catalog (Phase A — transitional legacy native names) ─────────────
//
// Each entry maps one toolkit agent / orchestrator to a globally unique, namespaced
// canonical ID.  The "claude" key in nativeNames is the Phase A legacy name;
// Phase B will rename each source file atomically and update these entries.
//
// Fields follow §4.1 "Agent Catalog (Registry Data)" from the FTR-017 Tech-Spec.

const CATALOG = [
  // ── Developer agents ──────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.developer.backend',
    nativeNames:           { claude: 'developer-backend' },
    relativeInstallPath:   '.claude/agents/developer-backend.md',
    role:                  'developer',
    type:                  'backend',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.developer.frontend',
    nativeNames:           { claude: 'developer-frontend' },
    relativeInstallPath:   '.claude/agents/developer-frontend.md',
    role:                  'developer',
    type:                  'frontend',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.developer.testing',
    nativeNames:           { claude: 'developer-testing' },
    relativeInstallPath:   '.claude/agents/developer-testing.md',
    role:                  'developer',
    type:                  'testing',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Reviewer agents ───────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.review.solution',
    nativeNames:           { claude: 'review-solution' },
    relativeInstallPath:   '.claude/agents/review-solution.md',
    role:                  'reviewer',
    type:                  'solution',
    authorisedPhases:      ['review'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Planner agents ────────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.planner.requirements',
    nativeNames:           { claude: 'generate-requirements' },
    relativeInstallPath:   '.claude/agents/generate-requirements.md',
    role:                  'planner',
    type:                  'requirements',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.planner.tech-spec',
    nativeNames:           { claude: 'generate-tech-spec' },
    relativeInstallPath:   '.claude/agents/generate-tech-spec.md',
    role:                  'planner',
    type:                  'tech-spec',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.planner.work-breakdown',
    nativeNames:           { claude: 'generate-work-breakdown' },
    relativeInstallPath:   '.claude/agents/generate-work-breakdown.md',
    role:                  'planner',
    type:                  'work-breakdown',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.planner.validate-feature-docs',
    nativeNames:           { claude: 'validate-feature-docs' },
    relativeInstallPath:   '.claude/agents/validate-feature-docs.md',
    role:                  'planner',
    type:                  'validation',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.planner.validate-work-breakdown',
    nativeNames:           { claude: 'validate-work-breakdown-semantic' },
    relativeInstallPath:   '.claude/agents/validate-work-breakdown-semantic.md',
    role:                  'planner',
    type:                  'validation',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.planner.define-feature',
    nativeNames:           { claude: 'define-feature' },
    relativeInstallPath:   '.claude/agents/define-feature.md',
    role:                  'planner',
    type:                  'definition',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Tooling agents ────────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.tooling.init-agents-md',
    nativeNames:           { claude: 'init-agents-md' },
    relativeInstallPath:   '.claude/agents/init-agents-md.md',
    role:                  'tooling',
    type:                  'init',
    authorisedPhases:      ['setup'],
    allowedPipelines:      ['init'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.tooling.install-toolkit',
    nativeNames:           { claude: 'install-toolkit' },
    relativeInstallPath:   '.claude/agents/install-toolkit.md',
    role:                  'tooling',
    type:                  'install',
    authorisedPhases:      ['setup'],
    allowedPipelines:      ['install'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Assessment agents ─────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.assessment.generic',
    nativeNames:           { claude: 'generic-software-assessment' },
    relativeInstallPath:   '.claude/agents/generic-software-assessment.md',
    role:                  'assessor',
    type:                  'generic',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.assessment.layered-architecture',
    nativeNames:           { claude: 'layered-architecture-assessment' },
    relativeInstallPath:   '.claude/agents/layered-architecture-assessment.md',
    role:                  'assessor',
    type:                  'architecture',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.assessment.concurrency',
    nativeNames:           { claude: 'concurrency-safety-assessment' },
    relativeInstallPath:   '.claude/agents/concurrency-safety-assessment.md',
    role:                  'assessor',
    type:                  'concurrency',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.assessment.intervention-documentation',
    nativeNames:           { claude: 'intervention-documentation-standard' },
    relativeInstallPath:   '.claude/agents/intervention-documentation-standard.md',
    role:                  'assessor',
    type:                  'documentation',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Refactoring agents ────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.refactoring.dependency-injection',
    nativeNames:           { claude: 'dependency-injection-refactoring' },
    relativeInstallPath:   '.claude/agents/dependency-injection-refactoring.md',
    role:                  'refactoring',
    type:                  'dependency-injection',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.refactoring.domain-model',
    nativeNames:           { claude: 'domain-model-refactoring' },
    relativeInstallPath:   '.claude/agents/domain-model-refactoring.md',
    role:                  'refactoring',
    type:                  'domain-model',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.refactoring.god-class',
    nativeNames:           { claude: 'god-class-decomposition' },
    relativeInstallPath:   '.claude/agents/god-class-decomposition.md',
    role:                  'refactoring',
    type:                  'god-class',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Security agents ───────────────────────────────────────────────────────
  {
    agentId:               'gaia.agent.security.supply-chain',
    nativeNames:           { claude: 'dependency-supply-chain-security' },
    relativeInstallPath:   '.claude/agents/dependency-supply-chain-security.md',
    role:                  'security',
    type:                  'supply-chain',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.agent.security.hardening',
    nativeNames:           { claude: 'security-hardening' },
    relativeInstallPath:   '.claude/agents/security-hardening.md',
    role:                  'security',
    type:                  'hardening',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  // ── Orchestrators (workflow scripts) ──────────────────────────────────────
  {
    agentId:               'gaia.orchestrator.feature.phase1',
    nativeNames:           { claude: 'pm-phase1' },
    relativeInstallPath:   '.claude/workflows/pm-phase1.js',
    role:                  'orchestrator',
    type:                  'feature-phase1',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.orchestrator.feature.phase2',
    nativeNames:           { claude: 'pm-phase2' },
    relativeInstallPath:   '.claude/workflows/pm-phase2.js',
    role:                  'orchestrator',
    type:                  'feature-phase2',
    authorisedPhases:      ['planning'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.orchestrator.feature.phase3',
    nativeNames:           { claude: 'pm-phase3' },
    relativeInstallPath:   '.claude/workflows/pm-phase3.js',
    role:                  'orchestrator',
    type:                  'feature-phase3',
    authorisedPhases:      ['implementation'],
    allowedPipelines:      ['implement-feature'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.orchestrator.assessment.phase1',
    nativeNames:           { claude: 'am-phase1' },
    relativeInstallPath:   '.claude/workflows/am-phase1.js',
    role:                  'orchestrator',
    type:                  'assessment-phase1',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
  {
    agentId:               'gaia.orchestrator.assessment.phase2',
    nativeNames:           { claude: 'am-phase2' },
    relativeInstallPath:   '.claude/workflows/am-phase2.js',
    role:                  'orchestrator',
    type:                  'assessment-phase2',
    authorisedPhases:      ['assessment'],
    allowedPipelines:      ['assess-codebase'],
    minimumToolkitVersion: '0.13.0',
    deprecated:            false,
    deprecationTarget:     null,
    platforms:             ['claude'],
  },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function _readManifestSync(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (_) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ── Provenance guard — internal resolution engine ─────────────────────────────
//
// Deterministic, pure JavaScript.  No LLM, no network, no Claude API imports.
// Implements the verification chain specified in §2.3 "Agent Resolution with
// Hash Verification" of the FTR-017 Tech-Spec:
//   1. Catalog lookup → not-found on unknown ID
//   2. Platform check → not-applicable when platform unsupported
//   3. Effective installation determination (local vs global; both → conflict)
//   4. Manifest read → manifest-missing on absent or corrupt file
//   5. Manifest files-list membership check → not-installed when absent
//   6. On-disk file existence check → not-installed when absent
//   7. Scope collision check (same native name in both observable scopes)
//   8. Hash verification:
//        no fileHashes in manifest → hash-unverifiable
//        hash present but mismatch  → hash-mismatch
//        hash matches               → verified
//
// homeDir is injected rather than sourced from os.homedir() so that test suites
// can pass an isolated temporary directory and never touch the real user home
// (AC-28 requirement).

function _provenanceGuard(projectDir, agentId, platform, homeDir) {
  // Step 1 — catalog lookup
  var entry = null;
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].agentId === agentId) { entry = CATALOG[i]; break; }
  }
  if (!entry) {
    return {
      agentId:  agentId,
      platform: platform,
      status:   'not-found',
      error:    'Agent ID "' + agentId + '" is not in the canonical catalog.',
    };
  }

  // Step 2 — platform support
  if (!entry.platforms || entry.platforms.indexOf(platform) === -1) {
    return {
      agentId:    agentId,
      platform:   platform,
      nativeName: null,
      status:     'not-applicable',
      error:      'Agent "' + agentId + '" does not support platform "' + platform + '".',
    };
  }

  var nativeName = entry.nativeNames[platform];
  var relPath    = entry.relativeInstallPath;

  // Step 3 — determine effective installation
  var projectManifestPath = path.join(projectDir, '.claude', '.ai-toolkit-manifest.json');
  var globalManifestPath  = path.join(homeDir, '.claude', '.ai-toolkit-manifest.json');

  var hasProject = fs.existsSync(projectManifestPath);
  var hasGlobal  = fs.existsSync(globalManifestPath);

  if (hasProject && hasGlobal) {
    return {
      agentId:    agentId,
      platform:   platform,
      nativeName: nativeName,
      status:     'conflict',
      error:      'Both local and global toolkit installations found; installation is ambiguous. ' +
                  'Remove one installation or reinstall to a single scope.',
    };
  }

  if (!hasProject && !hasGlobal) {
    return {
      agentId:    agentId,
      platform:   platform,
      nativeName: nativeName,
      status:     'manifest-missing',
      error:      'No toolkit installation found; manifest absent at both project and global scope.',
    };
  }

  var installRoot  = hasProject ? projectDir : homeDir;
  var scope        = hasProject ? 'project'  : 'global';
  var manifestPath = hasProject ? projectManifestPath : globalManifestPath;

  // Step 4 — manifest read
  var manifest = _readManifestSync(manifestPath);
  if (!manifest) {
    return {
      agentId:      agentId,
      platform:     platform,
      nativeName:   nativeName,
      scope:        scope,
      manifestPath: manifestPath,
      status:       'manifest-missing',
      error:        'Manifest at "' + manifestPath + '" is missing or could not be parsed.',
    };
  }

  var toolkitVersion = manifest.version || 'unknown';

  // Step 5 — manifest files-list membership
  var files = Array.isArray(manifest.files) ? manifest.files : [];
  if (files.indexOf(relPath) === -1) {
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      status:         'not-installed',
      error:          'Agent file "' + relPath + '" is not declared in the manifest files list.',
    };
  }

  // Step 6 — on-disk existence
  var agentAbsPath = path.join(installRoot, relPath);
  if (!fs.existsSync(agentAbsPath)) {
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      path:           agentAbsPath,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      status:         'not-installed',
      error:          'Agent file not found on disk: ' + agentAbsPath,
    };
  }

  // Step 7 — scope collision: check the OTHER observable scope for the same native name
  var otherInstallRoot = hasProject ? homeDir : projectDir;
  var otherAgentPath   = path.join(otherInstallRoot, relPath);
  if (fs.existsSync(otherAgentPath)) {
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      path:           agentAbsPath,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      status:         'conflict',
      error:          'Agent file "' + nativeName + '" found in both observable scopes: ' +
                      agentAbsPath + ' and ' + otherAgentPath + '.',
    };
  }

  // Step 8 — hash verification (provenance guard)
  if (!manifest.fileHashes) {
    // v0.12.0 manifest — no integrity data
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      path:           agentAbsPath,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      sha256:         null,
      status:         'hash-unverifiable',
    };
  }

  var recordedHash = manifest.fileHashes[relPath];
  if (!recordedHash) {
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      path:           agentAbsPath,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      sha256:         null,
      status:         'hash-unverifiable',
      error:          'No hash entry in manifest fileHashes for "' + relPath + '". ' +
                      'Reinstall or upgrade the toolkit runtime to generate integrity hashes.',
    };
  }

  // Recompute SHA-256 from disk on every call to detect post-install modification.
  var content  = fs.readFileSync(agentAbsPath);
  var computed = 'sha256:' + _sha256Hex(content);

  if (computed !== recordedHash) {
    return {
      agentId:        agentId,
      platform:       platform,
      nativeName:     nativeName,
      scope:          scope,
      path:           agentAbsPath,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
      sha256:         recordedHash,
      status:         'hash-mismatch',
      error:          'SHA-256 on disk does not match manifest record. ' +
                      'Computed: ' + computed + '. Recorded: ' + recordedHash + '.',
    };
  }

  return {
    agentId:        agentId,
    platform:       platform,
    nativeName:     nativeName,
    scope:          scope,
    path:           agentAbsPath,
    toolkitVersion: toolkitVersion,
    manifestPath:   manifestPath,
    sha256:         computed,
    status:         'verified',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve an agent by canonical ID with optional verification.
 *
 * @param {object}  opts
 * @param {string}  opts.projectDir       - project root directory
 * @param {string}  opts.agentId          - canonical ID (e.g. "gaia.agent.developer.backend")
 * @param {string}  [opts.platform]       - target platform (default: "claude")
 * @param {boolean} [opts.requireVerified] - when true, throws if status is not "verified"
 * @param {string}  [opts.homeDir]        - override home directory (for test isolation, AC-28)
 * @returns {Promise<object>} resolution record with status and identity fields
 * @throws  when requireVerified is true and the resolved status is not "verified"
 */
async function resolveAgent(opts) {
  var projectDir      = opts.projectDir;
  var agentId         = opts.agentId;
  var platform        = opts.platform        != null ? opts.platform        : 'claude';
  var requireVerified = opts.requireVerified != null ? opts.requireVerified : false;
  var homeDir         = opts.homeDir         != null ? opts.homeDir         : os.homedir();

  var rec = _provenanceGuard(projectDir, agentId, platform, homeDir);

  if (requireVerified && rec.status !== 'verified') {
    var msg = 'agent-registry: resolution failed — status "' + rec.status + '" for ' + agentId;
    if (rec.error) msg += ': ' + rec.error;
    var err = new Error(msg);
    err.code   = 'RESOLUTION_FAILED';
    err.record = rec;
    throw err;
  }

  return rec;
}

/**
 * Validate a set of agent references against the catalog and manifest.
 *
 * When agentIds is omitted all catalog agents are validated.
 * An ID not present in the catalog is reported as an error immediately,
 * without attempting filesystem resolution.
 *
 * @param {string}   projectDir
 * @param {string[]} [agentIds] - subset of canonical IDs to validate; defaults to all
 * @param {string}   [homeDir]  - override home directory (for test isolation, AC-28)
 * @returns {Promise<object[]>} array of error records (empty array = all valid)
 */
async function validateAgentSet(projectDir, agentIds, homeDir) {
  var ids = Array.isArray(agentIds) ? agentIds : CATALOG.map(function (e) { return e.agentId; });
  var errors = [];

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];

    var inCatalog = false;
    for (var j = 0; j < CATALOG.length; j++) {
      if (CATALOG[j].agentId === id) { inCatalog = true; break; }
    }

    if (!inCatalog) {
      errors.push({
        agentId: id,
        status:  'not-found',
        error:   'Agent ID "' + id + '" is not in the canonical catalog.',
      });
      continue;
    }

    var rec = await resolveAgent({
      projectDir:      projectDir,
      agentId:         id,
      platform:        'claude',
      requireVerified: false,
      homeDir:         homeDir,
    });
    if (rec.status !== 'verified' && rec.status !== 'hash-unverifiable') {
      errors.push({
        agentId: id,
        status:  rec.status,
        error:   rec.error || 'Agent not available.',
      });
    }
  }

  return errors;
}

/**
 * List all registered toolkit agents with availability information.
 *
 * Uses the doctor-agents status vocabulary (per AC-13):
 *   "verified" | "conflict" | "hash-unverifiable" | "not-installed" | "not-applicable"
 * A hash-mismatch is surfaced as status "conflict" with integrityDetail: "hash-mismatch".
 *
 * @param {string} projectDir
 * @param {string} [homeDir] - override home directory (for test isolation, AC-28)
 * @returns {object[]} agent records with status
 */
function listRegisteredAgents(projectDir, homeDir) {
  if (homeDir == null) homeDir = os.homedir();
  var projectManifestPath = path.join(projectDir, '.claude', '.ai-toolkit-manifest.json');
  var globalManifestPath  = path.join(homeDir, '.claude', '.ai-toolkit-manifest.json');

  var hasProject = fs.existsSync(projectManifestPath);
  var hasGlobal  = fs.existsSync(globalManifestPath);

  var bothPresent  = hasProject && hasGlobal;
  var manifest     = null;
  var scope        = null;
  var installRoot  = null;
  var manifestPath = null;

  if (!bothPresent) {
    if (hasProject) {
      manifest     = _readManifestSync(projectManifestPath);
      scope        = 'project';
      installRoot  = projectDir;
      manifestPath = projectManifestPath;
    } else if (hasGlobal) {
      manifest     = _readManifestSync(globalManifestPath);
      scope        = 'global';
      installRoot  = homeDir;
      manifestPath = globalManifestPath;
    }
  }

  return CATALOG.map(function (entry) {
    var nativeName = entry.nativeNames.claude;

    var base = {
      agentId:    entry.agentId,
      nativeName: nativeName,
      role:       entry.role,
      type:       entry.type,
      platforms:  entry.platforms,
      deprecated: entry.deprecated,
    };

    if (bothPresent) {
      return Object.assign({}, base, {
        status: 'conflict',
        error:  'Both local and global toolkit installations found; installation is ambiguous.',
      });
    }

    if (!manifest) {
      return Object.assign({}, base, {
        status: 'not-installed',
        scope:  null,
      });
    }

    var relPath        = entry.relativeInstallPath;
    var toolkitVersion = manifest.version || 'unknown';
    var files          = Array.isArray(manifest.files) ? manifest.files : [];

    if (files.indexOf(relPath) === -1) {
      return Object.assign({}, base, {
        status:         'not-installed',
        scope:          scope,
        toolkitVersion: toolkitVersion,
        manifestPath:   manifestPath,
      });
    }

    var absPath = path.join(installRoot, relPath);
    if (!fs.existsSync(absPath)) {
      return Object.assign({}, base, {
        status:         'not-installed',
        scope:          scope,
        path:           absPath,
        toolkitVersion: toolkitVersion,
        manifestPath:   manifestPath,
      });
    }

    if (!manifest.fileHashes) {
      return Object.assign({}, base, {
        status:         'hash-unverifiable',
        scope:          scope,
        path:           absPath,
        toolkitVersion: toolkitVersion,
        manifestPath:   manifestPath,
      });
    }

    var recordedHash = manifest.fileHashes[relPath];
    if (!recordedHash) {
      return Object.assign({}, base, {
        status:         'hash-unverifiable',
        scope:          scope,
        path:           absPath,
        toolkitVersion: toolkitVersion,
        manifestPath:   manifestPath,
      });
    }

    var content  = fs.readFileSync(absPath);
    var computed = 'sha256:' + _sha256Hex(content);

    if (computed !== recordedHash) {
      return Object.assign({}, base, {
        status:          'conflict',
        integrityDetail: 'hash-mismatch',
        scope:           scope,
        path:            absPath,
        sha256:          recordedHash,
        toolkitVersion:  toolkitVersion,
        manifestPath:    manifestPath,
      });
    }

    return Object.assign({}, base, {
      status:         'verified',
      scope:          scope,
      path:           absPath,
      sha256:         computed,
      toolkitVersion: toolkitVersion,
      manifestPath:   manifestPath,
    });
  });
}

module.exports = {
  CATALOG,
  resolveAgent,
  validateAgentSet,
  listRegisteredAgents,
};
