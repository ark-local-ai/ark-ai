// ===== 多 Agent 协作管线（M10b）=====
// 三个角色分工，顺序执行，共同产出交付正文：
//   分析师 analyst  →  提炼关键要点 / 洞察（"要说什么"）
//   写手   writer   →  把要点展开成结构化正文 sections（"怎么说"）
//   校验   editor   →  对照需求校验并收尾（"说得对么"）
//
// 每个 Agent 都是"LLM 优先 + 脚本降级"：有渠道且调用成功用真实模型，
// 无渠道 / 失败 / 超时自动回退到各自确定性的内置逻辑，保证开箱可跑。
// 三者相对独立——一个失败不影响后续 Agent 继续尝试（鲁棒）。

import { chatWithFailover } from "../models/router";
import { defaultTool, type ToolInput } from "../tools/registry";
import type { StepContent } from "./../tools/office";

const TIMEOUT_MS = 20000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Agent 超时")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * 调模型，system+user，返回文本；内部走多渠道 failover（按成功率逐个尝试，
 * 每次成功/失败自动记统计）。全渠道失败抛错，由各 Agent 自行降级脚本。
 */
async function llmCall(sys: string, user: string, modelHint?: string): Promise<string> {
  return withTimeout(
    chatWithFailover(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { temperature: 0.5, maxTokens: 1500 },
      modelHint,
    ).then((r) => r.text),
    TIMEOUT_MS,
  );
}

export interface PipelineResult {
  sections: StepContent[];
  /** 哪些角色实际走了 LLM（供展示/日志） */
  agents: { analyst: boolean; writer: boolean; editor: boolean };
}

// ---------------- 分析师：提炼关键要点 ----------------
async function analyst(prompt: string, plan: string[], kind: string, modelHint?: string): Promise<{ points: string[]; viaLLM: boolean }> {
  try {
    const raw = await llmCall(
      "你是首席分析师。根据用户需求与执行计划，提炼 3~5 条最关键的观点/要点。严格只输出 JSON 数组，每项为字符串，不要其它文字。",
      `需求：${prompt}\n执行计划：\n${plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n交付类型：${kind}`,
      modelHint,
    );
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) throw new Error("分析师输出非数组");
    const points: string[] = [];
    for (const x of arr) {
      if (typeof x === "string") { const t = x.trim(); if (t) points.push(t); }
      if (points.length >= 6) break;
    }
    if (!points.length) throw new Error("分析师要点为空");
    return { points, viaLLM: true };
  } catch {
    return { points: keywordPoints(prompt, plan), viaLLM: false };
  }
}

/** 分析师的确定性降级：按交付类型产出要点 */
function keywordPoints(prompt: string, plan: string[]): string[] {
  const base = [
    `围绕「${prompt.slice(0, 30)}」梳理执行主线`,
    ...plan.slice(0, 4).map((p) => `关键动作：${p}`),
  ];
  return base.length ? base : ["基于需求组织内容"];
}

// ---------------- 写手：把要点展开成 sections ----------------
async function writer(
  prompt: string, plan: string[], kind: string, points: string[], modelHint?: string,
): Promise<{ sections: StepContent[]; viaLLM: boolean }> {
  try {
    const raw = await llmCall(
      "你是专业内容撰稿人。基于分析师要点，为交付文件生成正文，输出 JSON：{\"sections\":[{\"title\":\"步骤标题\",\"paragraphs\":[\"段落1\",\"段落2\"]}, ...]}。语言中文，正文具体专业可读。严格只输出 JSON。",
      `需求：${prompt}\n分析师要点：\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n交付类型：${kind}`,
      modelHint,
    );
    const parsed = JSON.parse(raw) as { sections?: { title?: string; paragraphs?: string[] }[] };
    const sections = (parsed.sections ?? [])
      .filter((s) => s?.title && Array.isArray(s.paragraphs))
      .slice(0, 12)
      .map((s) => ({ title: s.title!.trim(), paragraphs: s.paragraphs!.map((p) => p.trim()).filter(Boolean) }));
    if (!sections.length) throw new Error("写手未返回有效 section");
    return { sections, viaLLM: true };
  } catch {
    return { sections: scripted(prompt, plan, kind as "ppt" | "xls" | "doc"), viaLLM: false };
  }
}

/** 写手的确定性降级：复用 defaultTool 脚本 */
function scripted(prompt: string, plan: string[], kind: "ppt" | "xls" | "doc"): StepContent[] {
  return plan.map((title) => {
    const input: ToolInput = { prompt, plan, step: title, kind };
    const r = defaultTool.run(input);
    return { title: r.title, paragraphs: r.body };
  });
}

// ---------------- 校验：对照需求校验并收尾 ----------------
async function editor(
  prompt: string, kind: string, sections: StepContent[], modelHint?: string,
): Promise<{ sections: StepContent[]; viaLLM: boolean }> {
  // 脚本兜底：至少保留 1 个非空 section；无 LLM 时直接返回（合“校验通过”）
  const cleaned = sections.filter((s) => s.title && s.paragraphs.length);
  if (cleaned.length === 0) {
    return { sections: [{ title: "内容概览", paragraphs: [`关于「${prompt.slice(0, 30)}」的说明。`] }], viaLLM: false };
  }
  try {
    const raw = await llmCall(
      `你是编辑/校对。对下面的交付内容做最终校验：修正明显错误、补一句「结论」到最后一个 section 的 paragraphs 末尾。保持原 JSON 结构 {"sections":[...]}，不要丢失内容，不要加标题之外的结构。严格只输出 JSON。`,
      `需求：${prompt}\n交付类型：${kind}\n当前内容：\n${JSON.stringify(cleaned)}`,
      modelHint,
    );
    const parsed = JSON.parse(raw) as { sections?: { title?: string; paragraphs?: string[] }[] };
    const out = (parsed.sections ?? [])
      .filter((s) => s?.title && Array.isArray(s.paragraphs))
      .map((s) => ({ title: s.title!.trim(), paragraphs: s.paragraphs!.map((p) => p.trim()).filter(Boolean) }));
    if (!out.length) throw new Error("编辑输出为空");
    return { sections: out, viaLLM: true };
  } catch {
    return { sections: cleaned, viaLLM: false };
  }
}

/** 多 Agent 内容管线：分析 → 写 → 校验，返回最终 sections。C2：可带 modelHint 偏好模型 */
export async function runContentPipeline(
  prompt: string,
  plan: string[],
  kind: "ppt" | "xls" | "doc",
  modelHint?: string,
): Promise<PipelineResult> {
  // 分析师
  const { points, viaLLM: analystLLM } = await analyst(prompt, plan, kind, modelHint);
  // 写手（依赖分析师要点）
  const { sections, viaLLM: writerLLM } = await writer(prompt, plan, kind, points, modelHint);
  // 校验
  const { sections: finalSections, viaLLM: editorLLM } = await editor(prompt, kind, sections, modelHint);

  return {
    sections: finalSections,
    agents: { analyst: analystLLM, writer: writerLLM, editor: editorLLM },
  };
}
