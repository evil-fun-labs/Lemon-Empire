// npm run stamp: writes version.json { version, commit, build } from package.json and git.
// commit = short hash of HEAD, build = number of commits on HEAD. Run it before you push or deploy.
// `node scripts/stamp.js --out path` writes somewhere else (used by the tests).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (cmd) => execSync('git ' + cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const i = process.argv.indexOf('--out');
const out = i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(root, 'version.json');

let commit = 'unknown'; let build = 0;
try { commit = git('rev-parse --short HEAD'); build = Number(git('rev-list --count HEAD')); } catch { /* not a git checkout */ }
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const v = { version: pkg.version, commit, build };
fs.writeFileSync(out, JSON.stringify(v, null, 2) + '\n');
console.log(`stamped ${path.relative(root, out) || out}: ${JSON.stringify(v)}`);
