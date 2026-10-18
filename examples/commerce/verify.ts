import assert from "node:assert/strict";
import { startCommerce } from "./shared/services.js";
const [revision, testId] = process.argv.slice(2);
if (!revision || !["checkout", "identity-contract"].includes(testId ?? ""))
  throw new Error("Unsupported verification request");
const app = await startCommerce(revision);
try {
  if (testId === "checkout") {
    const response = await fetch(`${app.checkout}/checkout`);
    const body: unknown = await response.json();
    console.log(
      `GET /checkout -> ${response.status}\n${JSON.stringify(body, null, 2)}`,
    );
    assert.equal(
      response.status,
      200,
      "Checkout must succeed across Identity → Orders → Checkout",
    );
  } else {
    const response = await fetch(`${app.identity}/customers/demo`);
    const body: unknown = await response.json();
    console.log(
      `GET /customers/demo -> ${response.status}\n${JSON.stringify(body, null, 2)}`,
    );
    assert.ok(
      typeof body === "object" &&
        body !== null &&
        "customerId" in body &&
        typeof body.customerId === "string",
      "Identity must preserve the customerId string contract",
    );
  }
  console.log(
    "PASS: expected behavior verified against running HTTP services.",
  );
} catch (error) {
  console.error(
    `FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
