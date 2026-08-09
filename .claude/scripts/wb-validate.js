// Schema v2 constants — used by validation checks below

const SCHEMA_VERSION = 2

const REQUIRED_PHASE_FIELDS = [
  'id',
  'type',
  'title',
  'commit',
  'tasks',
]

const REQUIRED_TASK_FIELDS = [
  'id',
  'title',
  'outcome',
  'domain',
  'agentType',
  'dependsOn',
  'acceptanceCriteria',
  'verification',
  'estimate',
  'outputCount',
  'groupingRationale',
  'commit',
]

const VALID_DOMAINS = ['BE', 'FE', 'DB', 'DevOps', 'INFRA', 'TEST']

const VALID_AGENT_TYPES = [
  'developer-backend',
  'developer-frontend',
  'developer-testing',
  'developer-database',
  'review-solution',
]

// Duration policy thresholds (agentMinutes) — used by check 15
const TARGET_MAX = 15   // tasks ≤15 min agent estimate: target band
const ABOVE_MAX = 20    // tasks 16–20 min: above target (no flag)
const WARNING_MAX = 30  // tasks 21–30 min: warning band (non-blocking); >30 = splitRequired (blocking)

// Error catalog — eliminates magic strings across validation checks
const ERRORS = {
  SCHEMA_VERSION_INVALID:       'schema_version_invalid',        // check 2
  UNIQUE_ID_VIOLATION:          'unique_id_violation',           // check 3
  MISSING_FIELD:                'missing_field',                 // check 4
  INVALID_ID_FORMAT:            'invalid_id_format',             // check 5
  INVALID_DOMAIN:               'invalid_domain',                // check 6
  INVALID_AGENT_TYPE:           'invalid_agent_type',            // check 7
  DEPENDENCY_NOT_FOUND:         'dependency_not_found',          // check 8
  SELF_DEPENDENCY:              'self_dependency',               // check 9
  PHASE_ID_MISMATCH:            'phase_id_mismatch',             // check 10
  TASK_CYCLE_DETECTED:          'task_cycle_detected',           // check 11
  PHASE_DEPENDENCY_NOT_FOUND:   'phase_dependency_not_found',    // check 12
  PHASE_CYCLE_DETECTED:         'phase_cycle_detected',          // check 13
  PHASE_UNSCHEDULABLE:          'phase_unschedulable',           // check 14
  DURATION_WARNING:             'duration_warning',              // check 15 — non-blocking warning
  SPLIT_REQUIRED:               'split_required',                // check 15 — blocking error (>30 min)
  EMPTY_VERIFICATION_COMMANDS:  'empty_verification_commands',   // check 16
  EMPTY_COMMIT_SUBJECT:         'empty_commit_subject',          // check 17
  MISSING_GROUPING_RATIONALE:   'missing_grouping_rationale',    // check 18
  AC_NOT_FOUND:                 'ac_not_found',                  // check 19
  AC_WRONG_US:                  'ac_wrong_us',                   // check 20
  AC_INVALID_UC_REF:            'ac_invalid_uc_ref',             // check 20
  UC_MISSING_PRIORITY:          'uc_missing_priority',           // check 20
  MUST_AC_UNCOVERED:            'must_ac_uncovered',             // check 21
  INVALID_TEXT_FIELD_CHARS:     'invalid_text_field_chars',      // check 22
  EMPTY_PHASE:                  'empty_phase',                   // check 23
}

// Validation logic follows in subsequent tasks (US-02-T01..T14)
