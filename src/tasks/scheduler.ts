import { enqueueTask } from "./taskStore.js";
import { appendTaskEvent } from "./audit.js";

function bucketIso(nowMs: number, intervalMs: number): string {
  const bucket = Math.floor(nowMs / intervalMs) * intervalMs;
  return new Date(bucket).toISOString();
}

export async function runScheduler(): Promise<void> {
  const enabled = (process.env.TASKS_SCHEDULER_ENABLED || "").toLowerCase() === "true";
  if (!enabled) {
    console.log("[task-scheduler] TASKS_SCHEDULER_ENABLED is false; exiting (fail-closed).");
    return;
  }

  const intervalMs = Number(process.env.TASK_TICK_INTERVAL_MS || "60000");
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    throw new Error("TASK_TICK_INTERVAL_MS must be >= 1000");
  }

  console.log(`[task-scheduler] starting interval=${intervalMs}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nowMs = Date.now();
    const bucket = bucketIso(nowMs, intervalMs);

    const taskKey = `STRATEGY_TICK:base:${bucket}`;

    const id = enqueueTask({
      type: "STRATEGY_TICK",
      payload: { bucket },
      taskKey,
      runAfterMs: nowMs,
      priority: 0,
    });

    if (id) {
      appendTaskEvent({
        type: "TASK_ENQUEUED",
        taskId: id,
        taskType: "STRATEGY_TICK",
        runAfterMs: nowMs,
        priority: 0,
      });
      console.log(`[task-scheduler] enqueued STRATEGY_TICK id=${id} key=${taskKey}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
