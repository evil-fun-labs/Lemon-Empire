// Tiny test harness: prints "PASS name" / "FAIL name: why", exits 1 on any failure.
import assert from 'node:assert/strict';
export function suite(title) {
  let failed = 0; let passed = 0;
  console.log(`# ${title}`);
  return {
    test(name, fn) {
      try { fn(); passed++; console.log(`PASS ${name}`); }
      catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
    },
    done() {
      console.log(`# ${title}: ${passed} passed, ${failed} failed`);
      if (failed) process.exit(1);
    },
  };
}
export { assert };
