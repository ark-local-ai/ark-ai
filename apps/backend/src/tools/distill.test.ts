import { describe, expect, it } from "vitest";
import {
  buildTranscript, parseDistillCandidates, heuristicCandidates,
} from "./distill";

describe("buildTranscript（M58）", () => {
  it("把用户/助理消息拼成『用户/助理：』紧凑记录并截断", () => {
    const t = buildTranscript([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好呀" },
    ]);
    expect(t).toContain("用户：你好");
    expect(t).toContain("助理：你好呀");
    expect(t.indexOf("用户")).toBeLessThan(t.indexOf("助理"));
  });

  it("空/undefined 输入返回空串", () => {
    expect(buildTranscript([] as never)).toBe("");
    expect(buildTranscript(undefined as never)).toBe("");
  });
});

describe("parseDistillCandidates（M58）", () => {
  it("解析『事实/偏好/笔记：内容』行并映射 kind", () => {
    const out = parseDistillCandidates("事实：用户是产品经理\n偏好：喜欢简洁的深色 PPT\n笔记：项目代号 ark");
    expect(out).toEqual([
      { kind: "fact", content: "用户是产品经理" },
      { kind: "preference", content: "喜欢简洁的深色 PPT" },
      { kind: "note", content: "项目代号 ark" },
    ]);
  });

  it("忽略过短、无标注、重复行；容忍全角冒号", () => {
    const out = parseDistillCandidates("偏好：好\n随便一行\n偏好：喜欢深色\n偏好：喜欢深色\n事实：  未来会长期远程办公  ");
    expect(out).toHaveLength(2);
  });
});

describe("heuristicCandidates（M58）", () => {
  const base = [
    { role: "user", content: "我喜欢简洁的深色 PPT 风格，报告尽量别用花哨动画。" },
    { role: "assistant", content: "好的，记下了。" },
    { role: "user", content: "帮我生成一份季度报告" }, // 指令，不应抽
    { role: "user", content: "你喜欢什么颜色？" }, // 提问，无「我」偏好 → 不抽
  ];
  it("抽取带明确偏好信号的用户陈述，跳过指令/提问/寒暄", () => {
    const out = heuristicCandidates(base as never);
    expect(out.some((c) => c.content.includes("深色 PPT"))).toBe(true);
    expect(out.some((c) => c.content.includes("季度报告"))).toBe(false);
    expect(out.some((c) => c.content.includes("什么颜色"))).toBe(false);
  });

  it("上限 6 条、去重、空输入返回空", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: "user",
      content: `我平时喜欢${i}号配色方案，希望以后都能沿用这种风格。`,
    }));
    const out = heuristicCandidates(many as never);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(heuristicCandidates([] as never)).toHaveLength(0);
  });
});
