import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.FALKORDB_PORT = "1";
const { buildApp } = await import("../src/server/app.js");
const { closeDatabase } = await import("../src/server/db.js");
after(closeDatabase);
test("database outage returns explicit errors without substituting impact results", async () => {
  const app = await buildApp();
  try {
    const health = await app.inject("/api/health");
    assert.equal(health.statusCode, 503);
    assert.equal(health.json().database, "unavailable");
    const history = await app.inject("/api/investigations");
    assert.equal(history.statusCode, 503);
    assert.ok(history.json().error);
  } finally {
    await app.close();
  }
});
