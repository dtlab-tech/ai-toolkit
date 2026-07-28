'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { isMattPocockInstalled } = require('../../bin/cli');

describe('isMattPocockInstalled()', () => {
  test('returns a boolean', () => {
    const result = isMattPocockInstalled();
    expect(typeof result).toBe('boolean');
  });

  test('returns false when neither grilling skill path exists', () => {
    // On a clean CI / test machine without Matt Pocock skills installed the
    // function should return false.  We verify the path resolution logic by
    // checking that the function is callable and returns false when the
    // expected grilling SKILL.md is absent from both known locations.
    const homedir = os.homedir();
    const globalPath = path.join(homedir, '.claude', 'skills', 'grilling', 'SKILL.md');
    const localPath  = path.join(process.cwd(), '.claude', 'skills', 'grilling', 'SKILL.md');

    const globalExists = fs.existsSync(globalPath);
    const localExists  = fs.existsSync(localPath);

    const result = isMattPocockInstalled();

    if (!globalExists && !localExists) {
      expect(result).toBe(false);
    } else {
      // At least one path exists — function should return true
      expect(result).toBe(true);
    }
  });
});
