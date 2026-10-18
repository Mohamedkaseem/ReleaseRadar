import { writeFile, mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createInvestigation } from "../src/server/agent.js";
import { getReport } from "../src/server/history.js";
import { closeDatabase } from "../src/server/db.js";
import type { Revision } from "../src/shared/schema.js";
const scenarios: {
  candidate: Revision;
  verdict: string;
  services: string[];
}[] = [
  {
    candidate: "breaking",
    verdict: "blocked",
    services: ["identity", "orders", "checkout"],
  },
  { candidate: "fixed", verdict: "checks-passed", services: [] },
  { candidate: "additive", verdict: "checks-passed", services: [] },
  {
    candidate: "type-change",
    verdict: "blocked",
    services: ["identity", "orders", "checkout"],
  },
  {
    candidate: "incomplete",
    verdict: "blocked",
    services: ["identity", "orders", "checkout"],
  },
  { candidate: "unrelated", verdict: "checks-passed", services: [] },
];
const results = [];
try {
  for (const scenario of scenarios) {
    const started = Date.now();
    const pending = await createInvestigation({
      baseline: "baseline",
      candidate: scenario.candidate,
      mode: "guided",
      autoVerify: true,
      question: "Evaluate this release against the declared dependency graph.",
    });
    let report = await getReport(pending.id);
    while (report?.status === "running" && Date.now() - started < 120000) {
      await delay(150);
      report = await getReport(pending.id);
    }
    const actual = [
      ...new Set(report?.findings.map((f) => f.serviceId) ?? []),
    ].sort();
    const correct =
      report?.verdict === scenario.verdict &&
      JSON.stringify(actual) === JSON.stringify([...scenario.services].sort());
    results.push({
      scenario: scenario.candidate,
      correct,
      expected: scenario,
      actual: { verdict: report?.verdict, services: actual },
      durationMs: Date.now() - started,
      reportId: pending.id,
      error: report?.error,
    });
    console.log(
      `${correct ? "PASS" : "FAIL"} ${scenario.candidate}: ${report?.verdict} (${Date.now() - started}ms)`,
    );
  }
  await mkdir("evaluations/results", { recursive: true });
  await writeFile(
    "evaluations/results/latest.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: "guided",
        note: "Synthetic fixture evaluation. This does not compare against a retrieval baseline or establish general-repository accuracy.",
        passed: results.filter((r) => r.correct).length,
        total: results.length,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  if (results.some((r) => !r.correct)) process.exitCode = 1;
} finally {
  await closeDatabase();
}
