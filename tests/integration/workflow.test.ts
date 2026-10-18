import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { buildApp } from "../../src/server/app.js";
import { closeDatabase, query } from "../../src/server/db.js";
import {
  createInvestigation,
  getReportGraph,
  verifyExisting,
} from "../../src/server/agent.js";
import {
  getReport,
  recoverInterrupted,
  saveReport,
} from "../../src/server/history.js";
import { importSnapshot, readSnapshot } from "../../src/server/repository.js";
import type { Report, Revision } from "../../src/shared/schema.js";
async function complete(
  candidate: Revision,
  autoVerify = true,
  baseline: Revision = "baseline",
) {
  const started = await createInvestigation({
    baseline,
    candidate,
    mode: "guided",
    autoVerify,
    question: "Investigate and verify the release.",
  });
  for (let attempt = 0; attempt < 300; attempt++) {
    await delay(100);
    const report = await getReport(started.id);
    if (report && report.status !== "running") {
      assert.equal(report.status, "completed", report.error);
      return report;
    }
  }
  throw new Error("Investigation timed out");
}
after(async () => {
  await closeDatabase();
});
test("real FalkorDB import is idempotent and graph-driven", async () => {
  const a = await importSnapshot("baseline");
  await importSnapshot("baseline");
  const result = await query(
    a.name,
    "MATCH (n:Entity) RETURN count(n) AS count",
  );
  assert.equal(Number(result[0].count), a.nodes.length);
  const edges = await query(
    a.name,
    "MATCH ()-[r:CONSUMES]->() RETURN count(r) AS count",
  );
  assert.equal(Number(edges[0].count), 2);
});
test("breaking release traces indirect Checkout impact, executes checks, and persists evidence", async () => {
  const report = await complete("breaking");
  assert.equal(report.verdict, "blocked");
  const checkout = report.findings.find((f) => f.serviceId === "checkout");
  assert.ok(checkout);
  assert.ok(
    checkout.paths.some(
      (p) => p.join(",") === "identity.customer.customerId,orders,checkout",
    ),
  );
  assert.equal(checkout.state, "confirmed");
  assert.ok(checkout.sourceIds.length);
  assert.equal(
    report.tests.find((t) => t.testId === "checkout")?.status,
    "failed",
  );
  const saved = await getReport(report.id);
  assert.deepEqual(saved?.tests, report.tests);
  const graph = await getReportGraph(report);
  assert.ok(
    graph.baseline.sources.some((s) => checkout.sourceIds.includes(s.id)),
  );
});
test("compatible fix passes actual checks and does not overwrite historical failures", async () => {
  const report = await complete("fixed");
  assert.equal(report.verdict, "checks-passed");
  assert.equal(report.tests.length, 2);
  assert.ok(report.tests.every((t) => t.status === "passed"));
});
test("incomplete candidate never receives passing verdict", async () => {
  const report = await complete("incomplete");
  assert.equal(report.verdict, "blocked");
  assert.ok(report.warnings.some((w) => w.includes("incomplete")));
});
test("cyclic dependencies terminate within bounded traversal", async () => {
  const report = await complete("breaking", true, "cycle");
  assert.equal(report.verdict, "blocked");
  assert.ok(report.findings.length <= 3);
});
test("manual verification completes deferred checks; repeated requests reuse outcome", async () => {
  const report = await complete("breaking", false);
  assert.equal(report.verdict, "needs-verification");
  const verified = await verifyExisting(report.id, "checkout");
  assert.equal(verified.verdict, "blocked");
  const again = await verifyExisting(report.id, "checkout");
  assert.equal(again.tests.length, 1);
});
test("startup recovery preserves outputs and marks interrupted work", async () => {
  const report = await complete("fixed");
  const unfinished: Report = {
    ...report,
    id: crypto.randomUUID(),
    status: "running",
    tests: [
      {
        id: "interrupted-run",
        testId: "checkout",
        revision: "fixed",
        status: "running",
        startedAt: new Date().toISOString(),
        output: "partial output",
      },
    ],
  };
  await saveReport(unfinished);
  await recoverInterrupted();
  const recovered = await getReport(unfinished.id);
  assert.equal(recovered?.status, "interrupted");
  assert.equal(recovered?.tests[0].status, "interrupted");
  assert.equal(recovered?.tests[0].output, "partial output");
});
test("API validates input and serves the built application", async () => {
  const app = await buildApp();
  try {
    assert.equal((await app.inject("/api/health")).statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/investigations",
          payload: { candidate: "not-real" },
        })
      ).statusCode,
      400,
    );
    assert.equal((await app.inject("/")).statusCode, 200);
    assert.equal((await app.inject("/api/not-real")).statusCode, 404);
  } finally {
    await app.close();
  }
});

test("stored snapshot reconstruction retains the exact graph and original evidence", async () => {
  const snapshot = await importSnapshot("baseline");
  const stored = await readSnapshot(snapshot.name);
  assert.equal(stored.hash, snapshot.hash);
  assert.deepEqual(
    stored.sources.sort((a, b) => a.id.localeCompare(b.id)),
    snapshot.sources.sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.equal(stored.nodes.length, snapshot.nodes.length);
  assert.equal(stored.edges.length, snapshot.edges.length);
});
