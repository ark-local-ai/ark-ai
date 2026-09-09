// ===== 任务执行队列 / 可靠性兜底（M16）+ 并发控制（M30）=====
// 目的：① 受控并发，避免 N 个任务一拥而上把 LLM/CPU 打满；② 失败兜底——编排任何一步抛异常
// （LLM 挂、Office 生成重试仍失败、意外错误）都标记任务 failed 并广播 error，不再永久卡 running。
//
// 实现（M30）：用信号量（活动槽位）替代 M16 的严格串行 tail 链。
// - `slots` = 最大并发数（可配，默认 2，环境变量 ARK_MAX_CONCURRENCY 覆盖）. execute 拿一个槽位跑，
//   执行完释放；同一时刻最多跑 `slots` 个。任务按提交顺序排队（FIFO），拿到槽位按序启动。
//
// 注：不做"整体超时"——单靠 race 超时无法取消底下仍在跑的 runTask，它稍后完成会把 failed
// 又覆盖回 done，造成错误终态。超时应在各子调用内做（LLM 调用已有 timeout），这里不叠加。

import { runTask, resumeTask } from "./orchestrator";
import { updateTaskStatus, getUnfinishedTasks } from "../db/store";
import { publish } from "./events";
import { taskLogger } from "../util/log";

// 最大并发任务数：默认 2（本地工具机同跑 2 个重任务可接受），可用 ARK_MAX_CONCURRENCY 覆盖。
const MAX_CONCURRENCY = (() => {
  const n = Number(process.env.ARK_MAX_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 2;
})();

let running = 0; // 正在执行（已占用槽位）的任务数
const waiters: Array<() => void> = []; // 等槽位释放的任务延续回调（FIFO）

/** 取一个槽位；满则挂起直到有槽位释放。resolve 时运行权已落到任务上。 */
function acquire(): Promise<void> {
  if (running < MAX_CONCURRENCY) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      running++;
      resolve();
    });
  });
}

/** 释放一个槽位：先归还 finishing 任务占的位，再唤醒队头等待者（其 resolve 自己 +1） */
function release(): void {
  running--;
  const next = waiters.shift();
  if (next) {
    next();
  }
}

/** 执行单个任务，带失败兜底；绝不向外抛（保证队列不断）。resume=true 时走断点续跑（M31）。 */
async function execute(id: string, prompt: string, userId?: string, resume = false): Promise<void> {
  const log = taskLogger(id);
  log.info({ prompt: prompt.slice(0, 30), userId, concurrency: MAX_CONCURRENCY, resume }, "task execution started");
  await acquire();
  try {
    if (resume) {
      await resumeTask(id, prompt, userId);
    } else {
      await runTask(id, prompt, userId);
    }
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
      // 即便落库失败也不让队列断掉
    }
  } finally {
    release();
  }
}

/**
 * 入队任务（POST 立即返回 taskId 的语义不变）：受控并发执行，失败自动兜底。
 * 用 `void` 调用即可，内部自吞错误。
 */
export function enqueueTask(id: string, prompt: string, userId?: string): void {
  execute(id, prompt, userId);
}

/** M31：以「断点续跑」方式入队（复用已持久化的已完步骤，只重跑余下部分） */
export function enqueueResume(id: string, prompt: string, userId?: string): void {
  execute(id, prompt, userId, true);
}

/** 队列当前状态（供观测/前端展示）：正在执行数、排队数、配置的并发上限 */
export function getQueueStats(): { active: number; queued: number; concurrency: number } {
  return { active: running, queued: waiters.length, concurrency: MAX_CONCURRENCY };
}

/**
 * M24 进程重启恢复：启动时把上次进程遗留的 queue/running 任务重新入队续跑。
 * 编排开头 resetTask(id) 会幂等复位旧行再重跑，故可直接重入队并立即返回。
 * 需在 server 启动时调用，且需能读到 userId 以保持多用户归属。
 */
export function resumeUnfinishedTasks(): void {
  const pending = getUnfinishedTasks();
  for (const t of pending) {
    enqueueResume(t.id, t.prompt, t.userId);
  }
  if (pending.length > 0) {
    // 用 setImmediate 避免阻塞启动；打印一次，避免刷屏
    setImmediate(() => console.log(`[resume] 恢复 ${pending.length} 个遗留任务`));
  }
}
