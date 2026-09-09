import { describe, expect, it } from "vitest";
import { looksLikeTask } from "./chat";

describe("对话式任务意图检测（M40 looksLikeTask）", () => {
  it("命中「动作 + 产出物」视为任务请求", () => {
    expect(looksLikeTask("帮我做一份周报")).toBe(true);
    expect(looksLikeTask("生成一个 PPT")).toBe(true);
    expect(looksLikeTask("来一份市场分析报告")).toBe(true);
    expect(looksLikeTask("总结这份文档")).toBe(true);
  });

  it("只有动作或只有产出物都不算（防止闲聊误触发）", () => {
    expect(looksLikeTask("你好")).toBe(false);
    expect(looksLikeTask("今天的报告看了吗")).toBe(false);
    expect(looksLikeTask("ppt")).toBe(false);
    expect(looksLikeTask("帮我一下")).toBe(false);
    expect(looksLikeTask("")).toBe(false);
  });
});
