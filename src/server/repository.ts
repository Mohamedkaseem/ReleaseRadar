import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import {
  ManifestSchema,
  Revision,
  revisions,
  type Manifest,
  type Source,
  type GraphNode,
  type GraphEdge,
} from "../shared/schema.js";
import { query } from "./db.js";
export const projectRoot = resolve(import.meta.dirname, "../..");
const ROOT = projectRoot;
export const graphName = (revision: Revision, hash: string) =>
  `rr_${revision.replaceAll("-", "_")}_${hash}`;
export async function loadManifest(revision: Revision): Promise<Manifest> {
  const manifest = ManifestSchema.parse(
    JSON.parse(
      await readFile(
        resolve(
          ROOT,
          `examples/commerce/scenarios/${Revision.parse(revision)}/snapshot.json`,
        ),
        "utf8",
      ),
    ),
  );
  if (manifest.revision !== revision)
    throw new Error("Snapshot identity mismatch");
  const ids = new Set(manifest.services.map((s) => s.id));
  if (ids.size !== manifest.services.length)
    throw new Error("Duplicate service IDs");
  const endpointIds = new Set(manifest.endpoints.map((e) => e.id));
  if (endpointIds.size !== manifest.endpoints.length)
    throw new Error("Duplicate endpoint IDs");
  for (const endpoint of manifest.endpoints)
    if (!ids.has(endpoint.serviceId))
      throw new Error("Unknown endpoint service");
  for (const dependency of manifest.dependencies) {
    const endpoint = manifest.endpoints.find(
      (e) => e.id === dependency.endpointId,
    );
    if (
      !ids.has(dependency.caller) ||
      !ids.has(dependency.provider) ||
      endpoint?.serviceId !== dependency.provider
    )
      throw new Error("Invalid dependency reference");
  }
  for (const workflow of manifest.workflows)
    for (const id of workflow.services)
      if (!ids.has(id)) throw new Error("Unknown workflow service");
  for (const test of manifest.tests)
    if (!manifest.workflows.some((w) => w.id === test.workflowId))
      throw new Error("Unknown test workflow");
  return manifest;
}
export async function readSource(path: string) {
  const full = resolve(ROOT, path);
  const rel = relative(ROOT, full);
  if (rel.startsWith("..") || !rel.startsWith("examples/commerce/"))
    throw new Error("Source path outside bundled sample");
  return readFile(full, "utf8");
}
export type Snapshot = {
  revision: Revision;
  manifest: Manifest;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Source[];
  hash: string;
};
const imports = new Map<string, Promise<Snapshot>>();
export async function buildSnapshot(revision: Revision): Promise<Snapshot> {
  const manifest = await loadManifest(revision);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const sources: Source[] = [];
  const sourceFiles = new Map<string, string>();
  async function source(path: string, needle?: string) {
    let text = sourceFiles.get(path);
    if (text === undefined) {
      text = await readSource(path);
      sourceFiles.set(path, text);
    }
    const lines = text.split("\n");
    const found = needle ? lines.findIndex((line) => line.includes(needle)) : 0;
    if (needle && found < 0)
      throw new Error(`Evidence anchor not found in ${path}: ${needle}`);
    const start = Math.max(0, found);
    const id = `source:${path}:${start + 1}`;
    if (!sources.some((s) => s.id === id))
      sources.push({
        id,
        path,
        line: start + 1,
        excerpt: lines.slice(start, start + 7).join("\n"),
        revision,
      });
    return id;
  }
  function node(
    id: string,
    kind: string,
    name: string,
    metadata: Record<string, unknown>,
    sourceId?: string,
  ) {
    nodes.push({ id, kind, name, metadata, sourceId });
  }
  function edge(from: string, to: string, kind: string, sourceId?: string) {
    const id = `${from}:${kind}:${to}`;
    if (!edges.some((e) => e.id === id))
      edges.push({ id, source: from, target: to, kind, sourceId });
  }
  const manifestPath = `examples/commerce/scenarios/${revision}/snapshot.json`;
  for (const service of manifest.services) {
    const src = await source(
      service.source,
      service.id === "orders"
        ? "const customerId"
        : service.id === "checkout"
          ? "const checkout"
          : "const identity",
    );
    node(
      service.id,
      "Service",
      service.name,
      { criticality: service.criticality },
      src,
    );
    const teamId = `team:${service.team}`;
    if (!nodes.some((n) => n.id === teamId))
      node(
        teamId,
        "Team",
        service.team,
        {},
        await source(manifestPath, `"team": "${service.team}"`),
      );
    edge(
      teamId,
      service.id,
      "OWNS",
      await source(manifestPath, `"team": "${service.team}"`),
    );
  }
  for (const endpoint of manifest.endpoints) {
    const src = await source(manifestPath, `"id": "${endpoint.id}"`);
    node(
      endpoint.id,
      "Endpoint",
      `${endpoint.method} ${endpoint.route}`,
      { serviceId: endpoint.serviceId },
      src,
    );
    edge(endpoint.serviceId, endpoint.id, "EXPOSES", src);
    for (const field of endpoint.fields) {
      const id = `${endpoint.id}.${field.name}`;
      const fieldSource = await source(manifestPath, `"name": "${field.name}"`);
      node(
        id,
        "Field",
        field.name,
        { ...field, endpointId: endpoint.id },
        fieldSource,
      );
      edge(endpoint.id, id, "RETURNS", fieldSource);
    }
  }
  for (const dependency of manifest.dependencies) {
    const src = await source(
      dependency.source,
      dependency.caller === "orders"
        ? "const customerId"
        : "const response = await fetch(`${orders.url}",
    );
    edge(dependency.caller, dependency.provider, "DEPENDS_ON", src);
    edge(dependency.caller, dependency.endpointId, "CALLS", src);
    for (const field of dependency.fields) {
      const id = `${dependency.endpointId}.${field}`;
      if (nodes.some((n) => n.id === id))
        edge(dependency.caller, id, "CONSUMES", src);
    }
  }
  for (const workflow of manifest.workflows) {
    const src = await source(manifestPath, `"id": "${workflow.id}"`);
    node(workflow.id, "Workflow", workflow.name, {}, src);
    for (const service of workflow.services)
      edge(workflow.id, service, "USES", src);
  }
  for (const test of manifest.tests) {
    const id = `test:${test.id}`;
    const src = await source(
      "examples/commerce/verify.ts",
      test.id === "checkout" ? "if (testId ===" : "Identity must preserve",
    );
    node(id, "Test", test.name, { runnerId: test.id }, src);
    edge(id, test.workflowId, "VERIFIES", src);
  }
  for (const src of sources)
    node(src.id, "Source", `${src.path}:${src.line}`, {
      ...src,
      contentHash: createHash("sha256")
        .update(sourceFiles.get(src.path) ?? "")
        .digest("hex"),
    });
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        manifest,
        files: [...sourceFiles],
        extractorVersion: 2,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    revision,
    manifest,
    name: graphName(revision, hash),
    nodes,
    edges,
    sources,
    hash,
  };
}
export async function importSnapshot(revision: Revision): Promise<Snapshot> {
  const snapshot = await buildSnapshot(revision);
  const current = imports.get(snapshot.name);
  if (current) return current;
  const task = (async () => {
    const ready = await query(
      snapshot.name,
      "MATCH (s:Snapshot {id: $id}) RETURN s.ready AS ready,s.manifest AS manifest",
      { id: snapshot.hash },
    );
    if (ready[0]?.ready === true && typeof ready[0]?.manifest === "string")
      return snapshot;
    for (const kind of [
      "Service",
      "Endpoint",
      "Field",
      "Workflow",
      "Test",
      "Team",
      "Source",
    ]) {
      const list = snapshot.nodes
        .filter((n) => n.kind === kind)
        .map((n) => ({
          id: n.id,
          kind: n.kind,
          name: n.name,
          sourceId: n.sourceId ?? "",
          metadata: JSON.stringify(n.metadata),
        }));
      if (list.length)
        await query(
          snapshot.name,
          `UNWIND $items AS item MERGE (n:Entity:${kind} {id:item.id}) SET n.kind=item.kind,n.name=item.name,n.sourceId=item.sourceId,n.metadata=item.metadata`,
          { items: list },
        );
    }
    for (const kind of [
      "OWNS",
      "EXPOSES",
      "RETURNS",
      "DEPENDS_ON",
      "CALLS",
      "CONSUMES",
      "USES",
      "VERIFIES",
    ]) {
      const items = snapshot.edges
        .filter((e) => e.kind === kind)
        .map((e) => ({
          source: e.source,
          target: e.target,
          id: e.id,
          sourceId: e.sourceId ?? "",
        }));
      if (items.length)
        await query(
          snapshot.name,
          `UNWIND $items AS item MATCH (a:Entity {id:item.source}),(b:Entity {id:item.target}) MERGE (a)-[r:${kind}]->(b) SET r.id=item.id,r.sourceId=item.sourceId`,
          { items },
        );
    }
    await query(
      snapshot.name,
      "MERGE (s:Snapshot {id:$id}) SET s.ready=true,s.revision=$revision,s.manifest=$manifest RETURN s.id AS id",
      {
        id: snapshot.hash,
        revision,
        manifest: JSON.stringify(snapshot.manifest),
      },
    );
    return snapshot;
  })();
  imports.set(snapshot.name, task);
  try {
    return await task;
  } finally {
    imports.delete(snapshot.name);
  }
}
export async function listRevisions() {
  return Promise.all(
    revisions.map(async (revision) => {
      const m = await loadManifest(revision);
      return {
        id: revision,
        label: m.label,
        description: m.description,
        complete: m.complete,
      };
    }),
  );
}

