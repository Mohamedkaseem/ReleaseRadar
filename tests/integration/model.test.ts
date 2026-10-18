import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
let earlyFinish = false;
let calls = 0;
let throttlesRemaining = 0;
let rejectAfterTest = false;
const provider = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString()) as {
    messages: {
      role: string;
      name?: string;
      content?: string;
      tool_calls?: { function: { name: string } }[];
    }[];
  };
  const names = body.messages.flatMap(
    (m) => m.tool_calls?.map((t) => t.function.name) ?? [],
  );
  calls++;
  if (
    throttlesRemaining > 0 ||
    (rejectAfterTest && names.includes("run_test"))
  ) {
    throttlesRemaining = Math.max(0, throttlesRemaining - 1);
    res.writeHead(429, {
      "content-type": "application/json",
      "retry-after": "0",
    });
    res.end(JSON.stringify({ error: { message: "Synthetic quota limit" } }));
    return;
  }

  let tools: { name: string; arguments: string }[];
  if (earlyFinish)
    tools = [
      {
        name: "finish",
        arguments: JSON.stringify({
          summary: "Stopped before inspecting changes.",
        }),
      },
    ];
  else if (!names.includes("get_release_changes"))
    tools = [{ name: "get_release_changes", arguments: "{}" }];
  else if (!names.includes("inspect_change"))
    tools = [
      {
        name: "inspect_change",
        arguments: JSON.stringify({
          changeId: "identity.customer.customerId:removed",
        }),
      },
      {
        name: "inspect_change",
        arguments: JSON.stringify({ changeId: "identity.customer.id:added" }),
      },
    ];
  else if (!names.includes("get_verification_plan"))
    tools = [{ name: "get_verification_plan", arguments: "{}" }];
  else if (!names.includes("run_test"))
    tools = [
      { name: "run_test", arguments: JSON.stringify({ testId: "checkout" }) },
      {
        name: "run_test",
        arguments: JSON.stringify({ testId: "identity-contract" }),
      },
    ];
  else
    tools = [
      {
        name: "finish",
        arguments: JSON.stringify({
          summary:
            "The graph identified the indirect dependency and actual verification failed.",
        }),
      },
    ];
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: tools.map((t, i) => ({
              id: `call-${calls}-${i}`,
              type: "function",
              function: t,
            })),
          },
        },
      ],
    }),
  );
});
provider.listen(0, "127.0.0.1");
await once(provider, "listening");
const address = provider.address();
if (!address || typeof address === "string")
  throw new Error("Mock provider failed");
process.env.LLM_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.LLM_MODEL = "local-test-model";
process.env.LLM_API_KEY = "local-test-key";
process.env.RR_HISTORY_GRAPH = "rr_model_test_history";
const { createInvestigation } = await import("../../src/server/agent.js");
const { getReport } = await import("../../src/server/history.js");
const { closeDatabase } = await import("../../src/server/db.js");
after(async () => {
  provider.closeAllConnections();
  await new Promise<void>((done) => provider.close(() => done()));
  await closeDatabase();
});
async function investigate() {
  const pending = await createInvestigation({
    baseline: "baseline",
    candidate: "breaking",
    mode: "model",
    autoVerify: true,
    question: "Investigate checkout.",
  });
  for (let i = 0; i < 200; i++) {
    await delay(100);
    const report = await getReport(pending.id);
    if (report && report.status !== "running") return report;
  }
  throw new Error("Mock model run timed out");
}
test("model tool loop uses actual FalkorDB and executable tests through a local mock provider", async () => {
  const report = await investigate();
  assert.equal(report.status, "completed", report.error);
  assert.equal(report.verdict, "blocked");
  assert.equal(report.tests.length, 2);
  assert.ok(report.findings.some((f) => f.serviceId === "checkout"));
  assert.ok(calls <= 6);
});
test("an early model finish cannot produce a passing recommendation", async () => {
  earlyFinish = true;
  const report = await investigate();
  assert.equal(report.verdict, "needs-verification");
  assert.ok(report.warnings.some((w) => w.includes("not inspected")));
  assert.equal(report.tests.length, 0);
});

test("transient provider throttling resumes the same investigation", async () => {
  earlyFinish = false;
  throttlesRemaining = 1;
  const report = await investigate();
  assert.equal(report.status, "completed", report.error);
  assert.equal(report.verdict, "blocked");
  assert.equal(report.tests.length, 2);
  assert.ok(report.events.some((e) => e.tool === "provider_retry"));
});
test("exhausted provider retries preserve a confirmed blocking failure", async () => {
  earlyFinish = false;
  rejectAfterTest = true;
  try {
    const report = await investigate();
    assert.equal(report.status, "error");
    assert.equal(report.verdict, "blocked");
    assert.ok(report.tests.some((t) => t.status === "failed"));
    assert.equal(
      report.events.filter((e) => e.tool === "provider_retry").length,
      3,
    );
  } finally {
    rejectAfterTest = false;
  }
});
