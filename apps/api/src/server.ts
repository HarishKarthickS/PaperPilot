import { createServer } from "node:http";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env, ragEnabled } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createSocketServer } from "./socket/server.js";

async function startServer() {
  await connectDatabase();
  if (ragEnabled()) {
    const { ensureRagSchema } = await import("./services/rag/db.js");
    await ensureRagSchema();
  }
  const server = createServer(createApp());
  createSocketServer(server);
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, "PaperPilot API listening"));
}

startServer().catch((error) => {
  logger.fatal(error, "API failed to start");
  process.exit(1);
});
