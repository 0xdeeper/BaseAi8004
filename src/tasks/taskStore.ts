import { randomUUID } from "node:crypto";
import { getTasksDb } from "./db.js";
import type { ClaimedTask, EnqueueParams, TaskRecord, TaskState } from "./types.js";

function nowMs(): number {
  return Date.now();
}

// Deterministic backoff: 5s, 15s, 45s, 135s... capped at 5m
export function computeBackoffMs(attemptsAfterFailure: number): number {
  const base = 5_000;
  const factor = 3;
  const raw = base * Math.pow(factor, Math.max(0, attemptsAfterFailure - 1));
  return Math.min(raw, 5 * 60_000);
}

/**
 * Enqueue a task.
 * If taskKey is provided, it is idempotent (INSERT OR IGNORE) and returns null on duplicate.
 */
export function enqueueTask(params: EnqueueParams): string | null {
  const db = getTasksDb();
  const id = randomUUID();
  const created = nowMs();
  const runAfter = params.runAfterMs ?? created;
  const priority = params.priority ?? 0;
  const maxAttempts = params.maxAttempts ?? 5;

  const taskKey = params.taskKey ?? null;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tasks (
      id, type, payload_json, state, priority, attempts, max_attempts,
      run_after_ms, created_at_ms, updated_at_ms, last_error, task_key
    ) VALUES (
      @id, @type, @payload_json, @state, @priority, @attempts, @max_attempts,
      @run_after_ms, @created_at_ms, @updated_at_ms, @last_error, @task_key
    )
  `);

  const info = stmt.run({
    id,
    type: params.type,
    payload_json: JSON.stringify(params.payload ?? null),
    state: "QUEUED",
    priority,
    attempts: 0,
    max_attempts: maxAttempts,
    run_after_ms: runAfter,
    created_at_ms: created,
    updated_at_ms: created,
    last_error: null,
    task_key: taskKey,
  });

  if (info.changes === 0) return null; // duplicate task_key
  return id;
}

export function getTaskById(id: string): TaskRecord | null {
  const db = getTasksDb();
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRecord | undefined;
  return row ?? null;
}

function parseState(s: string): TaskState {
  return s as TaskState;
}

/**
 * Atomically claim the next runnable task.
 * Uses BEGIN IMMEDIATE to avoid cross-process claim races.
 */
export function claimNextTask(opts: {
  workerId: string;
  lockTtlMs: number;
  nowMs: number;
}): ClaimedTask | null {
  const db = getTasksDb();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`DELETE FROM task_locks WHERE lock_until_ms <= ?`).run(opts.nowMs);

    const picked = db
      .prepare(
        `
        SELECT t.*
        FROM tasks t
        LEFT JOIN task_locks l ON l.task_id = t.id
        WHERE t.state = 'QUEUED'
          AND t.run_after_ms <= ?
          AND l.task_id IS NULL
        ORDER BY t.priority DESC, t.run_after_ms ASC, t.created_at_ms ASC
        LIMIT 1
      `
      )
      .get(opts.nowMs) as TaskRecord | undefined;

    if (!picked) {
      db.exec("COMMIT");
      return null;
    }

    const lockUntil = opts.nowMs + opts.lockTtlMs;

    db.prepare(
      `
      INSERT INTO task_locks (task_id, locked_by, lock_until_ms)
      VALUES (?, ?, ?)
    `
    ).run(picked.id, opts.workerId, lockUntil);

    db.prepare(
      `
      UPDATE tasks
      SET state = 'RUNNING',
          attempts = attempts + 1,
          updated_at_ms = ?,
          last_error = NULL
      WHERE id = ?
    `
    ).run(opts.nowMs, picked.id);

    const updated = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(picked.id) as TaskRecord;
    updated.state = parseState(updated.state);

    db.exec("COMMIT");
    return { task: updated, lockUntilMs: lockUntil };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}

export function completeTask(opts: { taskId: string; nowMs: number; workerId: string }): void {
  const db = getTasksDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `
      UPDATE tasks
      SET state = 'SUCCEEDED',
          updated_at_ms = ?
      WHERE id = ?
    `
    ).run(opts.nowMs, opts.taskId);

    db.prepare(`DELETE FROM task_locks WHERE task_id = ? AND locked_by = ?`).run(opts.taskId, opts.workerId);

    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}

export function failTask(opts: {
  taskId: string;
  nowMs: number;
  workerId: string;
  error: string;
  retryable: boolean;
}): { nextRunAfterMs?: number; final: boolean } {
  const db = getTasksDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(opts.taskId) as TaskRecord | undefined;

    if (!row) {
      db.prepare(`DELETE FROM task_locks WHERE task_id = ? AND locked_by = ?`).run(opts.taskId, opts.workerId);
      db.exec("COMMIT");
      return { final: true };
    }

    const attempts = row.attempts; // already incremented when claimed
    const maxAttempts = row.max_attempts;

    let nextRunAfterMs: number | undefined;
    let state: TaskState;

    if (!opts.retryable) {
      state = "FAILED_FINAL";
    } else if (attempts >= maxAttempts) {
      state = "FAILED_FINAL";
    } else {
      state = "FAILED_RETRYABLE";
      nextRunAfterMs = opts.nowMs + computeBackoffMs(attempts);
    }

    db.prepare(
      `
      UPDATE tasks
      SET state = ?,
          run_after_ms = COALESCE(?, run_after_ms),
          updated_at_ms = ?,
          last_error = ?
      WHERE id = ?
    `
    ).run(state, nextRunAfterMs ?? null, opts.nowMs, opts.error, opts.taskId);

    db.prepare(`DELETE FROM task_locks WHERE task_id = ? AND locked_by = ?`).run(opts.taskId, opts.workerId);

    if (state === "FAILED_RETRYABLE") {
      db.prepare(
        `
        UPDATE tasks
        SET state = 'QUEUED',
            updated_at_ms = ?
        WHERE id = ?
      `
      ).run(opts.nowMs, opts.taskId);
    }

    db.exec("COMMIT");
    return { nextRunAfterMs, final: state === "FAILED_FINAL" };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  }
}
