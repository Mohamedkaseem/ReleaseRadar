import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDatabase, health } from "./db.js";
import { recoverInterrupted } from "./history.js";
const app = await buildApp();
try {
  await health();
  await recoverInterrupted();
} catch {
  app.log.warn(
    "FalkorDB is unavailable. Start it with npm run db:up; health checks will show the outage.",
  );
}
await app.listen({ host: config.HOST, port: config.PORT });
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app
      .close()
      .then(closeDatabase)
      .then(() => process.exit(0));
  });
