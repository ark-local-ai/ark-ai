// ===== 对话记忆自动沉淀（M58） =====
// 从一段对话里提炼值得长期记住的「用户事实 / 偏好」，供前端在结束会话或切换会话时
// 先预览、用户确认后再落库（绝不未经确认写记忆）。
// LLM 优先（走多渠道 failover），无渠道/失败则确定性启发式抽取（有信号才抽，宁缺毋滥），
// 保证开箱可跑、不阻塞、不伪造。

import { chatWithFailover } from "../models/router";
import type { ChatMessage } from "../models/client";

const TIMEOUT_MS = 25000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("提炼超时")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
      .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function llmOnce(messages: ChatMessage[]): Promise<string> {
  return withTimeout(
    chatWithFailover(messages, { temperature: 0.3, maxTokens: 800 }, undefined).then((r) => r.text),
    TIMEOUT_MS,
  );
}

export interface MemoryCandidate {
  kind: string;
  content: string;
}

export interface DistillResult {
  candidates: MemoryCandidate[];
  /** 是否走了真实模型（false = 启发式抽取） */
  viaLLM: boolean;
  error?: string;
}

/** 纯函数：把会话消息拼成可喂给模型的紧凑对话记录（截断防爆量） */
export function buildTranscript(messages: { role: string; content: string }[]): string {
  return (messages ?? [])
    .map((m) => `${m.role === "user" ? "用户" : "助理"}：${m.content}`)
    .join("\n")
    .slice(0, 6000);
}

/** 纯函数：解析 LLM 输出的候选记忆行（「事实：…」「偏好：…」「笔记：…」），去重、过滤过短 */
const DISTILL_KIND: Record<string, string> = { 事实: "fact", 偏好: "preference", 笔记: "note" };

export function parseDistillCandidates(output: string): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();
  for (const line of (output ?? "").split("\n")) {
    const m = line.trim().match(/^(事实|偏好|笔记)[：:]\s*(.+)$/);
    if (!m) continue;
    const content = m[2].trim();
    if (content.length < 4) continue;
    const key = `${m[1]}::${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: DISTILL_KIND[m[1]], content });
  }
  return out;
}

/**
 * 确定性启发式抽取：只在「用户消息 + 有明确偏好/计划信号 + 不像指令/提问」时才抽，
 * 宁缺毋滥——因为候选会交给用户确认，这里只做第一道粗筛，尽量降低噪音。
 */
export function heuristicCandidates(messages: { role: string; content: string }[]): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  const seen = new Set<string>();
  const prefMarkers = ["喜欢", "偏好", "希望", "习惯", "倾向", "不喜欢", "讨厌", "更想", "想要"];
  const commandPrefix = /^(请|帮|帮我|做|生成|来一|写|做一|总结|翻译|打开|查|告诉我|搜|找|有没有|能不能|可不可以|我想问)/;
  for (const m of messages ?? []) {
    if (m.role !== "user") continue;
    const c = (m.content ?? "").trim();
    if (c.length < 5 || c.length > 120) continue;
    if (!prefMarkers.some((w) => c.includes(w))) continue;
    if (!/我|我们|自己|本人/.test(c)) continue;
    if (commandPrefix.test(c)) continue;
    if (!/。|，|！|\./.test(c) && c.length < 8) continue;
    const key = c;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = c.includes("不喜欢") || c.includes("讨厌") ? "preference" : "note";
    out.push({ kind, content: c.slice(0, 80) });
    if (out.length >= 6) break;
  }
  return out;
}

/** 从会话消息提炼候选记忆（不落库，前端确认后再存） */
export async function distillMemoryCandidates(
  messages: { role: string; content: string }[],
): Promise<DistillResult> {
  const transcript = buildTranscript(messages);
  const userText = (messages ?? []).filter((m) => m.role === "user").map((m) => m.content).join(" ");
  if (!(messages ?? []).some((m) => m.role === "user")) {
    return { candidates: [], viaLLM: false };
  }
  try {
    const raw = await llmOnce([
      {
        role: "system",
        content:
          "你是记忆提炼助手。从这段对话里提取值得长期记住的、关于用户的明确事实与偏好（例如职业、习惯、喜欢/不喜欢的风格、明确的长期计划或偏好）。只提取明确、可直接复用的信息，跳过寒暄、提问、临时指令、任务描述。每条用「事实：…」「偏好：…」或「笔记：…」开头，一行一条，内容精炼成一句，不要编号、不要解释。若没有值得记住的，直接输出空。" +
          `\n对话记录（${userText.length} 字）：\n${transcript}`,
      },
      { role: "user", content: "请提炼候选记忆：" },
    ]);
    const parsed = parseDistillCandidates(raw ?? "");
    if (parsed.length) return { candidates: parsed, viaLLM: true };
    return { candidates: heuristicCandidates(messages), viaLLM: false, error: "模型未产出可解析结果" };
  } catch (e) {
    return {
      candidates: heuristicCandidates(messages),
      viaLLM: false,
      error: e instanceof Error ? e.message : "提炼失败",
    };
  }
}
