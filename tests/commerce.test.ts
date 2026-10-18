import { test } from "node:test";
import assert from "node:assert/strict";
import { runTest } from "../src/server/runner.js";
for (const [revision, expected] of [
  ["baseline", "passed"],
  ["breaking", "failed"],
  ["fixed", "passed"],
  ["type-change", "failed"],
] as const) {
  test(`real checkout HTTP behavior: ${revision}`, async () => {
    const result = await runTest(revision, "checkout");
    assert.equal(result.status, expected, result.output);
    assert.match(result.output, /GET \/checkout/);
  });
}
test("runner rejects arbitrary commands", async () => {
  await assert.rejects(runTest("baseline", "rm -rf /"), /Unsupported test ID/);
});
