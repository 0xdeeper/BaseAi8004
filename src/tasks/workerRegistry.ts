import type { TaskWorker } from "./types.js";
import { strategyTickWorker } from "./workers/strategyTick.js";

const workers = new Map<string, TaskWorker>();

// Keep NOOP for diagnostics if you want it
workers.set("NOOP", async () => {});

workers.set("STRATEGY_TICK", strategyTickWorker);

export function getWorker(taskType: string): TaskWorker | undefined {
  return workers.get(taskType);
}

export function registerWorker(taskType: string, worker: TaskWorker): void {
  if (workers.has(taskType)) throw new Error(`Worker already registered for type: ${taskType}`);
  workers.set(taskType, worker);
}
