import { describe, expect, it } from "vitest";
import { looksLikeTask, parseRemember } from "./chat";

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

describe("记忆命令解析（M42 parseRemember）", () => {
  it("普通消息返回 null（不触发记记忆）", () => {
    expect(parseRemember("你好")).toBeNull();
    expect(parseRemember("帮我做份报告")).toBeNull();
    expect(parseRemember("")).toBeNull();
  });

  it("`/记得 内容` 存为默认 note", () => {
    expect(parseRemember("/记得 用户偏好暖色界面")).toEqual({ content: "用户偏好暖色界面", kind: undefined });
  });

  it("`/记得 [偏好] 内容` 带 kind 标签", () => {
    expect(parseRemember("/记得[偏好] 喜欢暖茶褐配色")).toEqual({ content: "喜欢暖茶褐配色", kind: "preference" });
    expect(parseRemember("/记得 [事实] 团队5个人")).toEqual({ content: "团队5个人", kind: "fact" });
    expect(parseRemember("/记得 [笔记] 明天开会")).toEqual({ content: "明天开会", kind: "note" });
  });

  it("只有命令没有内容返回 null", () => {
    expect(parseRemember("/记得")).toBeNull();
    expect(parseRemember("/记得  ")).toBeNull();
  });
});
