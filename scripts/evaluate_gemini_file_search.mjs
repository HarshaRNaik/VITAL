import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const cases = [
  ["back-1", "For alternate lateral pulldown, give the dataset ID and required equipment.", "back__back.md", "0007", "cable"],
  ["back-2", "For archer pull up, give the dataset ID and required equipment.", "back__back.md", "3293", "body weight"],
  ["cardio-1", "For astride jumps (male), give the dataset ID and required equipment.", "cardio__cardio.md", "3220", "body weight"],
  ["cardio-2", "For back and forth step, give the dataset ID and required equipment.", "cardio__cardio.md", "3672", "body weight"],
  ["chest-1", "For archer push up, give the dataset ID and required equipment.", "chest__chest.md", "3294", "body weight"],
  ["chest-2", "For assisted chest dip (kneeling), give the dataset ID and required equipment.", "chest__chest.md", "0009", "leverage machine"],
  ["lower-arms-1", "For band reverse wrist curl, give the dataset ID and required equipment.", "lower_arms__lower_arms.md", "0994", "band"],
  ["lower-arms-2", "For band wrist curl, give the dataset ID and required equipment.", "lower_arms__lower_arms.md", "1016", "band"],
  ["lower-legs-1", "For ankle circles, give the dataset ID and required equipment.", "lower_legs__lower_legs.md", "1368", "body weight"],
  ["lower-legs-2", "For assisted lying calves stretch, give the dataset ID and required equipment.", "lower_legs__lower_legs.md", "1708", "assisted"],
  ["neck-1", "For neck side stretch, give the dataset ID and required equipment.", "neck__neck.md", "1403", "body weight"],
  ["neck-2", "For side push neck stretch, give the dataset ID and required equipment.", "neck__neck.md", "0716", "body weight"],
  ["shoulders-1", "For band front lateral raise, give the dataset ID and required equipment.", "shoulders__shoulders.md", "0977", "band"],
  ["shoulders-2", "For band front raise, give the dataset ID and required equipment.", "shoulders__shoulders.md", "0978", "band"],
  ["upper-arms-1", "For assisted standing triceps extension (with towel), give the dataset ID and required equipment.", "upper_arms__upper_arms.md", "0018", "assisted"],
  ["upper-arms-2", "For assisted triceps dip (kneeling), give the dataset ID and required equipment.", "upper_arms__upper_arms.md", "0019", "leverage machine"],
  ["upper-legs-1", "For all fours squad stretch, give the dataset ID and required equipment.", "upper_legs__upper_legs.md", "1512", "body weight"],
  ["upper-legs-2", "For arms apart circular toe touch (male), give the dataset ID and required equipment.", "upper_legs__upper_legs.md", "3214", "body weight"],
  ["waist-1", "For 3/4 sit-up, give the dataset ID and required equipment.", "waist__waist.md", "0001", "body weight"],
  ["waist-2", "For 45 degree side bend, give the dataset ID and required equipment.", "waist__waist.md", "0002", "body weight"],
  ["id-check-1", "According to the dataset, what is the ID and equipment for 3/4 sit-up?", "waist__waist.md", "0001", "body weight"],
  ["id-check-2", "According to the dataset, what is the ID and equipment for archer push up?", "chest__chest.md", "3294", "body weight"],
  ["id-check-3", "According to the dataset, what is the ID and equipment for band wrist curl?", "lower_arms__lower_arms.md", "1016", "band"],
  ["id-check-4", "According to the dataset, what is the ID and equipment for ankle circles?", "lower_legs__lower_legs.md", "1368", "body weight"],
  ["id-check-5", "According to the dataset, what is the ID and equipment for neck side stretch?", "neck__neck.md", "1403", "body weight"],
].map(([id, question, expectedSource, expectedId, expectedEquipment]) => ({ id, question, expectedSource, expectedId, expectedEquipment }));

function retrievedContexts(result) {
  return (result.candidates ?? [])
    .flatMap((candidate) => candidate.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.retrievedContext)
    .filter(Boolean);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const store = process.env.GEMINI_FILE_SEARCH_STORE?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  if (!store?.startsWith("fileSearchStores/") || store.includes("YOUR_ACTUAL")) {
    throw new Error("GEMINI_FILE_SEARCH_STORE must contain the existing File Search resource name.");
  }

  const timeout = Number.parseInt(process.env.GEMINI_EVAL_TIMEOUT_MS || "120000", 10);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: Number.isInteger(timeout) ? timeout : 120_000 } });
  let citationPass = 0;
  let factPass = 0;
  const limit = Number.parseInt(process.env.GEMINI_EVAL_LIMIT || String(cases.length), 10);
  const selectedCases = cases.slice(0, Number.isInteger(limit) ? Math.max(1, limit) : cases.length);
  let attempted = 0;
  let providerUnavailable = false;
  for (const test of selectedCases) {
    attempted += 1;
    try {
      const result = await ai.models.generateContent({
        model,
        contents: `Answer using the configured exercise dataset only. Return the exact exercise ID and equipment. If there is no matching entry, say so. Question: ${test.question}`,
        config: { tools: [{ fileSearch: { fileSearchStoreNames: [store], topK: 5 } }], maxOutputTokens: 120 },
      });
      const answer = result.text?.trim() || "";
      const contexts = retrievedContexts(result);
      const cited = contexts.some((context) => `${context.title ?? ""} ${context.uri ?? ""}`.toLowerCase().includes(test.expectedSource.toLowerCase()));
      const factual = answer.includes(test.expectedId) && answer.toLowerCase().includes(test.expectedEquipment.toLowerCase());
      citationPass += Number(cited);
      factPass += Number(factual);
      console.log(`${test.id}: citation=${cited ? "PASS" : "FAIL"} expected-facts=${factual ? "PASS" : "FAIL"}`);
      console.log(`  ${answer.replace(/\s+/g, " ").slice(0, 320) || "(no response text)"}`);
      if (!cited) console.log(`  returned source labels: ${contexts.map((context) => context.title || context.uri || "(unnamed)").join(", ") || "none"}`);
    } catch (error) {
      const status = error && typeof error === "object" ? error.status ?? error.statusCode ?? "unknown" : "unknown";
      const code = error && typeof error === "object" ? error.code ?? "unknown" : "unknown";
      let detail = error instanceof Error ? error.message : "provider request failed";
      detail = detail.replaceAll(apiKey, "[redacted]").replaceAll(store, "[redacted]");
      console.log(`${test.id}: request=FAIL status=${status} code=${code} (${detail.slice(0, 180)})`);
      if ([429, 503, 504].includes(Number(status))) {
        providerUnavailable = true;
        break;
      }
    }
  }

  console.log(`Evaluation summary: ${cases.length} question set; attempted ${attempted}/${selectedCases.length}; citations ${citationPass}/${attempted}; expected facts ${factPass}/${attempted}${providerUnavailable ? "; stopped after Gemini provider availability error" : ""}.`);
  if (attempted !== selectedCases.length || citationPass !== attempted || factPass !== attempted) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Evaluation could not start: ${error instanceof Error ? error.message : "configuration error"}`);
  process.exitCode = 1;
});
