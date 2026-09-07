// ===== openai 兼容模型适配器（零依赖，直接用 fetch） =====
// 统一对多家 openai 兼容服务商（DeepSeek / OpenAI / Ollama ...）发请求。

import type { Channel } from "../config/channels";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
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
