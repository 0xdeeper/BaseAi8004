/* ======================================================
   SIMPLE IN-MEMORY CONVERSATION STORE (HARDENED)
====================================================== */

export type ChatRole = "user" | "assistant" | "system";
export type ChatMessage = { role: ChatRole; content: string };

type SessionState = {
  history: ChatMessage[];
  updatedAt: number; // epoch ms
};

const sessions = new Map<string, SessionState>();

// ---- Limits (tune as needed) ----
const MAX_SESSIONS = 500;                 // prevent unbounded session creation
const MAX_MESSAGES_PER_SESSION = 200;     // cap history length
const MAX_CONTENT_CHARS = 8_000;          // cap message size
const SESSION_TTL_MS = 60 * 60 * 1000;    // 1 hour
const SESSION_ID_REGEX = /^[A-Za-z0-9_-]{16,128}$/; // require some entropy/shape

function now(): number {
  return Date.now();
}

function assertSessionId(sessionId: string) {
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error("Invalid sessionId");
  }
}

function assertMessage(message: ChatMessage) {
  if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") {
    throw new Error("Invalid role");
  }
  if (typeof message.content !== "string") {
    throw new Error("Invalid content");
  }
  const content = message.content.trim();
  if (content.length === 0) throw new Error("Empty content");
  if (content.length > MAX_CONTENT_CHARS) throw new Error("Content too large");
}

function evictExpiredSessions() {
  const t = now();
  for (const [sid, state] of sessions.entries()) {
    if (t - state.updatedAt > SESSION_TTL_MS) sessions.delete(sid);
  }
}

function ensureCapacity() {
  // simple eviction strategy: TTL sweep + if still too many, delete oldest
  evictExpiredSessions();
  if (sessions.size <= MAX_SESSIONS) return;

  let oldestSid: string | null = null;
  let oldestTs = Number.POSITIVE_INFINITY;
  for (const [sid, state] of sessions.entries()) {
    if (state.updatedAt < oldestTs) {
      oldestTs = state.updatedAt;
      oldestSid = sid;
    }
  }
  if (oldestSid) sessions.delete(oldestSid);
}

export function getHistory(sessionId: string): ChatMessage[] {
  assertSessionId(sessionId);
  evictExpiredSessions();

  const state = sessions.get(sessionId);
  if (!state) return [];

  // Defensive copy so callers can’t mutate internal state
  return state.history.map((m) => ({ role: m.role, content: m.content }));
}

type AppendOptions = {
  // Default: system messages are blocked (prevents privilege escalation).
  allowSystem?: boolean;
};

export function appendMessage(sessionId: string, message: ChatMessage, opts?: AppendOptions) {
  assertSessionId(sessionId);
  assertMessage(message);
  ensureCapacity();

  // Lock down "system" writes by default.
  if (message.role === "system" && !opts?.allowSystem) {
    throw new Error("System messages are not allowed");
  }

  const t = now();
  const state = sessions.get(sessionId) ?? { history: [], updatedAt: t };

  state.history.push({ role: message.role, content: message.content.trim() });

  if (state.history.length > MAX_MESSAGES_PER_SESSION) {
    // Drop oldest messages, keep newest
    state.history.splice(0, state.history.length - MAX_MESSAGES_PER_SESSION);
  }

  state.updatedAt = t;
  sessions.set(sessionId, state);
}

export function clearSession(sessionId: string) {
  assertSessionId(sessionId);
  sessions.delete(sessionId);
}

// Optional: clear everything on shutdown signals if you want zero residue
export function clearAllSessions() {
  sessions.clear();
}
