/* ======================================================
   SIMPLE IN-MEMORY CONVERSATION STORE
====================================================== */

export type ChatMessage = {          // <-- export added
  role: "user" | "assistant" | "system";
  content: string;
};

const sessions = new Map<string, ChatMessage[]>();

export function getHistory(sessionId: string): ChatMessage[] {
  return sessions.get(sessionId) || [];
}

export function appendMessage(sessionId: string, message: ChatMessage) {
  const history = sessions.get(sessionId) || [];
  history.push(message);
  sessions.set(sessionId, history);
}

export function clearSession(sessionId: string) {
  sessions.delete(sessionId);
}
