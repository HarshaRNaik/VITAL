import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const gemini = vi.hoisted(() => ({ generateContent: vi.fn(), getModel: vi.fn(), getStore: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function () { return {
    models: { generateContent: gemini.generateContent, get: gemini.getModel },
    fileSearchStores: { get: gemini.getStore },
  }; }),
}));

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://vital-example.supabase.co";
process.env.SUPABASE_ANON_KEY = "public-anon-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_MODEL = "test-model";
process.env.GEMINI_FILE_SEARCH_STORE = "fileSearchStores/vital-fitness-test";

const { default: handler } = await import("../../api/[...path].js");
const vercelFunction = (req: Request, res: Response) => handler(req, res);

function response(payload: unknown, status = 200) {
  return new globalThis.Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("Vercel Coach Function adapter", () => {
  it("routes same-origin API health requests into the existing Express app", async () => {
    gemini.getModel.mockResolvedValue({ name: "models/test-model" });
    gemini.getStore.mockResolvedValue({ name: "fileSearchStores/vital-fitness-test" });
    await request(vercelFunction).get("/api/health").expect(200).expect("Content-Type", /application\/json/).expect((result) => {
      expect(result.body.gemini).toMatchObject({ configured: true, service: "available" });
      expect(result.body.fileSearch).toMatchObject({ configured: true, service: "available" });
      expect(JSON.stringify(result.body)).not.toContain("test-gemini-key");
      expect(JSON.stringify(result.body)).not.toContain("vital-fitness-test");
    });
  });

  it("keeps the Coach API path and rejects missing Supabase authorization", async () => {
    await request(vercelFunction).post("/api/coach/reply").send({ content: "Help me plan a workout." }).expect(401);
  });

  it("routes invalid authenticated payloads to Express validation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ id: "user-1" })));
    const result = await request(vercelFunction)
      .post("/api/coach/reply")
      .set("Authorization", "Bearer valid-test-access-token-123456")
      .send({ content: "" })
      .expect(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("routes a valid authenticated request through Coach and preserves citations", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "user-1" });
      if (url.includes("assistant_conversations")) return response([]);
      if (url.includes("user_settings")) return response([{ time_zone: "UTC", workout_preference: "strength" }]);
      return response([]);
    }));
    gemini.generateContent.mockResolvedValue({
      text: "The dataset lists body weight.",
      candidates: [{ groundingMetadata: { groundingChunks: [{ retrievedContext: {
        fileSearchStore: "fileSearchStores/vital-fitness-test",
        title: "waist__waist.md",
        uri: "https://example.test/waist__waist.md",
      } }] } }],
    });

    const result = await request(vercelFunction)
      .post("/api/coach/reply")
      .set("Authorization", "Bearer valid-test-access-token-123456")
      .send({ content: "What equipment is required for 3/4 sit-up?" })
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(result.body.text).toContain("The dataset lists body weight.");
    expect(result.body.text).toContain("Sources:");
    expect(result.body.text).toContain("waist__waist.md (https://example.test/waist__waist.md)");
    expect(gemini.generateContent).toHaveBeenCalledTimes(1);
  });
});
