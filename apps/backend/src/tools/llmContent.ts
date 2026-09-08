// ===== LLM 真内容生成（M10 方向 a）=====
// 用已配置模型生成交付文件的真实正文，替换 defaultTool 的占位脚本文案。
// LLM 不可用 / 未配 key / 超时 → 降级回脚本模板（defaultTool），保证开箱可跑。
//
// 体验设计：中间步骤的 SSE 实时推送仍走轻量脚本（无外部延迟），
// 仅在最终生成交付前，一次性用 LLM 生成结构化正文（每步 title + paragraphs），
// 再注入 genOffice。一次调用省 token、也更稳（免逐步多次外部请求抖动）。

import { pickChannel, recordSuccess, recordFailure } from "../models/router";
import { chat } from "../models/client";
import { defaultTool, type ToolInput } from "./registry";
import type { StepContent } from "./office";

const LLM_TIMEOUT_MS = 20000;

/** 让一个 Promise 限时；超时抛错（上层 catch 后降级） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("LLM 生成超时")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * 用 LLM 生成整篇交付正文；失败/无渠道降级脚本模板。
 * 返回与步骤一一对应的 StepContent[]（可能比 plan 短或长，由 LLM 定）。
 */
export async function generateContent(
  prompt: string,
  plan: string[],
  kind: "ppt" | "xls" | "doc",
): Promise<{ sections: StepContent[]; viaLLM: boolean }> {
  const ch = pickChannel();
  if (!ch) {
    // 无渠道 → 脚本降级
    return { sections: scripted(prompt, plan, kind), viaLLM: false };
  }

  const sys =
    `你是专业内容撰稿人。根据用户需求与执行计划，生成交付文件内容为 JSON。
    格式：{"sections":[{"title":"步骤标题","paragraphs":["段落1","段落2"]}, ...]}
    每个 section 对应执行计划的一步。语言用中文，正文要具体、专业、可读，不要空话。
    严格只输出 JSON，不要其它文字。`;

  try {
    const raw = await withTimeout(
      chat(ch, [
        { role: "system", content: sys },
        { role: "user", content: `需求：${prompt}\n执行计划：\n${plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n交付类型：${kind}` },
      ], { temperature: 0.5, maxTokens: 1600 }),
      LLM_TIMEOUT_MS,
    );
    const parsed = JSON.parse(raw) as { sections?: { title?: string; paragraphs?: string[] }[] };
    const sections = (parsed.sections ?? [])
      .filter((s) => s?.title && Array.isArray(s.paragraphs))
      .slice(0, 12)
      .map((s) => ({ title: s.title!.trim(), paragraphs: s.paragraphs!.map((p) => p.trim()).filter(Boolean) }));
    if (!sections.length) throw new Error("LLM 未返回有效 section");
    recordSuccess(ch.id);
    return { sections, viaLLM: true };
  } catch (e) {
    recordFailure(ch.id);
    // 降级脚本
    return { sections: scripted(prompt, plan, kind), viaLLM: false };
  }
}

/** 脚本降级：复用 defaultTool 逐步骤生成（确定性、零依赖） */
function scripted(prompt: string, plan: string[], kind: "ppt" | "xls" | "doc"): StepContent[] {
  return plan.map((title) => {
    const input: ToolInput = { prompt, plan, step: title, kind };
    const r = defaultTool.run(input);
    return { title: r.title, paragraphs: r.body };
  });
}
