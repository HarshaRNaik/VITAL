import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid server configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

export const config = {
  ...parsed.data,
  appOrigins: new Set(
    (parsed.data.APP_ORIGINS ?? (parsed.data.NODE_ENV === "production" ? "" : "http://localhost:5173,http://127.0.0.1:5173")).split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
  isProduction: parsed.data.NODE_ENV === "production",
};

if (config.isProduction && config.appOrigins.size === 0) {
  throw new Error("APP_ORIGINS must contain at least one trusted frontend origin in production");
}
