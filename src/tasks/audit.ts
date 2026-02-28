import fs from "node:fs";
import path from "node:path";

type AuditEvent =
  | { type: "TASK_ENQUEUED"; taskId: string; taskType: string; runAfterMs: number; priority: number }
  | { type: "TASK_CLAIMED"; taskId: string; taskType: string; workerId: string; lockUntilMs: number }
  | { type: "TASK_SUCCEEDED"; taskId: string; taskType: string; workerId: string }
  | { type: "TASK_FAILED"; taskId: string; taskType: string; workerId: string; retryable: boolean; nextRunAfterMs?: number; error: string }
  | { type: "TASK_CANCELED"; taskId: string; taskType: string; workerId?: string; reason?: string };

function ensureSecurityDir(): string {
  const dir = path.resolve(process.cwd(), ".security");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function appendTaskEvent(event: AuditEvent): void {
  const dir = ensureSecurityDir();
  const file = path.join(dir, "task-events.jsonl");
  const row = {
    ts: Date.now(),
    ...event,
  };
  fs.appendFileSync(file, JSON.stringify(row) + "\n", { encoding: "utf8" });
}
