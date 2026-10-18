import { z } from "zod";
export const revisions = [
  "baseline",
  "breaking",
  "fixed",
  "additive",
  "type-change",
  "unrelated",
  "incomplete",
  "cycle",
] as const;
export const Revision = z.enum(revisions);
export type Revision = z.infer<typeof Revision>;
export const SourceSchema = z.object({
  id: z.string(),
  path: z.string(),
  line: z.number().int().positive(),
  excerpt: z.string(),
  revision: Revision,
});
export type Source = z.infer<typeof SourceSchema>;
export const FieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean(),
});
export const ManifestSchema = z.object({
  revision: Revision,
  label: z.string(),
  description: z.string(),
  complete: z.boolean(),
  services: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      team: z.string(),
      criticality: z.enum(["high", "normal"]),
      source: z.string(),
    }),
  ),
  endpoints: z.array(
    z.object({
      id: z.string(),
      serviceId: z.string(),
      method: z.string(),
      route: z.string(),
      fields: z.array(FieldSchema),
    }),
  ),
  dependencies: z.array(
    z.object({
      caller: z.string(),
      provider: z.string(),
      endpointId: z.string(),
      fields: z.array(z.string()),
      source: z.string(),
    }),
  ),
  workflows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      services: z.array(z.string()),
    }),
  ),
  tests: z.array(
    z.object({
      id: z.enum(["checkout", "identity-contract"]),
      name: z.string(),
      workflowId: z.string(),
    }),
  ),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export type Change = {
  id: string;
  endpointId: string;
  serviceId: string;
  field: string;
  kind: "removed" | "type-changed" | "added" | "endpoint-removed";
  before?: string;
  after?: string;
  sourceId: string;
};
export type GraphNode = {
  id: string;
  kind: string;
  name: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  sourceId?: string;
};
export type Impact = {
  serviceId: string;
  service: string;
  path: string[];
  sourceIds: string[];
  workflowIds: string[];
};
export type Finding = {
  id: string;
  changeId: string;
  serviceId: string;
  title: string;
  state: "potential" | "confirmed" | "not-reproduced" | "unresolved";
  paths: string[][];
  sourceIds: string[];
  testIds: string[];
  explanation: string;
};
export type TestRun = {
  id: string;
  testId: string;
  revision: Revision;
  status: "running" | "passed" | "failed" | "error" | "interrupted";
  startedAt: string;
  finishedAt?: string;
  output: string;
  durationMs?: number;
};
export type Event = {
  id: string;
  at: string;
  tool: string;
  message: string;
  status: "running" | "done" | "error";
};
export type Report = {
  id: string;
  baseline: Revision;
  candidate: Revision;
  question: string;
  mode: "guided" | "model";
  status: "running" | "completed" | "error" | "interrupted";
  verdict: "investigating" | "blocked" | "needs-verification" | "checks-passed";
  createdAt: string;
  updatedAt: string;
  changes: Change[];
  findings: Finding[];
  tests: TestRun[];
  events: Event[];
  warnings: string[];
  plannedTests?: string[];
  summary: string;
  error?: string;
  modelNote?: string;
  baselineGraph?: string;
  candidateGraph?: string;
};
export const InvestigationInput = z
  .object({
    baseline: Revision.default("baseline"),
    candidate: Revision,
    question: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .default(
        "Can we ship this release? Investigate downstream impact and verify the relevant workflows.",
      ),
    mode: z.enum(["guided", "model"]).default("guided"),
    autoVerify: z.boolean().default(true),
  })
  .refine((v) => v.baseline !== v.candidate, {
    message: "Choose two different revisions.",
  });
export type InvestigationInput = z.infer<typeof InvestigationInput>;
