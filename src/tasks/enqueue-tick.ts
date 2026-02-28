import { migrateTasksDb } from "./migrations.js";
import { enqueueTask } from "./taskStore.js";
import { appendTaskEvent } from "./audit.js";

migrateTasksDb();

const id = enqueueTask({ type: "STRATEGY_TICK", payload: {} });

appendTaskEvent({
  type: "TASK_ENQUEUED",
  taskId: id,
  taskType: "STRATEGY_TICK",
  runAfterMs: Date.now(),
  priority: 0,
});

console.log("[enqueue] STRATEGY_TICK", id);
