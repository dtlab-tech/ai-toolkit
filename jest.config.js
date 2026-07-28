'use strict';

/** @type {import('jest').Config} */
module.exports = {
  // Run in Node environment (no DOM needed)
  testEnvironment: 'node',

  // Discover test files under tests/
  testMatch: ['**/tests/**/*.test.js'],

  // Collect coverage from cli.js only
  collectCoverageFrom: ['bin/cli.js'],

  // Exclude coverage/ and node_modules from coverage report
  coveragePathIgnorePatterns: ['/node_modules/', '/coverage/'],

  // Output both lcov (for tooling) and html (for humans) coverage reports
  coverageReporters: ['lcov', 'html', 'text'],
};
