/* ======================================================
   ENV SETUP
====================================================== */
import "dotenv/config";
import fetch from "node-fetch";
import OpenAI from "openai";

/* ======================================================
   PUBLIC API (USED BY A2A SERVER)
====================================================== */
export async function generateResponse(message: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER || "ollama";

  console.log("OLLAMA_BASE_URL =", process.env.OLLAMA_BASE_URL);

  if (provider === "ollama") {
    return ollamaResponse(message);
  }

  if (provider === "openai") {
    return openAIResponse(message);
  }

  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

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
