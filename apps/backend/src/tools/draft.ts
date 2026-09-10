// ===== 无模型场景化草稿生成（M65） =====
// 目的：没有 LLM（或 LLM 全部失败）时，让交付文件不再是「复读需求 + 复读执行计划」的空壳，
// 而是按常见任务场景产出「结构完整、内容可用的第一版草稿」——开箱即有可读的正文。
// 场景由 prompt 关键词判定（报告/纪要/方案/分析/周报/培训等），未命中回落到通用骨架。
// 与 registry.defaultTool 的区别：defaultTool 几乎照抄 plan 步骤当正文；这里针对场景
// 生成有开头、有分节正文、有结论的 section，读起来像一份真实草稿而非计划清单。

import type { StepContent } from "./office";

export type DraftKind = "ppt" | "xls" | "doc";

interface ScenarioDef {
  keys: string[];
  /** 标题措辞：把 prompt 加工成各分节标题的思路 */
  titles: string[];
  /** 给每个分节生成正文段（idx 为该分节序号，prompt 为原始需求） */
  body: (prompt: string, idx: number, total: number) => string[];
  /** 结尾收束段 */
  closing: (prompt: string) => string;
  /** 开头总览段 */
  intro: (prompt: string) => string;
}

const SCENARIOS: ScenarioDef[] = [
  {
    // 报告 / 分析 / 调研 / 竞品 / 市场
    keys: ["报告", "分析", "调研", "竞品", "市场", "评估", "研究", "review", "insight"],
    titles: ["背景与目标", "现状梳理", "关键发现", "问题与机会", "结论与建议"],
    intro: (p) => `围绕「${p}」本篇对该议题的背景、现状、发现与建议作系统梳理，以下为可直接编辑的初稿。`,
    body: (p, idx, total) => [
      `${p.slice(0, 40)}是本次分析的核心议题，本小节从执行视角说明其要点。`,
      `这里展开第 ${idx + 1}/${total} 部分的内容，可结合你自己的数据、图表与案例替换或补充，形成更具体的论证。`,
      "必要时补充以下明细：关键指标、对比对象、时间范围与数据来源。",
    ],
    closing: (p) => `总体来看，围绕「${p}」建议按上述要点推进，并持续以数据校准结论。`,
  },
  {
    // 方案 / 计划 / 提案 / 规划
    keys: ["方案", "计划", "提案", "规划", "路线", "roadmap", "方案建议"],
    titles: ["目标与范围", "总体思路", "实施步骤", "资源与风险", "时间安排"],
    intro: (p) => `本方案面向「${p}」提出目标、思路、实施步骤与时间安排，以下为可编辑的初稿框架。`,
    body: (p, idx, total) => [
      `第 ${idx + 1}/${total} 步：围绕「${p}」的具体行动要点与交付物说明。`,
      "此处可补充责任人、工具、里程碑与验收标准，使方案更可落地。",
      "如有依赖条件或前置事项，请在此列出，便于排期与评估。",
    ],
    closing: (p) => `方案建议按上述阶段推进，先跑通关键路径再逐步细化。`,
  },
  {
    // 纪要 / 会议 / 讨论
    keys: ["纪要", "会议", "讨论", "meeting", "周会", "复盘"],
    titles: ["会议基本信息", "讨论要点", "决议事项", "待办与责任人", "下轮跟进"],
    intro: (p) => `本纪要围绕「${p}」整理讨论要点、决议与待办。`,
    body: (p, idx, total) => [
      `本次讨论第 ${idx + 1}/${total} 项：「${p}」相关的要点与共识记录。`,
      "记录不同意见或待澄清问题，避免遗漏结论背后的原因。",
      "如需可补记发言人、时间与后续行动。",
    ],
    closing: (p) => `后续按上述待办推进，下次会议核对完成情况。`,
  },
  {
    // 培训 / 教程 / 课件 / 讲稿
    keys: ["培训", "教程", "课件", "讲稿", "教学", "培训课件", "指导"],
    titles: ["课程导入", "核心要点", "案例示范", "练习与答疑", "总结回顾"],
    intro: (p) => `本讲稿围绕「${p}」组织课程导入、要点、案例与总结，可直接作为教学/分享资料。`,
    body: (p, idx, total) => [
      `第 ${idx + 1}/${total} 部分：围绕「${p}」的核心讲解内容。`,
      "可补充示意图、操作步骤或互动问题，帮助听众理解与参与。",
      "建议用简单例子解释关键概念，降低理解门槛。",
    ],
    closing: (p) => `回顾本次关于「${p}」的要点，并布置下一步练习以巩固理解。`,
  },
];

// 通用骨架：未命中场景时的兜底
const FALLBACK: ScenarioDef = {
  keys: [],
  titles: ["背景", "执行内容", "细节说明", "小结"],
  intro: (p) => `针对「${p}」整理以下内容草稿，正文可直接编辑。`,
  body: (p, idx) => [
    `本节为「${p}」相关内容的第 ${idx + 1} 部分，可据此展开具体论述。`,
  ],
  closing: (p) => `以上为关于「${p}」的草稿要点，可按需细化。`,
};

function pickScenario(prompt: string): ScenarioDef {
  const lower = prompt.toLowerCase();
  for (const s of SCENARIOS) {
    if (s.keys.some((k) => lower.includes(k))) return s;
  }
  return FALLBACK;
}

/**
 * 按场景生成无模型草稿 sections。
 * sections 数量与会话计划步骤对齐（每步一节），另加开头总览与结尾收束。
 * kind 用于决定 section 数量口径（ppt 每步一页、doc 分节、xls 每行一节）。
 */
export function draftSections(prompt: string, plan: string[], kind: DraftKind): StepContent[] {
  const sc = pickScenario(prompt);
  const sectionTitles = plan.length && plan.length <= 6 ? plan : sc.titles;
  const total = sectionTitles.length;

  const sections: StepContent[] = [
    { title: sc.titles[0], paragraphs: [sc.intro(prompt)] },
    ...sectionTitles.map((title, i) => ({
      title,
      paragraphs: sc.body(prompt, i + 1, total),
    })),
    { title: "结论", paragraphs: [sc.closing(prompt)] },
  ];

  // Excel 只需按行表述，去掉冗余的开头/结尾以保持表格简洁
  if (kind === "xls") {
    return sectionTitles.map((title, i) => ({
      title,
      paragraphs: [...sc.body(prompt, i + 1, total), ...(i === 0 ? [sc.intro(prompt)] : [])],
    }));
  }
  return sections;
}
