import type { Report } from "../shared/schema.js";
import { query } from "./db.js";
const GRAPH = process.env.RR_HISTORY_GRAPH ?? "rr_investigations_v1";
if (!/^rr_[a-z0-9_]+$/.test(GRAPH))
  throw new Error("Invalid investigation graph name");
export async function saveReport(report: Report) {
  report.updatedAt = new Date().toISOString();
  await query(
    GRAPH,
    "MERGE (r:Investigation {id:$id}) SET r.json=$json,r.updatedAt=$updatedAt,r.status=$status RETURN r.id AS id",
    {
      id: report.id,
      json: JSON.stringify(report),
      updatedAt: report.updatedAt,
      status: report.status,
    },
  );
}
export async function getReport(id: string): Promise<Report | undefined> {
  const rows = await query(
    GRAPH,
    "MATCH (r:Investigation {id:$id}) RETURN r.json AS json",
    { id },
  );
  return rows[0] ? (JSON.parse(String(rows[0].json)) as Report) : undefined;
}
export async function listReports(): Promise<Report[]> {
  const rows = await query(
    GRAPH,
    "MATCH (r:Investigation) RETURN r.json AS json ORDER BY r.updatedAt DESC LIMIT 40",
  );
  return rows.map((row) => JSON.parse(String(row.json)) as Report);
}
export async function recoverInterrupted() {
  for (const report of await listReports())
    if (
      report.status === "running" ||
      report.tests.some((t) => t.status === "running")
    ) {
      report.status = "interrupted";
      report.verdict = "needs-verification";
      report.warnings.push(
        "Application restarted before this run completed. Start a new investigation to finish.",
      );
      for (const t of report.tests)
        if (t.status === "running") t.status = "interrupted";
      await saveReport(report);
    }
}
