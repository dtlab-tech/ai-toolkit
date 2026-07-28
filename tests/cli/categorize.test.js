'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { categorize } = require('../../bin/cli');

describe('categorize()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('classifies a non-existent dest as "new"', () => {
    const src  = path.join(tmpDir, 'src.txt');
    const dest = path.join(tmpDir, 'nonexistent.txt');
    fs.writeFileSync(src, 'some content');

    const result = categorize([{ src, dest }]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new');
    expect(result[0].src).toBe(src);
    expect(result[0].dest).toBe(dest);
  });

  test('classifies files with identical content as "same"', () => {
    const src  = path.join(tmpDir, 'src.txt');
    const dest = path.join(tmpDir, 'dest.txt');
    const content = 'identical content';
    fs.writeFileSync(src, content);
    fs.writeFileSync(dest, content);

    const result = categorize([{ src, dest }]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('same');
  });

  test('classifies files with different content as "modified"', () => {
    const src  = path.join(tmpDir, 'src.txt');
    const dest = path.join(tmpDir, 'dest.txt');
    fs.writeFileSync(src, 'new content');
    fs.writeFileSync(dest, 'old content');

    const result = categorize([{ src, dest }]);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('modified');
  });

  test('handles multiple file pairs with mixed statuses', () => {
    const srcNew      = path.join(tmpDir, 'srcNew.txt');
    const destNew     = path.join(tmpDir, 'destNew.txt');  // does not exist
    const srcSame     = path.join(tmpDir, 'srcSame.txt');
    const destSame    = path.join(tmpDir, 'destSame.txt');
    const srcModified = path.join(tmpDir, 'srcMod.txt');
    const destModified = path.join(tmpDir, 'destMod.txt');

    fs.writeFileSync(srcNew, 'new');
    fs.writeFileSync(srcSame, 'same');
    fs.writeFileSync(destSame, 'same');
    fs.writeFileSync(srcModified, 'v2');
    fs.writeFileSync(destModified, 'v1');

    const result = categorize([
      { src: srcNew, dest: destNew },
      { src: srcSame, dest: destSame },
      { src: srcModified, dest: destModified },
    ]);

    expect(result).toHaveLength(3);
    const statuses = result.map(e => e.status);
    expect(statuses).toContain('new');
    expect(statuses).toContain('same');
    expect(statuses).toContain('modified');
  });
});
