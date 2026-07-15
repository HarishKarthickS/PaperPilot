import express from "express";
import { connectDatabase } from "./config/database.js";
import { logger } from "./config/logger.js";
import { startWorkers } from "./workers/processors.js";

async function startWorkerProcess() {
  await connectDatabase();
  const workers = startWorkers();
  logger.info({ count: workers.length }, "PaperPilot workers listening");

  // Start a lightweight HTTP server so Render's free Web Service tier doesn't kill the container
  // and so you can ping it to prevent cold starts.
  const app = express();
  app.get("/health", (_req, res) => res.json({ service: "vedaai-worker", status: "healthy" }));
  
  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    logger.info(`Worker health server listening on port ${port}`);
  });
}

startWorkerProcess().catch((error) => {
  logger.fatal(error, "Worker failed to start");
  process.exit(1);
});
