import { test } from "node:test";
import assert from "node:assert/strict";
import { compareContracts, updateVerdict } from "../src/server/analyzer.js";
import { loadManifest, buildSnapshot } from "../src/server/repository.js";
import { InvestigationInput, type Report } from "../src/shared/schema.js";
test("removed field and additive replacement are detected independently", async () => {
  const changes = compareContracts(
    await loadManifest("baseline"),
    await loadManifest("breaking"),
  );
  assert.deepEqual(
    changes.map((c) => [c.field, c.kind]),
    [
      ["customerId", "removed"],
      ["id", "added"],
    ],
  );
});
test("compatible fix preserves original contract", async () => {
  const changes = compareContracts(
    await loadManifest("baseline"),
    await loadManifest("fixed"),
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "added");
});
test("type changes carry before and after types", async () => {
  const change = compareContracts(
    await loadManifest("baseline"),
    await loadManifest("type-change"),
  )[0];
  assert.equal(change.before, "string");
  assert.equal(change.after, "number");
});
test("snapshot identities are deterministic and distinct", async () => {
  const [a, b, c] = await Promise.all([
    buildSnapshot("baseline"),
    buildSnapshot("baseline"),
    buildSnapshot("breaking"),
  ]);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.ok(a.sources.every((s) => s.line > 0 && s.excerpt.length > 0));
  assert.ok(a.edges.some((e) => e.kind === "CONSUMES"));
});
test("rejects unknown revisions and equal comparisons", () => {
  assert.equal(
    InvestigationInput.safeParse({ candidate: "../../../etc/passwd" }).success,
    false,
  );
  assert.equal(
    InvestigationInput.safeParse({ candidate: "baseline" }).success,
    false,
  );
});
function report(): Report {
  return {
    id: "test",
    baseline: "baseline",
    candidate: "breaking",
    question: "test",
    mode: "guided",
    status: "completed",
    verdict: "investigating",
    createdAt: "",
    updatedAt: "",
    changes: [],
    events: [],
    warnings: [],
    summary: "",
    tests: [],
    findings: [
      {
        id: "finding",
        changeId: "change",
        serviceId: "checkout",
        title: "Checkout",
        state: "potential",
        paths: [],
        sourceIds: [],
        testIds: ["checkout"],
        explanation: "",
      },
    ],
  };
}
test("baseline passing checks never clear candidate impact", () => {
  const r = report();
  r.tests.push({
    id: "run",
    testId: "checkout",
    revision: "baseline",
    status: "passed",
    startedAt: "",
    output: "",
  });
  updateVerdict(r);
  assert.equal(r.verdict, "needs-verification");
});
test("candidate failure blocks release", () => {
  const r = report();
  r.tests.push({
    id: "run",
    testId: "checkout",
    revision: "breaking",
    status: "failed",
    startedAt: "",
    output: "",
  });
  updateVerdict(r);
  assert.equal(r.verdict, "blocked");
  assert.equal(r.findings[0].state, "confirmed");
});
test("incomplete evidence prevents a passing recommendation", () => {
  const r = report();
  r.warnings.push("Missing dependency evidence");
  r.tests.push({
    id: "run",
    testId: "checkout",
    revision: "breaking",
    status: "passed",
    startedAt: "",
    output: "",
  });
  updateVerdict(r);
  assert.equal(r.verdict, "needs-verification");
});