/** Read the evidence actually stored for a completed run, without rebuilding from mutable files. */
export async function readSnapshot(name: string): Promise<Snapshot> {
  if (!/^rr_[a-z0-9_]+$/.test(name))
    throw new Error("Invalid snapshot graph reference");
  const metadata = await query(
    name,
    "MATCH (s:Snapshot) WHERE s.ready=true RETURN s.id AS hash,s.revision AS revision,s.manifest AS manifest LIMIT 1",
  );
  if (!metadata[0] || typeof metadata[0].manifest !== "string")
    throw new Error("Immutable snapshot metadata not found");
  const manifest = ManifestSchema.parse(JSON.parse(metadata[0].manifest));
  const nodeRows = await query(
    name,
    "MATCH (n:Entity) RETURN n.id AS id,n.kind AS kind,n.name AS name,n.sourceId AS sourceId,n.metadata AS metadata",
  );
  const edgeRows = await query(
    name,
    "MATCH (a:Entity)-[r]->(b:Entity) RETURN r.id AS id,a.id AS source,b.id AS target,type(r) AS kind,r.sourceId AS sourceId",
  );
  const nodes: GraphNode[] = nodeRows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    name: String(row.name),
    sourceId: row.sourceId ? String(row.sourceId) : undefined,
    metadata: JSON.parse(String(row.metadata)) as Record<string, unknown>,
  }));
  const edges: GraphEdge[] = edgeRows.map((row) => ({
    id: String(row.id),
    source: String(row.source),
    target: String(row.target),
    kind: String(row.kind),
    sourceId: row.sourceId ? String(row.sourceId) : undefined,
  }));
  const sources: Source[] = nodes
    .filter((n) => n.kind === "Source")
    .map((n) => ({
      id: n.id,
      path: String(n.metadata.path),
      line: Number(n.metadata.line),
      excerpt: String(n.metadata.excerpt),
      revision: Revision.parse(n.metadata.revision),
    }));
  return {
    name,
    hash: String(metadata[0].hash),
    revision: manifest.revision,
    manifest,
    nodes,
    edges,
    sources,
  };
}
