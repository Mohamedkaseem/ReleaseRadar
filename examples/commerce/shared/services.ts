import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Revision } from "../../../src/shared/schema.js";
type Customer = { customerId?: unknown; id?: unknown; [key: string]: unknown };
async function serve(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind");
  return { server, url: `http://127.0.0.1:${address.port}` };
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
export async function startCommerce(input: string) {
  const revision = Revision.parse(input);
  const { customer } = (await import(
    pathToFileURL(
      resolve(`examples/commerce/scenarios/${revision}/identity.ts`),
    ).href
  )) as { customer: Customer };
  const identity = await serve((_req, res) => send(res, 200, customer));
  const orders = await serve((_req, res) => {
    void (async () => {
      const response = await fetch(`${identity.url}/customers/demo`);
      const account: unknown = await response.json();
      const customerId =
        typeof account === "object" &&
        account !== null &&
        "customerId" in account
          ? account.customerId
          : undefined;
      if (typeof customerId !== "string" || !customerId) {
        send(res, 502, {
          error:
            "Identity contract violation: customerId must be a non-empty string",
        });
        return;
      }
      send(res, 200, { orderId: "order-demo", customerId });
    })().catch(() => send(res, 502, { error: "Identity request failed" }));
  });
  const checkout = await serve((_req, res) => {
    void (async () => {
      const response = await fetch(`${orders.url}/orders`);
      const order: unknown = await response.json();
      if (!response.ok) {
        send(res, 502, { error: "Checkout blocked by Orders", cause: order });
        return;
      }
      send(res, 200, { status: "complete", order });
    })().catch(() => send(res, 502, { error: "Orders request failed" }));
  });
  return {
    identity: identity.url,
    checkout: checkout.url,
    async close() {
      await Promise.all(
        [checkout.server, orders.server, identity.server].map(
          (server) =>
            new Promise<void>((resolveClose, reject) => {
              server.closeAllConnections();
              server.close((error) => (error ? reject(error) : resolveClose()));
            }),
        ),
      );
    },
  };
}
