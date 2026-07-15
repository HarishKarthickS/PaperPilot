import { createServer } from "node:http";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createSocketServer } from "./socket/server.js";

async function startServer() {
  await connectDatabase();
  const server = createServer(createApp());
  createSocketServer(server);
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, "PaperPilot API listening"));
}

startServer().catch((error) => {
  logger.fatal(error, "API failed to start");
  process.exit(1);
});
