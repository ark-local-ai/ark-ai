import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  runTask: vi.fn(),
  resumeTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  publish: vi.fn(),
  getUnfinishedTasks: vi.fn<() => { id: string; prompt: string; userId?: string; status: string }[]>(() => []),
}));

// 用 mock 替换真实 runTask/resumeTask/updateTaskStatus/publish，只测 runner 的队列语义与失败兜底，
// 避免触发真实 Office 文件生成（慢、写盘、非幂等）。
vi.mock("./orchestrator.js", () => ({ runTask: mocks.runTask, resumeTask: mocks.resumeTask }));
vi.mock("../db/store.js", () => ({
  updateTaskStatus: mocks.updateTaskStatus,
  getUnfinishedTasks: mocks.getUnfinishedTasks,
}));
vi.mock("./events.js", () => ({ publish: mocks.publish }));

// 默认并发 = 2（env 未设）。enqueueTask 来自模块加载时即定死的并发值。
import { enqueueTask, resumeUnfinishedTasks, getQueueStats } from "./runner.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUnfinishedTasks.mockReturnValue([]);
  mocks.runTask.mockImplementation(async () => {
    await sleep(1);
  });
});

describe("runner 队列（并发控制 M30）", () => {
  it("默认并发 2：提交 3 个任务最多同时跑 2 个，且确有并行", async () => {
    expect(getQueueStats().concurrency).toBe(2);
    let running = 0;
    let max = 0;
    mocks.runTask.mockImplementation(async () => {
      running++;
      max = Math.max(max, running);
      await sleep(30);
      running--;
    });
    enqueueTask("a", "p", undefined);
    enqueueTask("b", "p", undefined);
    enqueueTask("c", "p", undefined);
    await sleep(150); // 等队列跑完
    expect(mocks.runTask).toHaveBeenCalledTimes(3);
    expect(max).toBeLessThanOrEqual(2); // 不超并发上限
    expect(max).toBeGreaterThan(1); // 确有并行（2 个同时跑过）
  });

  it("getQueueStats 反映 active/queued", async () => {
    let releaseA!: () => void;
    let releaseB!: () => void;
    const gateA = new Promise<void>((r) => (releaseA = r));
    const gateB = new Promise<void>((r) => (releaseB = r));
    mocks.runTask.mockImplementationOnce(() => gateA); // a 阻塞住（active）
    mocks.runTask.mockImplementationOnce(() => gateB); // b 阻塞住（active）
    enqueueTask("a", "p", undefined); // 占用第 1 个槽位
    await sleep(5);
    enqueueTask("b", "p", undefined); // 占第 2 个槽位
    await sleep(5);
    enqueueTask("c", "p", undefined); // 满 → 排队（queued）
    await sleep(5);
    expect(getQueueStats().active).toBe(2);
    expect(getQueueStats().queued).toBe(1);
    releaseA();
    releaseB();
    await sleep(60);
    expect(mocks.runTask).toHaveBeenCalledTimes(3);
    expect(getQueueStats().active).toBe(0);
    expect(getQueueStats().queued).toBe(0);
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

  it("resumeUnfinishedTasks 走断点续跑（resumeTask）并保持 user_id（M31）", async () => {
    mocks.getUnfinishedTasks.mockReturnValue([
      { id: "q1", prompt: "p1", userId: "alice", status: "queue" },
      { id: "r1", prompt: "p2", userId: undefined, status: "running" },
    ]);
    resumeUnfinishedTasks();
    await sleep(50);
    // M31：重启恢复走 resumeTask（复用已完步骤），不再走 runTask（从零重跑）
    expect(mocks.resumeTask).toHaveBeenCalledTimes(2);
    expect(mocks.resumeTask).toHaveBeenCalledWith("q1", "p1", "alice");
    expect(mocks.resumeTask).toHaveBeenCalledWith("r1", "p2", undefined);
    expect(mocks.runTask).not.toHaveBeenCalled();
  });
});

// ARK_MAX_CONCURRENCY=1 时严格串行：用 resetModules + 动态 import 拿一个按 env=1 加载的 runner 实例。
// vi.mock 的注册在 resetModules 后仍生效，因此动态 import 的 runner 依旧解析到同一组 mock。
describe("runner 严格串行（ARK_MAX_CONCURRENCY=1）", () => {
  it("同一个时刻最多跑 1 个", async () => {
    process.env.ARK_MAX_CONCURRENCY = "1";
    vi.resetModules();
    const fresh = await import("./runner.js");
    let running = 0;
    let max = 0;
    mocks.runTask.mockImplementation(async () => {
      running++;
      max = Math.max(max, running);
      await sleep(20);
      running--;
    });
    fresh.enqueueTask("x", "p", undefined);
    fresh.enqueueTask("y", "p", undefined);
    fresh.enqueueTask("z", "p", undefined);
    await sleep(120);
    expect(fresh.getQueueStats().concurrency).toBe(1);
    expect(mocks.runTask).toHaveBeenCalledTimes(3);
    expect(max).toBe(1); // 严格串行
    delete process.env.ARK_MAX_CONCURRENCY;
  });
});
