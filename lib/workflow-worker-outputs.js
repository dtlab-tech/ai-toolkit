'use strict';
const fs = require('fs');
const path = require('path');

// Validates that a worker's declared output stays inside the project, outside any
// tool-config directory, and is never reached through a symlink/junction — then
// returns its canonical absolute path. The workflow host (never the LLM) writes the
// worker's returned content to this path with fs.writeFileSync; there is no CLI
// permission surface to construct here ("Never ask an LLM to do I/O").
//
// Assumes `root` and `output.path` already share the same 8.3-alias form (createControl
// realpath.native's `root` once at startup; feature() realpath.native's featurePath/
// featureDir the same way, and every output.path in this codebase is built from
// featureDir) — do NOT realpath-resolve anything in here to "reconcile" a mismatch: that
// would have to follow symlinks to do it, silently defeating the symlink check below.
function resolveOutputPath(root, output) {
  const target = path.resolve(root, output.path);
  const relative = path.relative(root, target);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
    throw new Error('Worker output must be inside the project: ' + target);
  }
  const segments = relative.split(path.sep);
  if (segments.some(s => ['.git', '.claude', '.codex'].includes(s.toLowerCase()))) {
    throw new Error('Unsupported worker output path: ' + target);
  }
  // Never automatically write a target reached through a symlink/junction.
  let cursor = root;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Worker output traverses a symlink: ' + cursor);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

module.exports = { resolveOutputPath };
