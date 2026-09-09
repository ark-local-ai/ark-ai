import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  runTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  publish: vi.fn(),
  getUnfinishedTasks: vi.fn<() => { id: string; prompt: string; userId?: string; status: string }[]>(() => []),
}));

// 用 mock 替换真实 runTask/updateTaskStatus/publish，只测 runner 的队列语义与失败兜底，
// 避免触发真实 Office 文件生成（慢、写盘、非幂等）。
vi.mock("./orchestrator.js", () => ({ runTask: mocks.runTask }));
vi.mock("../db/store.js", () => ({
  updateTaskStatus: mocks.updateTaskStatus,
  getUnfinishedTasks: mocks.getUnfinishedTasks,
}));
vi.mock("./events.js", () => ({ publish: mocks.publish }));

import { enqueueTask, resumeUnfinishedTasks } from "./runner.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUnfinishedTasks.mockReturnValue([]);
  mocks.runTask.mockImplementation(async () => {
    await sleep(1);
  });
});

describe("runner 队列", () => {
  it("enqueueTask 串行执行（同一时刻只跑一个）", async () => {
    let running = 0;
    let max = 0;
    mocks.runTask.mockImplementation(async () => {
      running++;
      max = Math.max(max, running);
      await sleep(10);
      running--;
    });
    enqueueTask("a", "p", undefined);
    enqueueTask("b", "p", undefined);
    enqueueTask("c", "p", undefined);
    await sleep(80); // 等队列跑完
    expect(mocks.runTask).toHaveBeenCalledTimes(3);
    expect(max).toBe(1); // 从不超过 1 个并发
  });

  it("runTask 抛异常 → 标记 failed + 广播 error（兜底）", async () => {
    mocks.runTask.mockRejectedValueOnce(new Error("boom"));
    enqueueTask("f", "p", undefined);
    await sleep(30);
    expect(mocks.updateTaskStatus).toHaveBeenCalledWith("f", "failed");
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", taskId: "f" }),
    );
  });

  it("resumeUnfinishedTasks 重新入队遗留任务并保持 user_id", async () => {
    mocks.getUnfinishedTasks.mockReturnValue([
      { id: "q1", prompt: "p1", userId: "alice", status: "queue" },
      { id: "r1", prompt: "p2", userId: undefined, status: "running" },
    ]);
    resumeUnfinishedTasks();
    await sleep(50);
    expect(mocks.runTask).toHaveBeenCalledTimes(2);
    expect(mocks.runTask).toHaveBeenCalledWith("q1", "p1", "alice");
    expect(mocks.runTask).toHaveBeenCalledWith("r1", "p2", undefined);
  });
});
