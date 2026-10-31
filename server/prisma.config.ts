import "dotenv/config";
import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx server/src/seed.ts",
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
});
