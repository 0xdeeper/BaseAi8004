export type TaskState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL"
  | "CANCELED";

export interface TaskRecord {
  id: string;
  type: string;
  payload_json: string;
  state: TaskState;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after_ms: number;
  created_at_ms: number;
  updated_at_ms: number;
  last_error: string | null;
}

export interface ClaimedTask {
  task: TaskRecord;
  lockUntilMs: number;
}

export interface TaskWorkerContext {
  nowMs: number;
  workerId: string;
}

export type TaskWorker = (payload: unknown, ctx: TaskWorkerContext) => Promise<void>;

export interface EnqueueParams {
  type: string;
  payload: unknown;
  runAfterMs?: number;
  priority?: number;
  maxAttempts?: number;
}

export interface EnqueueParams {
  type: string;
  payload: unknown;
  runAfterMs?: number;
  priority?: number;
  maxAttempts?: number;
  taskKey?: string; // NEW: idempotency key
}
