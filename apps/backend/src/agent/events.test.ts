import { describe, expect, it, vi } from "vitest";
import { publish, subscribe, subscribeAll } from "./events.js";

describe("events 总线", () => {
  it("按任务订阅收到该任务事件", () => {
    const fn = vi.fn();
    const unsub = subscribe("t1", fn);
    publish({ type: "plan", taskId: "t1", data: { steps: [] } });
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    publish({ type: "done", taskId: "t1", data: {} });
    expect(fn).toHaveBeenCalledTimes(1); // 退订后不再收到
  });

  it("迟订阅者能回放已发生事件", () => {
    publish({ type: "step", taskId: "t2", data: { stepId: 1 } });
    const fn = vi.fn();
    const unsub = subscribe("t2", fn);
    expect(fn).toHaveBeenCalledTimes(1); // 收到回放
    unsub();
  });

  it("subscribeAll 全局扇出（所有任务都能收到）", () => {
    const fn = vi.fn();
    const unsub = subscribeAll(fn);
    publish({ type: "deliver", taskId: "a", data: {} });
    publish({ type: "done", taskId: "b", data: {} });
    expect(fn).toHaveBeenCalledTimes(2);
    unsub();
    publish({ type: "error", taskId: "c", data: {} });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
