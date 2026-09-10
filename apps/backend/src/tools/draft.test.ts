import { describe, expect, it } from "vitest";
import { draftSections } from "./draft";

describe("无模型场景化草稿生成（M65 draftSections）", () => {
  it("报告/分析场景：命中报告骨架，含开头总览与结论收束", () => {
    const s = draftSections("帮我做一份竞品市场分析报告", ["收集数据", "对比分析"], "doc");
    // 开头第一段应包含需求字样（非复读计划）
    expect(s[0].paragraphs.some((p) => p.includes("竞品市场分析"))).toBe(true);
    // 末节为结论
    expect(s[s.length - 1].title).toBe("结论");
    expect(s[s.length - 1].paragraphs.some((p) => p.includes("建议"))).toBe(true);
    // 每个 section 正文非空、非占位复读
    for (const sec of s) expect(sec.paragraphs.length).toBeGreaterThan(0);
  });

  it("纪要/会议场景命中纪要骨架", () => {
    const s = draftSections("整理会议纪要", [], "doc");
    const joined = s.map((x) => x.title).join("|");
    expect(joined).toContain("要点");
    expect(joined).toContain("待办");
  });

  it("xls 类型返回与执行计划对齐的按行 section（去掉冗余包裹）", () => {
    const s = draftSections("做一个销售数据报表", ["清洗", "汇总", "出图"], "xls");
    // xls 下 section 数 = 计划步骤数
    expect(s).toHaveLength(3);
    expect(s[0].paragraphs.length).toBeGreaterThan(0);
  });

  it("未知场景回落通用骨架", () => {
    const s = draftSections("你好帮我写点东西", [], "doc");
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].paragraphs.length).toBeGreaterThan(0);
  });
});
