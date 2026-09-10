// ===== 文本加工工具（M54：搜索结果的后续加工——总结 / 翻译） =====
// 把「已读到的正文」就地加工：总结（浓缩要点）、翻译（转成目标语言）。
// LLM 优先（走多渠道 failover），无渠道/失败/超时则确定性降级（总结=截取首段，
// 翻译=原样返回+提示），保证开箱可跑、不阻塞。
//
// 供资料库搜索面板「总结 / 翻译」按钮调用，产物可直接存进资料库复用。

import { chatWithFailover } from "../models/router";
import type { ChatMessage } from "../models/client";

const TIMEOUT_MS = 25000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("加工超时")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function llmOnce(messages: ChatMessage[], modelHint?: string): Promise<string> {
  return withTimeout(
    chatWithFailover(messages, { temperature: 0.4, maxTokens: 1200 }, modelHint).then((r) => r.text),
    TIMEOUT_MS,
  );
}

export interface RefineResult {
  kind: "summarize" | "translate";
  text: string;
  /** 是否走了真实模型（false = 确定性降级） */
  viaLLM: boolean;
  error?: string;
}

// ---- 总结：浓缩成要点 ----
export async function summarizeText(
  src: string,
  opts: { title?: string; lang?: string; maxLen?: number; modelHint?: string } = {},
): Promise<RefineResult> {
  const title = (opts.title ?? "").trim();
  const lang = (opts.lang ?? "中文").trim();
  const maxLen = opts.maxLen ?? 300;
  const body = (src ?? "").trim();
  if (!body) return { kind: "summarize", text: "", viaLLM: false, error: "内容为空" };
  const srcClamped = body.length > 6000 ? body.slice(0, 6000) + "\n…（超长已截断）" : body;
  const buf = title ? `标题：${title}\n` : "";
  try {
    const raw = await llmOnce([
      { role: "system", content: `你是资料提炼助手。把下面资料总结成 ${maxLen} 字以内的 ${lang} 要点，分条列出，语气中性、只保留事实与关键信息，不发表观点。直接输出要点，不要解释过程。` },
      { role: "user", content: `${buf}资料内容：\n${srcClamped}` },
    ], opts.modelHint);
    const text = (raw ?? "").trim();
    if (!text.length) throw new Error("总结结果为空");
    return { kind: "summarize", text, viaLLM: true };
  } catch (e) {
    // 确定性降级：截取正文开头若干字符作为概述
    const first = body.replace(/\s+/g, " ").trim().slice(0, maxLen);
    return { kind: "summarize", text: first || "（正文太短，无法摘要）", viaLLM: false, error: e instanceof Error ? e.message : "加工失败" };
  }
}

// ---- 翻译：转成目标语言 ----
export async function translateText(
  src: string,
  opts: { title?: string; to?: string; modelHint?: string } = {},
): Promise<RefineResult> {
  const to = (opts.to ?? "").trim() || "简体中文";
  const body = (src ?? "").trim();
  if (!body) return { kind: "translate", text: "", viaLLM: false, error: "内容为空" };
  const srcClamped = body.length > 6000 ? body.slice(0, 6000) + "\n…（超长已截断）" : body;
  try {
    const raw = await llmOnce([
      { role: "system", content: `你是专业翻译。把下面的资料翻译成 ${to}。保留原文结构与关键术语，翻译要通顺准确，直接输出译文，不要加说明。` },
      { role: "user", content: srcClamped },
    ], opts.modelHint);
    const text = (raw ?? "").trim();
    if (!text.length) throw new Error("译文为空");
    return { kind: "translate", text, viaLLM: true };
  } catch (e) {
    // 降级：无模型时无法翻译，原样返回并提示
    return { kind: "translate", text: body, viaLLM: false, error: `翻译需模型支持，暂未可用：${e instanceof Error ? e.message : "失败"}` };
  }
}

/** 统一入口：kind + src 分派到 总结/翻译 */
export async function refineText(
  kind: "summarize" | "translate",
  src: string,
  opts: { title?: string; lang?: string; to?: string; maxLen?: number; modelHint?: string } = {},
): Promise<RefineResult> {
  return kind === "translate"
    ? translateText(src, { title: opts.title, to: opts.to, modelHint: opts.modelHint })
    : summarizeText(src, { title: opts.title, lang: opts.lang, maxLen: opts.maxLen, modelHint: opts.modelHint });
}
