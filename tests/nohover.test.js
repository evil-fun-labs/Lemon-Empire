import { execSync } from 'node:child_process';
import { suite, assert } from './harness.js';
const t = suite('no hover (test-spec section 6)');
const grep = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }); } catch (e) { if (e.status === 1) return ''; throw e; } };
t.test("grep -rnE ':hover|mouseover|mouseenter|@media *\\(hover' src/ index.html returns nothing", () => {
  const out = grep("grep -rnE ':hover|mouseover|mouseenter|@media *\\(hover' src/ index.html");
  assert.equal(out, '', out);
});
t.test('no innerHTML/outerHTML/insertAdjacentHTML/document.write anywhere in src/ or index.html', () => {
  const out = grep("grep -rnE 'innerHTML|outerHTML|insertAdjacentHTML|document\\.write' src/ index.html");
  assert.equal(out, '', out);
});
t.done();
