import { coachApp } from "./coach-app.js";
import { coachConfig } from "./coach-config.js";

const server = coachApp.listen(coachConfig.PORT, "0.0.0.0", () => {
  console.info(`VITAL Coach API listening on port ${coachConfig.PORT}`);
});

process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
