import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import { InvestigationInput } from "../shared/schema.js";
import { health } from "./db.js";
import { listRevisions } from "./repository.js";
import { getReport, listReports } from "./history.js";
import {
  createInvestigation,
  getReportGraph,
  isActive,
  verifyExisting,
} from "./agent.js";
import { modelConfigured } from "./config.js";
const ROOT = resolve(import.meta.dirname, "../..");
export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 16000 });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: error.issues.map((i) => i.message).join("; ") });
    const e = error as Error;
    req.log.error(e);
    const message = e.message ?? "Request failed";
    return reply
      .code(
        message.includes("already active")
          ? 409
          : message.includes("not found")
            ? 404
            : 503,
      )
      .send({ error: message });
  });
  app.get("/api/health", async (_req, reply) => {
    try {
      await health();
      return { ok: true, database: "connected", modelConfigured };
    } catch {
      return reply.code(503).send({
        ok: false,
        database: "unavailable",
        modelConfigured,
        error:
          "FalkorDB unavailable. Start it with npm run db:up. No impact results are substituted.",
      });
    }
  });
  app.get("/api/revisions", async () => ({ revisions: await listRevisions() }));
  app.get("/api/investigations", async () => ({
    reports: await listReports(),
  }));
  app.post("/api/investigations", async (req, reply) => {
    const input = InvestigationInput.parse(req.body);
    if (input.mode === "model" && !modelConfigured)
      return reply.code(400).send({
        error: "Configure LLM_BASE_URL and LLM_MODEL before using model mode.",
      });
    const running = (await listReports()).filter((r) => isActive(r.id));
    if (running.length >= 2)
      return reply.code(429).send({
        error:
          "Two investigations are already running. Wait for one to finish.",
      });
    return reply.code(202).send(await createInvestigation(input));
  });
  const params = z.object({ id: z.string().uuid() });
  app.get("/api/investigations/:id", async (req) => {
    const { id } = params.parse(req.params);
    const report = await getReport(id);
    if (!report) throw new Error("Investigation not found");
    return report;
  });
  app.get("/api/investigations/:id/graph", async (req) => {
    const { id } = params.parse(req.params);
    const report = await getReport(id);
    if (!report) throw new Error("Investigation not found");
    const { baseline, candidate } = await getReportGraph(report);
    return {
      nodes: baseline.nodes.filter((n) => n.kind !== "Source"),
      edges: baseline.edges,
      sources: baseline.sources,
      candidateSources: candidate.sources,
      snapshot: baseline.hash,
      candidateSnapshot: candidate.hash,
    };
  });
  app.post("/api/investigations/:id/test-runs", async (req) => {
    const { id } = params.parse(req.params);
    const body = z
      .object({ testId: z.enum(["checkout", "identity-contract"]) })
      .parse(req.body);
    return verifyExisting(id, body.testId);
  });
  app.get("/api/investigations/:id/events", async (req, reply) => {
    const { id } = params.parse(req.params);
    const report = await getReport(id);
    if (!report) throw new Error("Investigation not found");
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.hijack();
    reply.raw.write(`data: ${JSON.stringify(report)}\n\n`);
    let last = report.updatedAt;
    const timer = setInterval(() => {
      void getReport(id)
        .then((current) => {
          if (current && current.updatedAt !== last) {
            reply.raw.write(`data: ${JSON.stringify(current)}\n\n`);
            last = current.updatedAt;
          }
          if (current && current.status !== "running") {
            clearInterval(timer);
            reply.raw.end();
          }
        })
        .catch(() => {
          clearInterval(timer);
          reply.raw.end();
        });
    }, 700);
    reply.raw.on("close", () => clearInterval(timer));
  });
  if (existsSync(resolve(ROOT, "dist/index.html"))) {
    await app.register(fastifyStatic, { root: resolve(ROOT, "dist") });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Route not found" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
