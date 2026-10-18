import type { Change, Manifest, Report } from "../shared/schema.js";
export function compareContracts(
  base: Manifest,
  candidate: Manifest,
): Change[] {
  const changes: Change[] = [];
  for (const endpoint of base.endpoints) {
    const next = candidate.endpoints.find((e) => e.id === endpoint.id);
    if (!next) {
      changes.push({
        id: `${endpoint.id}:endpoint-removed`,
        endpointId: endpoint.id,
        serviceId: endpoint.serviceId,
        field: "*",
        kind: "endpoint-removed",
        before: `${endpoint.method} ${endpoint.route}`,
        sourceId: `${endpoint.id}`,
      });
      continue;
    }
    for (const field of endpoint.fields) {
      const after = next.fields.find((f) => f.name === field.name);
      if (!after)
        changes.push({
          id: `${endpoint.id}.${field.name}:removed`,
          endpointId: endpoint.id,
          serviceId: endpoint.serviceId,
          field: field.name,
          kind: "removed",
          before: field.type,
          sourceId: `${endpoint.id}.${field.name}`,
        });
      else if (after.type !== field.type)
        changes.push({
          id: `${endpoint.id}.${field.name}:type-changed`,
          endpointId: endpoint.id,
          serviceId: endpoint.serviceId,
          field: field.name,
          kind: "type-changed",
          before: field.type,
          after: after.type,
          sourceId: `${endpoint.id}.${field.name}`,
        });
    }
    for (const field of next.fields)
      if (!endpoint.fields.some((f) => f.name === field.name))
        changes.push({
          id: `${endpoint.id}.${field.name}:added`,
          endpointId: endpoint.id,
          serviceId: endpoint.serviceId,
          field: field.name,
          kind: "added",
          after: field.type,
          sourceId: `${endpoint.id}.${field.name}`,
        });
  }
  return changes;
}
export function updateVerdict(report: Report) {
  const relevant = new Set(report.findings.flatMap((f) => f.testIds));
  const latest = (id: string) =>
    report.tests
      .filter((t) => t.testId === id && t.revision === report.candidate)
      .at(-1);
  for (const finding of report.findings) {
    const results = finding.testIds.map(latest);
    finding.state = results.some((r) => r?.status === "failed")
      ? "confirmed"
      : results.length > 0 && results.every((r) => r?.status === "passed")
        ? "not-reproduced"
        : finding.testIds.length === 0
          ? "unresolved"
          : "potential";
  }
  if ([...relevant].some((id) => latest(id)?.status === "failed"))
    report.verdict = "blocked";
  else if (
    report.warnings.length ||
    report.findings.some((f) => !f.testIds.length) ||
    [...relevant].some((id) => latest(id)?.status !== "passed")
  )
    report.verdict = "needs-verification";
  else report.verdict = "checks-passed";
  const impacts = report.findings.length;
  report.summary =
    report.verdict === "blocked"
      ? `Release blocked: executable verification failed for ${report.tests.filter((t) => t.status === "failed").length} check(s). Inspect the dependency evidence and test output.`
      : report.verdict === "needs-verification"
        ? `Investigation needs verification. ${impacts} potential impact(s) and ${report.warnings.length} scope warning(s) remain.`
        : `Required checks passed within the declared dependency scope. ${impacts} potential impact(s) investigated. This is not a guarantee of release safety.`;
}
