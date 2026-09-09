// ===== 任务执行队列 / 可靠性兜底（M16）=====
// 目的：① 串行队列，避免 N 个任务并行把 LLM/CPU 打满；② 失败兜底——编排任何一步抛异常
// （LLM 挂、Office 生成重试仍失败、意外错误）都标记任务 failed 并广播 error，不再永久卡 running。
//
// 注：不做"整体超时"——单靠 race 超时无法取消底下仍在跑的 runTask，它稍后完成会把 failed
// 又覆盖回 done，造成错误终态。超时应在各子调用内做（LLM 调用已有 timeout），这里不叠加。
// （若将来要硬超时，需给整条管线传 AbortSignal 做真实取消，属较大改造。）

import { runTask } from "./orchestrator";
import { updateTaskStatus, getUnfinishedTasks } from "../db/store";
import { publish } from "./events";
import { taskLogger } from "../util/log";

// 串行队列：tail 是上一条任务的 Promise，新任务接在其后，保证同一时刻只跑一个任务。
let tail: Promise<void> = Promise.resolve();

/** 执行单个任务，带失败兜底；绝不向外抛（保证队列链不断） */
async function execute(id: string, prompt: string, userId?: string): Promise<void> {
  const log = taskLogger(id);
  log.info({ prompt: prompt.slice(0, 30), userId }, "task execution started");
  try {
    await runTask(id, prompt, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 幂等安抚：即使已部分执行，也确保落在 failed + 广播 error，前端任务页能感知并停止等待
    try {
      updateTaskStatus(id, "failed");
      log.error({ err: message, status: "failed" }, "task failed");
      publish({
        type: "error",
        taskId: id,
        data: { taskId: id, message: `任务失败：${message}` },
      });
    } catch {
      // 即便落库失败也不让队列链断掉
    }
  }
}

/**
 * 入队任务（POST 立即返回 taskId 的语义不变）：串行执行，失败自动兜底。
 * 用 `void` 调用即可，内部自吞错误。
 */
export function enqueueTask(id: string, prompt: string, userId?: string): void {
  tail = tail.then(() => execute(id, prompt, userId));
}

/**
 * M24 进程重启恢复：启动时把上次进程遗留的 queue/running 任务重新入队续跑。
 * 编排开头 resetTask(id) 会幂等复位旧行再重跑，故可直接重入队并立即返回。
 * 需在 server 启动时调用，且需能读到 userId 以保持多用户归属。
 */
export function resumeUnfinishedTasks(): void {
  const pending = getUnfinishedTasks();
  for (const t of pending) {
    enqueueTask(t.id, t.prompt, t.userId);
  }
  if (pending.length > 0) {
    // 用队列链头打印一次，避免刷屏
    tail = tail.then(() => console.log(`[resume] 恢复 ${pending.length} 个遗留任务`));
  }
}