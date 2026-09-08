// ===== 工具注册表 Tool Registry =====
// 为"真 Agent"执行层提供统一工具接口：{ name, describe, run(input) -> output }。
// 编排层不关心具体实现，只按注册表调用——这是可扩展性的关键：
// 新工具 = 注册一个实现，Agent 即可使用（见 6-架构技术栈图 / 2-面试准备指南）。
//
// 当前为"确定性脚本工具"（本地、零依赖、无 key 可跑），产出每个步骤的真实输出，
// 由 orchestrator 收进结构化结果、注入最终 Office 交付文件（取代占位文案）。
// 后续可将 run 替换为 LLM 调用 / 联网检索等真实实现，接口不变。

export interface ToolInput {
  prompt: string;
  /** 完整执行计划（步骤标题数组），供每一步做上下文关联 */
  plan: string[];
  /** 当前正在执行的步骤标题 */
  step: string;
  /** 交付文件类型，决定正文结构 */
  kind: "ppt" | "xls" | "doc";
}

export interface ToolResult {
  title: string;
  /** 该步产出的正文段（最终会被写入 Office 交付 / 作为 artifact） */
  body: string[];
  kind: "ppt" | "xls" | "doc";
}

export interface Tool {
  name: string;
  describe: string;
  run(input: ToolInput): ToolResult;
}

// 场景化内容生成器：根据交付类型产出对应结构的正文，避免每步都是同一句废话。
const BODY: Record<
  "ppt" | "xls" | "doc",
  (prompt: string, plan: string[], step: string) => string[]
> = {
  ppt: (prompt, plan) => [
    `目标：${prompt}`,
    ...plan.map((t, i) => `${i + 1}. ${t}`),
    "以上为本次演示的核心结构，内容可在 PPT 中直接编辑调整。",
  ],
  xls: (prompt, plan) => [
    `说明：${prompt}`,
    "本工作表由 Ark 编排层生成，含原生的步骤清单（可加公式自动统计）。",
    ...plan.map((t, i) => `步骤${i + 1}：${t}`),
  ],
  doc: (prompt, plan) => [
    `一、需求：${prompt}`,
    "二、执行计划：",
    ...plan.map((t, i) => `${i + 1}. ${t}`),
    "三、说明：本文件由 Ark 本地 AI 工作台自动生成，正文可直接编辑。",
  ],
};

/**
 * 默认工具：把需求 + 执行计划整理成该步要写入交付的内容。
 * 这是无 key / 本地优先下的确定性实现；接入真实 LLM 后只需替换此注册表内实现。
 */
export const defaultTool: Tool = {
  name: "内容整编",
  describe: "根据需求与执行计划，生成交付文件该步骤的内容段",
  run: ({ prompt, plan, kind, step }) => ({
    title: step,
    kind,
    body: BODY[kind](prompt, plan, step),
  }),
};

// ---- 注册表：目前注册 1 个工具；后续在此追加（联网检索 / 图表 / 文件读写 / LLM 生成）----
const registry: Map<string, Tool> = new Map([[defaultTool.name, defaultTool]]);

export function getTool(name: string): Tool | undefined {
  return registry.get(name);
}

export function listTools(): Tool[] {
  return [...registry.values()];
}
