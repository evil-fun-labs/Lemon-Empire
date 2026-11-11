// npm run stamp writes version.json with the git short hash and build number.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, assert } from './harness.js';
const root = new URL('..', import.meta.url).pathname;
const t = suite('stamp (version.json)');
const run = (out) => execFileSync('node', ['scripts/stamp.js', '--out', out], { cwd: root, encoding: 'utf8' });
const git = (c) => execFileSync('git', c, { cwd: root, encoding: 'utf8' }).trim();
t.test('stamp writes {version, commit, build} from package.json and git', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-')); const out = path.join(dir, 'v.json');
  run(out);
  const v = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(v).sort(), ['build', 'commit', 'version']);
  assert.equal(v.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  assert.equal(v.commit, git(['rev-parse', '--short', 'HEAD']));
  assert.equal(v.build, Number(git(['rev-list', '--count', 'HEAD'])));
  assert.ok(Number.isInteger(v.build) && v.build > 0); assert.match(v.commit, /^[0-9a-f]{7,}$/);
  fs.rmSync(dir, { recursive: true });
});
t.test('package.json has an npm run stamp script', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.stamp, 'node scripts/stamp.js');
});
t.test('committed version.json has the stamp fields', () => {
  const v = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  assert.equal(typeof v.version, 'string'); assert.equal(typeof v.commit, 'string'); assert.equal(typeof v.build, 'number');
});
t.done();
