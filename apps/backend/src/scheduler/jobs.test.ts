import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIsolatedStore, cleanup } from "../test/helpers";
import type * as StoreModule from "../db/store";

let store: typeof StoreModule;
let tmpDir: string;

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  tmpDir = loaded.dir;
});
afterAll(() => cleanup(tmpDir));

describe("C4 定时任务 + 模板组合（resolveAction）", () => {
  it("action='template:<id>' 解析出模板 prompt 与 AgentOptions", async () => {
    const id = store.createTaskTemplate(
      { name: "周报", prompt: "生成一份周报", expert: "数据分析师", skills: ["Excel"], model: "c1·deepseek" },
    );
    const { resolveAction } = await import("./jobs.js");
    const r = resolveAction(`template:${id}`);
    expect(r.prompt).toBe("生成一份周报");
    expect(r.opts?.expert).toBe("数据分析师");
    expect(r.opts?.skills).toEqual(["Excel"]);
    expect(r.opts?.modelHint).toBe("c1·deepseek");
  });

  it("普通 action 原样返回 prompt、无 opts", async () => {
    const { resolveAction } = await import("./jobs.js");
    const r = resolveAction("汇总昨日任务生成晨报");
    expect(r.prompt).toBe("汇总昨日任务生成晨报");
    expect(r.opts).toBeUndefined();
  });

  it("template: 指向不存在/已删模板时 prompt 为空（跑空提示词会失败并记日志）", async () => {
    const { resolveAction } = await import("./jobs.js");
    const r = resolveAction("template:ghost");
    expect(r.prompt).toBe("");
  });
});
