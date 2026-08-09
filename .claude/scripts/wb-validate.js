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

// Validation logic follows in subsequent tasks (US-02-T01..T14)
