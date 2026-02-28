import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let dbSingleton: Database.Database | null = null;

export function getTasksDb(): Database.Database {
  if (dbSingleton) return dbSingleton;

  // Ensure .security exists
  const securityDir = path.resolve(process.cwd(), ".security");
  if (!fs.existsSync(securityDir)) fs.mkdirSync(securityDir, { recursive: true });

  const dbPath = path.join(securityDir, "tasks.db");

  // Open DB (will create file if missing)
  const db = new Database(dbPath, {
    // safer behavior; throws on busy unless we set busy_timeout below
    verbose: undefined,
  });

  // ---- SAFETY PRAGMAS (crash safety + correctness) ----
  // WAL = safe journaling, allows concurrent readers, crash-resilient
  db.pragma("journal_mode = WAL");

  // FULL = strongest durability (slower, but safest)
  db.pragma("synchronous = FULL");

  // Enforce FK constraints if we use them later
  db.pragma("foreign_keys = ON");

  // Avoid immediate "database is locked" errors under contention
  db.pragma("busy_timeout = 5000");

  // Optional: keep temp data on disk (more stable than memory under pressure)
  db.pragma("temp_store = FILE");

  dbSingleton = db;
  return dbSingleton;
}

export function closeTasksDb(): void {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
  }
}
