import type {
  Report,
  Revision,
  Source,
  GraphNode,
  GraphEdge,
} from "../shared/schema.js";
export type RevisionOption = {
  id: Revision;
  label: string;
  description: string;
  complete: boolean;
};
export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Source[];
  candidateSources: Source[];
  snapshot: string;
  candidateSnapshot: string;
};
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result === "object" && result !== null && "error" in result
        ? String(result.error)
        : `Request failed (${response.status})`,
    );
  return result as T;
}
export function downloadReport(report: Report) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `release-radar-${report.candidate}-${report.id.slice(0, 8)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
