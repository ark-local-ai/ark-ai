import { describe, expect, it } from "vitest";
import { looksLikeTask, parseRemember, parseMemRecall, extractMemRefs, parseProfile, buildProfileItems } from "./chat";

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

describe("记忆主动检索（M55 parseMemRecall）", () => {
  it("`/记忆 关键词` 解析出关键词", () => {
    expect(parseMemRecall("/记忆 暖色")).toEqual({ keyword: "暖色" });
    expect(parseMemRecall("/记忆   配色")).toEqual({ keyword: "配色" });
  });

  it("`/记忆` 与普通消息解析", () => {
    expect(parseMemRecall("/记忆")).toEqual({ keyword: "" }); // 留空 → 列最近
    expect(parseMemRecall("/记忆  ")).toEqual({ keyword: "" });
    expect(parseMemRecall("你好")).toBeNull(); // 非命令
    expect(parseMemRecall("帮我做个报告")).toBeNull();
  });
});

describe("引用记忆标记（M55 extractMemRefs）", () => {
  it("抽取 `📌 引用记忆：内容` 行（去重）", () => {
    const refs = extractMemRefs(
      "帮我看看\n📌 引用记忆：用户偏好暖米白配色\n📌 引用记忆：用户偏好暖米白配色\n📌 引用记忆：团队 5 个人",
    );
    expect(refs).toEqual(["用户偏好暖米白配色", "团队 5 个人"]);
  });

  it("无标记返回空数组", () => {
    expect(extractMemRefs("普通消息")).toEqual([]);
    expect(extractMemRefs("")).toEqual([]);
  });
});

describe("用户档案命令（M62 parseProfile / buildProfileItems）", () => {
  it("`/档案`（含变体）识别为档案命令，普通消息不是", () => {
    expect(parseProfile("/档案")).toBe(true);
    expect(parseProfile("/档案 ")).toBe(true);
    expect(parseProfile("/档案 我想看看")).toBe(true);
    expect(parseProfile("我的档案")).toBe(false);
    expect(parseProfile("你好")).toBe(false);
    expect(parseProfile("/记得 偏好")).toBe(false);
  });

  it("buildProfileItems 标注过期并透出来源", () => {
    const items = buildProfileItems([
      { id: "a", kind: "preference", content: "喜欢暖色", source: "chat:abc", created: "", expires_at: Date.now() + 60000 },
      { id: "b", kind: "fact", content: "团队五人", source: "chat-distill:xyz", created: "", expires_at: Date.now() - 1000 },
    ]);
    expect(items[0].expired).toBe(false);
    expect(items[0].source).toBe("chat:abc");
    expect(items[1].expired).toBe(true);
    expect(items[1].source).toBe("chat-distill:xyz");
  });
});
