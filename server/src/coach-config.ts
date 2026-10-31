import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_ORIGINS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().trim().min(1).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid Coach API configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

const origins = (parsed.data.APP_ORIGINS
  ?? (parsed.data.NODE_ENV === "production" ? "" : "http://localhost:5173,http://127.0.0.1:5173"))
  .split(",").map((origin) => origin.trim()).filter(Boolean);

export const coachConfig = {
  ...parsed.data,
  appOrigins: new Set(origins),
};
