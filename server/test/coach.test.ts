import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
process.env.APP_ORIGINS = "http://localhost:5173";

const { coachApp } = await import("../src/coach-app.js");
const { coachConfig } = await import("../src/coach-config.js");
const accessToken = "user-access-token-for-coach-test";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.restoreAllMocks();
  gemini.generateContent.mockReset();
  gemini.getModel.mockReset().mockResolvedValue({ name: "models/test-model" });
  gemini.getStore.mockReset().mockResolvedValue({ name: "fileSearchStores/vital-fitness-test" });
});

describe("VITAL Coach API", () => {
  it("reports backend, Gemini, and File Search health without exposing configuration values", async () => {
    const result = await request(coachApp).get("/api/health").expect(200);
    expect(result.body).toMatchObject({
      status: "ok",
      supabase: "configured",
      gemini: { configured: true, service: "available" },
      fileSearch: { configured: true, service: "available" },
    });
    expect(JSON.stringify(result.body)).not.toContain("test-gemini-key");
    expect(JSON.stringify(result.body)).not.toContain("vital-fitness-test");
    expect(gemini.getModel).toHaveBeenCalledWith({ model: "test-model" });
    expect(gemini.getStore).toHaveBeenCalledWith({ name: "fileSearchStores/vital-fitness-test" });
  });

  it("reports provider availability separately from missing configuration", async () => {
    gemini.getModel.mockRejectedValue(new Error("provider failure"));
    const result = await request(coachApp).get("/health").expect(200);
    expect(result.body.gemini).toEqual({ configured: true, service: "unavailable", inference: "not_checked" });
    expect(result.body.fileSearch).toEqual({ configured: true, service: "available" });
  });

  it("runs a deliberate Gemini inference probe only on the deep health route", async () => {
    await request(coachApp).get("/api/health").expect(200);
    expect(gemini.generateContent).not.toHaveBeenCalled();
    gemini.generateContent.mockResolvedValue({ text: "OK" });
    const result = await request(coachApp).get("/api/health/deep").expect(200);
    expect(result.body.gemini.inference).toBe("available");
    expect(gemini.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: "test-model",
      config: { tools: [{ fileSearch: { fileSearchStoreNames: ["fileSearchStores/vital-fitness-test"], topK: 1 } }], maxOutputTokens: 8 },
    }));
  });

  it("rejects unauthenticated requests before reading user data or calling Gemini", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await request(coachApp).post("/api/coach/reply").send({ content: "Suggest a workout" }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gemini.generateContent).not.toHaveBeenCalled();
  });

  it("rejects invalid or expired Supabase tokens before retrieving private context", async () => {
    const fetchMock = vi.fn(async () => response({ message: "token expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const result = await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "How am I doing?" })
      .expect(401);
    expect(result.body.error.code).toBe("UNAUTHENTICATED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gemini.generateContent).not.toHaveBeenCalled();
  });

  it("validates requests and uses the caller's Supabase token for isolated context reads", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "user-1" });
      if (url.includes("user_settings")) return response([{ time_zone: "Asia/Kolkata" }]);
      if (url.includes("profiles")) return response([{ goal: "Build strength" }]);
      if (url.includes("fitness_goals")) return response([{ name: "Run 5K", metric: "distance", target_value: 5, unit: "km", deadline: null }]);
      if (url.includes("assistant_conversations")) return response([{ id: "conversation-1" }]);
      if (url.includes("assistant_messages")) return response([{ role: "user", content: "How can I recover after leg day?" }]);
      if (url.includes("/workouts?")) return response([{ name: "Leg day", type: "Strength", date: "2026-10-30", duration: 35, calories: 0 }]);
      if (url.includes("nutrition_logs")) return response([]);
      if (url.includes("progress_metrics")) return response([{ date: "2026-10-29", weight_kg: 72 }]);
      return response({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    gemini.generateContent.mockResolvedValue({ text: "Good work on your leg day." });

    await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "How was my training?" })
      .expect(200, { text: "Good work on your leg day." });

    expect(fetchMock).toHaveBeenCalledTimes(9);
    for (const [, options] of fetchMock.mock.calls) {
      expect((options as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${accessToken}` });
    }
    expect(gemini.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: "test-model",
      contents: expect.stringContaining("Leg day"),
      config: expect.objectContaining({
        tools: [{ fileSearch: { fileSearchStoreNames: ["fileSearchStores/vital-fitness-test"], topK: 5 } }],
        systemInstruction: expect.stringContaining("Never invent exercise IDs"),
      }),
    }));
    const prompt = gemini.generateContent.mock.calls[0]?.[0]?.contents as string;
    expect(prompt).toContain("Build strength");
    expect(prompt).toContain("Run 5K");
    expect(prompt).toContain("How can I recover after leg day?");

    const invalid = await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "" })
      .expect(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(gemini.generateContent).toHaveBeenCalledTimes(1);
  });

  it("uses retrieved File Search context for dataset-specific exercise answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "user-1" });
      if (url.includes("user_settings")) return response([{ time_zone: "UTC" }]);
      return response([]);
    }));
    gemini.generateContent.mockResolvedValue({
      text: "The dataset lists body weight.",
      candidates: [{ groundingMetadata: { groundingChunks: [{ retrievedContext: { fileSearchStore: "fileSearchStores/vital-fitness-test", title: "waist__waist.md" } }] } }],
    });

    const result = await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "What equipment is required for 3/4 sit-up?" })
      .expect(200);
    expect(result.body.text).toContain("The dataset lists body weight.");
    expect(result.body.text).toContain("Sources:");
    expect(result.body.text).toContain("waist__waist.md");
  });

  it("does not return ungrounded exercise dataset details when File Search retrieves no source", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "user-1" });
      if (url.includes("user_settings")) return response([{ time_zone: "UTC" }]);
      return response([]);
    }));
    gemini.generateContent.mockResolvedValue({ text: "Invented equipment: a barbell." });

    const result = await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "What equipment is required for an exercise in the dataset?" })
      .expect(200);

    expect(result.body.text).toContain("couldn't retrieve a matching exercise entry");
    expect(result.body.text).not.toContain("barbell");
  });

  it("reports Coach as unconfigured when the File Search store is missing", async () => {
    const configuredStore = coachConfig.GEMINI_FILE_SEARCH_STORE;
    Object.assign(coachConfig, { GEMINI_FILE_SEARCH_STORE: undefined });
    try {
      const result = await request(coachApp)
        .post("/api/coach/reply")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ content: "Suggest a workout" })
        .expect(503);
      expect(result.body.error.code).toBe("COACH_NOT_CONFIGURED");
      expect(gemini.generateContent).not.toHaveBeenCalled();
    } finally {
      Object.assign(coachConfig, { GEMINI_FILE_SEARCH_STORE: configuredStore });
    }
  });

  it("maps Gemini quota errors to a safe retry-later response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "user-1" });
      if (url.includes("user_settings")) return response([{ time_zone: "UTC" }]);
      return response([]);
    }));
    gemini.generateContent.mockRejectedValue(Object.assign(new Error("quota response must not leak"), { status: 429 }));

    const result = await request(coachApp)
      .post("/api/coach/reply")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: "Suggest a workout" })
      .expect(429);
    expect(result.body.error.code).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(JSON.stringify(result.body)).not.toContain("quota response must not leak");
  });
});
