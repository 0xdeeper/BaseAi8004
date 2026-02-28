import { getTasksDb } from "./db.js";

function hasColumn(db: any, table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === col);
}

export function migrateTasksDb(): void {
  const db = getTasksDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      state TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      run_after_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS task_locks (
      task_id TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      lock_until_ms INTEGER NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_runnable
      ON tasks(state, run_after_ms, priority);

    CREATE INDEX IF NOT EXISTS idx_locks_until
      ON task_locks(lock_until_ms);
  `);

  // ---- Migration: add task_key for idempotent scheduling ----
  if (!hasColumn(db, "tasks", "task_key")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN task_key TEXT;`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_key ON tasks(task_key);`);
  }
}
