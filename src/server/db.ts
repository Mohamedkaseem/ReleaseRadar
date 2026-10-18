import { createConnection } from "node:net";
import { FalkorDB } from "falkordb";
import { config } from "./config.js";
let client: Awaited<ReturnType<typeof FalkorDB.connect>> | undefined;
let connecting:
  | Promise<Awaited<ReturnType<typeof FalkorDB.connect>>>
  | undefined;
export async function database() {
  if (client) return client;
  if (!connecting)
    connecting = (async () => {
      await new Promise<void>((resolveProbe, rejectProbe) => {
        const probe = createConnection({
          host: config.FALKORDB_HOST,
          port: config.FALKORDB_PORT,
        });
        probe.setTimeout(2000);
        probe.once("connect", () => {
          probe.destroy();
          resolveProbe();
        });
        probe.once("error", () => {
          probe.destroy();
          rejectProbe(new Error("FalkorDB is not reachable"));
        });
        probe.once("timeout", () => {
          probe.destroy();
          rejectProbe(new Error("FalkorDB connection timed out"));
        });
      });
      const socket = {
        host: config.FALKORDB_HOST,
        port: config.FALKORDB_PORT,
        connectTimeout: 3000,
        reconnectStrategy: false as const,
      };
      const value = await FalkorDB.connect({
        socket,
        password: config.FALKORDB_PASSWORD,
      });
      value.on("error", () => {
        client = undefined;
      });
      client = value;
      return value;
    })().finally(() => {
      connecting = undefined;
    });
  return connecting;
}
export async function query(
  graphName: string,
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const db = await database();
  const result = await db
    .selectGraph(graphName)
    .query(cypher, { params: params as never, TIMEOUT: 5000 });
  const raw: unknown = result.data;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("Unexpected FalkorDB result format");
  return raw as Record<string, unknown>[];
}
export async function closeDatabase() {
  if (client) {
    await client.close();
    client = undefined;
  }
}
export async function health() {
  await query("rr_health", "RETURN 1 AS ok");
}
