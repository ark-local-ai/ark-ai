// ===== 任务规划器 planner =====
// 输入需求 → 有序步骤数组。优先用已配置的 LLM 拆真步骤；
// 无渠道 / 调用失败时，降级到内建脚本计划器（按场景关键词），保证开箱可跑。

import { pickChannel, recordSuccess, recordFailure } from "../models/router";
import { chat } from "../models/client";

export interface PlannedStep {
  title: string;
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 内建脚本计划器（降级 / 无 key）----
const SCENARIOS: { keys: string[]; steps: string[] }[] = [
  {
    keys: ["ppt", "演示", "幻灯片", "slides"],
    steps: [
      "梳理内容大纲与核心信息",
      "读取/汇总数据与图表素材",
      "设计页面结构与视觉层级",
      "生成演示文稿文件",
      "校验排版并交付",
    ],
  },
  {
    keys: ["excel", "报表", "数据", "汇总", "财务", "销售", "xlsx", "表格"],
    steps: [
      "理解数据需求与字段结构",
      "读取并清洗数据",
      "生成分析/汇总与图表",
      "生成 Excel 成果文件",
      "校验公式与格式并交付",
    ],
  },
  {
    keys: ["word", "报告", "周报", "文档", "docx", "写作", "纪要", "邮件"],
    steps: [
      "理解写作主题与目标读者",
      "收集信息并拟定大纲",
      "生成初稿内容",
      "润色并生成 Word 文档",
      "校验格式并交付",
    ],
  },
  {
    keys: ["调研", "竞品", "趋势", "研究", "分析"],
    steps: [
      "明确调研目标与范围",
      "检索并收集多信息来源",
      "整理对比与要点",
      "撰写带引用的报告",
      "校验并交付",
    ],
  },
];

function scriptedPlan(prompt: string): PlannedStep[] {
  const lower = prompt.toLowerCase();
  const hit = SCENARIOS.find((s) => s.keys.some((k) => lower.includes(k)));
  const steps = (hit?.steps ?? [
    "理解需求并制定执行计划",
    "收集与组织所需信息",
    "生成成果初稿",
    "校对并交付最终文件",
  ]).map((title) => ({ title }));
  return steps;
}

// ---- LLM 拆解（JSON 输出，失败即抛 → 上层 catch 降级）----
async function llmPlan(prompt: string): Promise<PlannedStep[]> {
  const ch = pickChannel();
  if (!ch) throw new Error("未配置模型渠道");
  const sys =
    "你是任务规划器。把用户的一句话需求拆成3~6个有序执行步骤。严格只输出 JSON 数组，每项 {\"title\":\"步骤标题\",\"note\":\"该步要做什么或产出什么\"}，不要输出其它文字。";
  try {
    const raw = await chat(ch, [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ]);
    const arr = JSON.parse(raw) as { title?: string; note?: string }[];
    if (!Array.isArray(arr) || !arr.length) throw new Error("LLM 未返回有效步骤");
    recordSuccess(ch.id);
    return arr
      .filter((s) => typeof s?.title === "string" && s.title.trim())
      .slice(0, 6)
      .map((s) => ({ title: s.title!.trim(), note: s.note?.trim() }));
  } catch (e) {
    recordFailure(ch.id); // 记录失败，router 下次优选更稳渠道
    throw e;
  }
}

/** 主入口：优先 LLM，失败降级脚本。暴露 usedFallback 供编排层标记模型。 */
export async function planTask(prompt: string): Promise<{
  steps: PlannedStep[];
  viaLLM: boolean;
}> {
  try {
    await sleep(300); // 让前端先收到 plan 前能显示"规划中"
    const steps = await llmPlan(prompt);
    return { steps, viaLLM: true };
  } catch {
    return { steps: scriptedPlan(prompt), viaLLM: false };
  }
}
