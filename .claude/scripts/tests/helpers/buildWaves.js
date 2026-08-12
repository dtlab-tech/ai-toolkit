// Extracted verbatim from pm-phase3.js — must remain in sync

const buildWaves = (phases) => {
  const done   = new Set()
  const waves  = []
  let remaining = [...phases]
  while (remaining.length > 0) {
    const ready = remaining.filter(p => p.depends_on.every(d => done.has(d)))
    if (ready.length === 0) {
      // Circular or unresolvable deps — run the rest sequentially to avoid deadlock
      waves.push(remaining)
      break
    }
    waves.push(ready)
    ready.forEach(p => done.add(p.phase_id))
    remaining = remaining.filter(p => !done.has(p.phase_id))
  }
  return waves
}

module.exports = { buildWaves }
