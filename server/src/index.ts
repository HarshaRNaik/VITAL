import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

await prisma.$connect();

const server = app.listen(config.PORT, () => {
  console.info(`VITAL FITNESS API listening on port ${config.PORT}`);
});

async function shutdown(signal: string) {
  console.info(`Received ${signal}; shutting down.`);
  server.close(async (error) => {
    await prisma.$disconnect();
    if (error) {
      console.error("HTTP server shutdown failed.");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
