/* ======================================================
   ENV SETUP
====================================================== */
import "dotenv/config";
import fetch from "node-fetch";
import OpenAI from "openai";

// Import runtime functions
import { getHistory, appendMessage } from "./memory.js";

// Import type-only
import type { ChatMessage } from "./memory.js";

/* ======================================================
   TYPES
====================================================== */
export type LLMProvider = "ollama" | "openai";

/* ======================================================
   OLLAMA CLIENT (LOCAL / FREE)
====================================================== */
async function ollamaResponse(message: string): Promise<string> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "phi3:mini",
      prompt: message,
      stream: false,
      options: {
        num_ctx: 512,
        num_predict: 64,
        num_threads: 1
      }
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error: ${err}`);
  }

  const json: any = await res.json();
  return json.response ?? "";
}

/* ======================================================
   OPENAI CLIENT (FUTURE / PAID)
====================================================== */
async function openAIResponse(message: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: message }],
  });

  return completion.choices[0]?.message?.content ?? "";
}

/* ======================================================
   CORE PUBLIC API (AUTO-FALLBACK)
====================================================== */
export async function generateResponse(message: string): Promise<string> {
  const provider: string = process.env.LLM_PROVIDER || "auto";

  console.log("LLM_PROVIDER =", provider);
  console.log("OLLAMA_BASE_URL =", process.env.OLLAMA_BASE_URL);

  if (provider === "auto") {
    try {
      return await ollamaResponse(message);
    } catch (err) {
      console.warn("Ollama failed. Falling back to OpenAI...");
      return await openAIResponse(message);
    }
  }

  if (provider === "ollama") return await ollamaResponse(message);
  if (provider === "openai") return await openAIResponse(message);

  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

/* ======================================================
   MEMORY-AWARE WRAPPER
====================================================== */
export async function generateResponseWithMemory(
  sessionId: string,
  userMessage: string
): Promise<string> {

  // 1️⃣ Save user message
  appendMessage(sessionId, { role: "user", content: userMessage });

  // 2️⃣ Get updated history
  const history: ChatMessage[] = getHistory(sessionId);

  // 3️⃣ Build prompt
  const fullPrompt: string = history
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  // 4️⃣ Generate response
  const response: string = await generateResponse(fullPrompt);

  // 5️⃣ Save assistant reply
  appendMessage(sessionId, { role: "assistant", content: response });

  return response;
}

