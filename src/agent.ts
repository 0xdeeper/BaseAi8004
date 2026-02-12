import OpenAI from 'openai';
import fetch from 'node-fetch';

export type AgentMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const PROVIDER = process.env.LLM_PROVIDER || 'ollama';

/* -------------------- CLIENTS -------------------- */

let openai: OpenAI | null = null;

if (PROVIDER === 'openai') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

if (PROVIDER === 'commonstack') {
  if (!process.env.COMMONSTACK_API_KEY) {
    throw new Error('COMMONSTACK_API_KEY is required when LLM_PROVIDER=commonstack');
  }

  openai = new OpenAI({
    apiKey: process.env.COMMONSTACK_API_KEY,
    baseURL: 'https://api.commonstack.ai/v1',
  });
}

/* -------------------- CHAT -------------------- */

export async function chat(messages: AgentMessage[]): Promise<string> {
  // 🔹 OLLAMA (LOCAL)
  if (PROVIDER === 'ollama') {
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        messages,
        stream: false,
      }),
    });

    const data = await res.json();
    return data.message?.content ?? 'No response';
  }

  // 🔹 OPENAI / COMMONSTACK (API-compatible)
  if (!openai) throw new Error('LLM client not initialized');

  const response = await openai.chat.completions.create({
    model: PROVIDER === 'openai' ? 'gpt-4o-mini' : 'clawdbot',
    messages,
  });

  return response.choices[0]?.message?.content ?? 'No response';
}

/* -------------------- GENERATE -------------------- */

export async function generateResponse(
  userMessage: string,
  history: AgentMessage[] = []
): Promise<string> {
  const systemPrompt: AgentMessage = {
    role: 'system',
    content:
      'You are a helpful AI assistant registered on the ERC-8004 protocol. Be concise and helpful.',
  };

  return chat([
    systemPrompt,
    ...history,
    { role: 'user', content: userMessage },
  ]);
}
