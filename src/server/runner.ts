import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Revision, TestRun } from "../shared/schema.js";
const ROOT = resolve(import.meta.dirname, "../..");
export async function runTest(
  revision: Revision,
  testId: string,
): Promise<TestRun> {
  if (!["checkout", "identity-contract"].includes(testId))
    throw new Error("Unsupported test ID");
  const start = Date.now();
  const result: TestRun = {
    id: randomUUID(),
    testId,
    revision,
    status: "running",
    startedAt: new Date(start).toISOString(),
    output: "",
  };
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(ROOT, "examples/commerce/verify.ts"),
        revision,
        testId,
      ],
      {
        cwd: ROOT,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          NODE_ENV: "test",
        },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 15000);
    function append(chunk: Buffer) {
      if (result.output.length < 24000)
        result.output = (result.output + chunk.toString()).slice(0, 24000);
    }
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => {
      clearTimeout(timeout);
      result.status = "error";
      result.output = error.message;
      result.finishedAt = new Date().toISOString();
      resolveRun(result);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      result.status = timedOut
        ? "error"
        : code === 0
          ? "passed"
          : code === 1
            ? "failed"
            : "error";
      if (timedOut)
        result.output += "\nVerification timed out after 15 seconds.";
      result.finishedAt = new Date().toISOString();
      result.durationMs = Date.now() - start;
      resolveRun(result);
    });
  });
}
