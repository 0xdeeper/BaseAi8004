import { appendTaskEvent } from "./audit.js";
import { claimNextTask, completeTask, failTask } from "./taskStore.js";
import { getWorker } from "./workerRegistry.js";
import { DEFAULT_LOCK_TTL_MS, DEFAULT_MAX_CLAIMS_PER_TICK, DEFAULT_POLL_INTERVAL_MS, getEnvBool, getEnvInt } from "./locks.js";

export async function runTaskRunner(): Promise<void> {
  const enabled = getEnvBool("TASKS_ENABLED", false);
  if (!enabled) {
    console.log("[task-runner] TASKS_ENABLED is false; exiting (fail-closed).");
    return;
  }

  const workerId = process.env.TASK_WORKER_ID || `runner-${process.pid}`;
  const lockTtlMs = getEnvInt("TASK_LOCK_TTL_MS", DEFAULT_LOCK_TTL_MS);
  const pollMs = getEnvInt("TASK_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const maxClaims = getEnvInt("TASK_MAX_CLAIMS_PER_TICK", DEFAULT_MAX_CLAIMS_PER_TICK);

  console.log(`[task-runner] starting workerId=${workerId} poll=${pollMs}ms lockTtl=${lockTtlMs}ms maxClaims=${maxClaims}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nowMs = Date.now();

    let claimedAny = false;
    for (let i = 0; i < maxClaims; i++) {
      const claimed = claimNextTask({ workerId, lockTtlMs, nowMs });
      if (!claimed) break;

      claimedAny = true;
      appendTaskEvent({
        type: "TASK_CLAIMED",
        taskId: claimed.task.id,
        taskType: claimed.task.type,
        workerId,
        lockUntilMs: claimed.lockUntilMs,
      });

      const worker = getWorker(claimed.task.type);
      if (!worker) {
        const err = `No worker registered for type=${claimed.task.type}`;
        const res = failTask({ taskId: claimed.task.id, nowMs: Date.now(), workerId, error: err, retryable: false });
        appendTaskEvent({
          type: "TASK_FAILED",
          taskId: claimed.task.id,
          taskType: claimed.task.type,
          workerId,
          retryable: false,
          error: err,
        });
        continue;
      }

      try {
        const payload = JSON.parse(claimed.task.payload_json);
        await worker(payload, { nowMs: Date.now(), workerId });

        completeTask({ taskId: claimed.task.id, nowMs: Date.now(), workerId });
        appendTaskEvent({ type: "TASK_SUCCEEDED", taskId: claimed.task.id, taskType: claimed.task.type, workerId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const res = failTask({ taskId: claimed.task.id, nowMs: Date.now(), workerId, error: msg, retryable: true });
        appendTaskEvent({
          type: "TASK_FAILED",
          taskId: claimed.task.id,
          taskType: claimed.task.type,
          workerId,
          retryable: true,
          nextRunAfterMs: res.nextRunAfterMs,
          error: msg,
        });
      }
    }

    // Sleep
    await new Promise((r) => setTimeout(r, claimedAny ? 0 : pollMs));
  }
}
