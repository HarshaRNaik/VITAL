import { GoogleGenAI } from "@google/genai";
import { coachConfig } from "./coach-config.js";

export async function getCoachHealth(probeInference = false) {
  const geminiConfigured = Boolean(coachConfig.GEMINI_API_KEY && coachConfig.GEMINI_MODEL);
  const fileSearchConfigured = Boolean(coachConfig.GEMINI_API_KEY && coachConfig.GEMINI_FILE_SEARCH_STORE);
  const checks = {
    gemini: "not_configured" as "not_configured" | "available" | "unavailable",
    fileSearch: "not_configured" as "not_configured" | "available" | "unavailable",
  };

  if (geminiConfigured || fileSearchConfigured) {
    const ai = new GoogleGenAI({ apiKey: coachConfig.GEMINI_API_KEY!, httpOptions: { timeout: 5_000 } });
    const [model, store] = await Promise.allSettled([
      geminiConfigured ? ai.models.get({ model: coachConfig.GEMINI_MODEL! }) : Promise.reject(new Error("Gemini is not configured")),
      fileSearchConfigured ? ai.fileSearchStores.get({ name: coachConfig.GEMINI_FILE_SEARCH_STORE! }) : Promise.reject(new Error("File Search is not configured")),
    ]);
    if (geminiConfigured) checks.gemini = model.status === "fulfilled" ? "available" : "unavailable";
    if (fileSearchConfigured) checks.fileSearch = store.status === "fulfilled" ? "available" : "unavailable";

    let inference: "not_checked" | "available" | "unavailable" = "not_checked";
    if (probeInference && geminiConfigured && fileSearchConfigured) {
      try {
        await ai.models.generateContent({
          model: coachConfig.GEMINI_MODEL!,
          contents: "Answer with only OK.",
          config: {
            tools: [{ fileSearch: { fileSearchStoreNames: [coachConfig.GEMINI_FILE_SEARCH_STORE!], topK: 1 } }],
            maxOutputTokens: 8,
          },
        });
        inference = "available";
      } catch {
        inference = "unavailable";
      }
    }
    return {
      status: "ok",
      supabase: coachConfig.SUPABASE_URL && coachConfig.SUPABASE_ANON_KEY ? "configured" : "not_configured",
      gemini: { configured: geminiConfigured, service: checks.gemini, inference },
      fileSearch: { configured: fileSearchConfigured, service: checks.fileSearch },
    };
  }

  return {
    status: "ok",
    supabase: coachConfig.SUPABASE_URL && coachConfig.SUPABASE_ANON_KEY ? "configured" : "not_configured",
    gemini: { configured: geminiConfigured, service: checks.gemini, inference: "not_checked" },
    fileSearch: { configured: fileSearchConfigured, service: checks.fileSearch },
  };
}
