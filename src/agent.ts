import "dotenv/config";
import OpenAI from "openai";
import fetch from "node-fetch";

export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const PROVIDER = process.env.LLM_PROVIDER || "openai";

/* -------------------- OPENAI CLIENT -------------------- */

let openai: OpenAI | null = null;

if (PROVIDER === "openai") {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/* -------------------- CHAT -------------------- */

export async function chat(messages: AgentMessage[]): Promise<string> {
  // ===== OPENAI =====
  if (PROVIDER === "openai") {
    if (!openai) throw new Error("OpenAI not initialized");

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    return res.choices?.[0]?.message?.content ?? "";
  }

  // ===== COMMONSTACK (CORRECT) =====
  if (PROVIDER === "commonstack") {
    if (!process.env.COMMONSTACK_API_KEY) {
      throw new Error("COMMONSTACK_API_KEY missing");
    }

    // Convert chat → prompt
    const prompt = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const res = await fetch("https://api.commonstack.ai/v1/complete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COMMONSTACK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        prompt,
        max_tokens: 300,
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("Commonstack error body:", text);
      throw new Error(`Commonstack ${res.status}`);
    }

    const json = JSON.parse(text);
    return json.output_text ?? "";
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${PROVIDER}`);
}

/* -------------------- GENERATE RESPONSE -------------------- */

export async function generateResponse(
  userMessage: string,
  history: AgentMessage[] = []
): Promise<string> {
  const system: AgentMessage = {
    role: "system",
    content: "You are a helpful AI assistant registered on ERC-8004.",
  };

  return chat([
    system,
    ...history,
    { role: "user", content: userMessage },
  ]);
}
