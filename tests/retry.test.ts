import { test } from "node:test";
import assert from "node:assert/strict";
import { retryDelayMs } from "../src/server/model.js";
test("provider delay honors seconds and HTTP-date Retry-After headers", () => {
  assert.equal(retryDelayMs("1.5", 0), 1500);
  assert.equal(
    retryDelayMs(
      "Thu, 01 Jan 2026 00:00:02 GMT",
      0,
      Date.parse("2026-01-01T00:00:00Z"),
    ),
    2000,
  );
});
test("missing or invalid Retry-After uses bounded exponential backoff", () => {
  assert.equal(retryDelayMs(null, 0), 10000);
  assert.equal(retryDelayMs("invalid", 2), 40000);
  assert.equal(retryDelayMs(null, 9), 60000);
});
