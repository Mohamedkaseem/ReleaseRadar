import { randomUUID } from "node:crypto";
import type { InvestigationInput, Report } from "../shared/schema.js";
import { compareContracts, updateVerdict } from "./analyzer.js";
import { importSnapshot, readSnapshot, type Snapshot } from "./repository.js";
import { event, executeTool, requiredTests, type Context } from "./tools.js";
import { saveReport, getReport } from "./history.js";
import { runModel } from "./model.js";
const active = new Set<string>();
export function isActive(id: string) {
  return active.has(id);
}
export async function createInvestigation(
  input: InvestigationInput,
): Promise<Report> {
  const now = new Date().toISOString();
  const report: Report = {
    id: randomUUID(),
    ...input,
    status: "running",
    verdict: "investigating",
    createdAt: now,
    updatedAt: now,
    changes: [],
    findings: [],
    tests: [],
    events: [],
    warnings: [],
    summary: "Importing snapshot evidence into FalkorDB.",
  };
  await saveReport(report);
  active.add(report.id);
  void investigate(report, input.autoVerify).finally(() =>
    active.delete(report.id),
  );
  return report;
}
async function investigate(report: Report, autoVerify: boolean) {
  try {
    const [baseline, candidate] = await Promise.all([
      importSnapshot(report.baseline),
      importSnapshot(report.candidate),
    ]);
    report.baselineGraph = baseline.name;
    report.candidateGraph = candidate.name;
    const ctx: Context = {
      report,
      baseline,
      candidate,
      inspected: new Set(),
      started: Date.now(),
      calls: 0,
    };
    report.changes = compareContracts(baseline.manifest, candidate.manifest);
    if (!baseline.manifest.complete || !candidate.manifest.complete)
      report.warnings.push(
        "Dependency declarations are marked incomplete. Missing consumers cannot be ruled out.",
      );
    if (report.baseline !== "baseline")
      report.warnings.push(
        "Custom baseline selected. Findings reflect only its declared dependencies and contracts.",
      );
    await event(
      ctx,
      "import_snapshots",
      `Imported ${baseline.nodes.length + candidate.nodes.length} nodes and ${baseline.edges.length + candidate.edges.length} relationships. Baseline dependency evidence is preserved.`,
    );
    await event(
      ctx,
      "get_release_changes",
      `Detected ${report.changes.length} supported contract change(s).`,
    );
    if (report.mode === "model") await runModel(ctx, autoVerify);
    else {
      for (const change of report.changes)
        await executeTool(ctx, "inspect_change", { changeId: change.id });
      await executeTool(ctx, "get_history", {});
      const tests = await requiredTests(ctx);
      report.plannedTests = tests;
      await event(
        ctx,
        "get_verification_plan",
        `Selected ${tests.length} graph-backed verification check(s).`,
      );
      if (autoVerify)
        for (const testId of tests)
          await executeTool(ctx, "run_test", { testId });
    }
    if (report.changes.some((c) => !ctx.inspected.has(c.id)))
      report.warnings.push(
        "Some contract changes were not inspected. Investigation is incomplete.",
      );
    const required = await requiredTests(ctx);
    report.plannedTests = required;
    for (const testId of required)
      if (
        !report.tests.some(
          (t) =>
            t.testId === testId &&
            t.status === "passed" &&
            t.revision === report.candidate,
        ) &&
        !report.findings.some((f) => f.testIds.includes(testId))
      )
        report.warnings.push(`Smoke verification ${testId} has not passed.`);
    report.status = "completed";
    updateVerdict(report);
    await event(
      ctx,
      "save_release_report",
      "Saved the report, source evidence references, and execution outcomes to FalkorDB.",
    );
  } catch (error) {
    report.status = "error";
    report.warnings.push(
      "Investigation did not finish; additional verification may be required.",
    );
    updateVerdict(report);
    report.error = error instanceof Error ? error.message : String(error);
    report.summary =
      "Investigation stopped. Completed evidence and test results are preserved.";
    report.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      tool: "investigation",
      message: report.error,
      status: "error",
    });
  }
  try {
    await saveReport(report);
  } catch (error) {
    console.error(
      "Could not persist investigation:",
      error instanceof Error ? error.message : error,
    );
  }
}
export async function getReportGraph(
  report: Report,
): Promise<{ baseline: Snapshot; candidate: Snapshot }> {
  return {
    baseline: report.baselineGraph
      ? await readSnapshot(report.baselineGraph)
      : await importSnapshot(report.baseline),
    candidate: report.candidateGraph
      ? await readSnapshot(report.candidateGraph)
      : await importSnapshot(report.candidate),
  };
}
export async function verifyExisting(
  id: string,
  testId: string,
): Promise<Report> {
  if (active.has(id)) throw new Error("Investigation is already active");
  active.add(id);
  try {
    const report = await getReport(id);
    if (!report) throw new Error("Investigation not found");
    const { baseline, candidate } = await getReportGraph(report);
    const ctx: Context = {
      report,
      baseline,
      candidate,
      inspected: new Set(),
      started: Date.now(),
      calls: 0,
    };
    await executeTool(ctx, "run_test", { testId });
    updateVerdict(report);
    await saveReport(report);
    return report;
  } finally {
    active.delete(id);
  }
}
