// ===== openai 兼容模型适配器（零依赖，直接用 fetch） =====
// 统一对多家 openai 兼容服务商（DeepSeek / OpenAI / Ollama ...）发请求。

import type { Channel } from "../config/channels";

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** 单次调用超时（默认 30s）。failover 用；避免一个无响应的渠道拖住整次尝试。 */
  timeoutMs?: number;
}

/** 单轮补全（非流式），返回文本。失败抛错由调用方决定降级。 */
export async function chat(
  ch: Channel,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  if (!ch.baseUrl) throw new Error("渠道缺少 baseUrl");
  const endpoint = `${ch.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ch.apiKey ? { Authorization: `Bearer ${ch.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: ch.model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 2048,
      stream: false,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`模型调用失败 ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("模型返回为空");
  return text;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 流式补全（openai 兼容 SSE）。逐 token 回调 onDelta，结束返回累计文本。
 * 失败抛错由调用方决定降级。Ollama 也兼容该 SSE 协议。
 */
export async function chatStream(
  ch: Channel,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  opts: ChatOptions = {},
): Promise<string> {
  if (!ch.baseUrl) throw new Error("渠道缺少 baseUrl");
  const endpoint = `${ch.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ch.apiKey ? { Authorization: `Bearer ${ch.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: ch.model,
      messages,
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text();
    throw new Error(`模型流式调用失败 ${res.status}: ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith("data:")) continue;
      const payload = l.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
  return full;
}
