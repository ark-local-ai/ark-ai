import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadIsolatedStore, cleanup } from "../test/helpers";

// recordFailure/recordSuccess 会写 channel_stats，用隔离库避免污染真实 DB。
let tmpDir: string;
let router: typeof import("./router");

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  tmpDir = loaded.dir;
  router = await import("./router");
});

afterAll(() => cleanup(tmpDir));

beforeEach(() => {
  // 清空渠道统计，避免跨用例串扰；熔断器是内存态，通过成功调用复位或在用例内重置
  router.recordFailure("probe"); // 占位保证模块已初始化
  // 直接操纵是内部私有状态，改为在每个用例内构造独立渠道 id 来隔离
});

describe("熔断器（circuit breaker）", () => {
  it("连续失败达到阈值后打开（isChannelOpen=true），开始即可用", () => {
    expect(router.isChannelOpen("c-break-1")).toBe(false); // 初始关闭
    for (let i = 0; i < 5; i++) router.recordFailure("c-break-1");
    expect(router.isChannelOpen("c-break-1")).toBe(true); // 5 次连续失败 → open
  });

  it("成功调用复位熔断器（关闭）", () => {
    for (let i = 0; i < 5; i++) router.recordFailure("c-reset-1");
    expect(router.isChannelOpen("c-reset-1")).toBe(true);
    router.recordSuccess("c-reset-1");
    expect(router.isChannelOpen("c-reset-1")).toBe(false); // 成功 → 复位
  });

  it("达到阈值前（不连续/未满）不打开", () => {
    router.recordFailure("c-part-1");
    router.recordSuccess("c-part-1"); // 复位，中断连续失败
    router.recordFailure("c-part-1");
    expect(router.isChannelOpen("c-part-1")).toBe(false); // 未满 5 次
  });

  it("冷却期过后 half-open：放行探测（isChannelOpen=false）", async () => {
    for (let i = 0; i < 5; i++) router.recordFailure("c-cool-1");
    expect(router.isChannelOpen("c-cool-1")).toBe(true);
    // 用假定时器跳过 10s 冷却期
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);
    expect(router.isChannelOpen("c-cool-1")).toBe(false); // 已过冷却 → 允许探测
    vi.useRealTimers();
  });

  it("未达阈值的失败不会打开", () => {
    router.recordFailure("c-low-1");
    router.recordFailure("c-low-1");
    expect(router.isChannelOpen("c-low-1")).toBe(false); // 仅 2 次
  });
});
