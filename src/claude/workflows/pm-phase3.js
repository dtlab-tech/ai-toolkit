export const meta = {
  name: 'pm-phase3',
  description: 'Retired compatibility entry point. Implementation is owned by the FTR-018 task executor.',
  phases: [],
}

// Never dispatch this workflow as an agentType. The old CSV/ledger/CLI wrappers
// bypassed FTR-018 ownership, checkpoints and resume. Do not restore that path.
throw new Error('pm-phase3 is retired. Use ai-toolkit tasks start/run as documented in docs/task-executor-bootstrap.md. No implementation was started.')
