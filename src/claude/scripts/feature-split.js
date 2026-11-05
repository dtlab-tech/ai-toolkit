'use strict';

class FeatureSplitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FeatureSplitError';
    this.code = code;
    this.key = details.key ?? null;
    this.file = details.file ?? null;
  }
}

module.exports = { FeatureSplitError };
