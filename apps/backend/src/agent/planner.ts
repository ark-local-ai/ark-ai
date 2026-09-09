// ===== 任务规划器 planner =====
// 输入需求 → 有序步骤数组。优先用已配置的 LLM 拆真步骤；
// 无渠道 / 调用失败时，降级到内建脚本计划器（按场景关键词），保证开箱可跑。

import { chatWithFailover } from "../models/router";

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
async function llmPlan(prompt: string, modelHint?: string): Promise<{ steps: PlannedStep[]; model: string }> {
  const sys =
    "你是任务规划器。把用户的一句话需求拆成3~6个有序执行步骤。严格只输出 JSON 数组，每项 {\"title\":\"步骤标题\",\"note\":\"该步要做什么或产出什么\"}，不要输出其它文字。";
  // M14：多渠道 failover——按成功率逐个尝试，直到某渠道成功（成功/失败自动记统计）
  // C2：模板可带 modelHint（偏好的模型，非排他），命中渠道优先尝试
  const { text, channel, model } = await chatWithFailover(
    [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
    {},
    modelHint,
  );
  const arr = JSON.parse(text) as { title?: string; note?: string }[];
  if (!Array.isArray(arr) || !arr.length) throw new Error("LLM 未返回有效步骤");
  const steps = arr
    .filter((s) => typeof s?.title === "string" && s.title.trim())
    .slice(0, 6)
    .map((s) => ({ title: s.title!.trim(), note: s.note?.trim() }));
  return { steps, model: `${channel} · ${model}` };
}

/** 主入口：优先 LLM，失败降级脚本。暴露 viaLLM / model 供编排层标记。
 *  C2：modelHint=模板偏好的模型（传染给 llmPlan 的 failover 排序）。 */
export async function planTask(prompt: string, modelHint?: string): Promise<{
  steps: PlannedStep[];
  viaLLM: boolean;
  model: string;
}> {
  try {
    await sleep(300); // 让前端先收到 plan 前能显示"规划中"
    const { steps, model } = await llmPlan(prompt, modelHint);
    return { steps, viaLLM: true, model };
  } catch {
    return { steps: scriptedPlan(prompt), viaLLM: false, model: "内置计划器" };
  }
}
