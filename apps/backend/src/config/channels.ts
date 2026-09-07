// ===== 模型渠道配置（本地，数据不出本机） =====
// 读环境变量 ARK_CHANNELS（JSON 数组）或 ARK_* 单渠道回退，全部本机。
// 渠道结构对齐前端 settings 页：{ id, name, proto, model, url, apiKey, baseUrl }

export interface Channel {
  id: string;
  name: string;
  /** openai | anthropic（当前实现 openai 兼容） */
  proto: "openai" | "anthropic";
  model: string;
  url?: string;
  baseUrl?: string;
  apiKey?: string;
  default?: boolean;
}

function parseChannels(): Channel[] {
  const raw = process.env.ARK_CHANNELS;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Channel[];
      if (Array.isArray(arr) && arr.length) return arr;
    } catch {
      // 忽略坏 JSON，走单渠道回退
    }
  }
  // 单渠道回退：ARK_BASE_URL / ARK_API_KEY / ARK_MODEL / ARK_PROTO
  const fallback: Channel = {
    id: "env",
    name: "环境变量渠道",
    proto: (process.env.ARK_PROTO as Channel["proto"]) || "openai",
    model: process.env.ARK_MODEL || "deepseek-chat",
    baseUrl: process.env.ARK_BASE_URL || "https://api.deepseek.com/v1",
    apiKey: process.env.ARK_API_KEY,
  };
  return fallback.apiKey ? [fallback] : [];
}

let cache: Channel[] | null = null;
export function getChannels(): Channel[] {
  if (cache) return cache;
  cache = parseChannels();
  return cache;
}

/** 取默认渠道（没 key 时返回 null → 调用方走脚本降级） */
export function getDefaultChannel(): Channel | null {
  return getChannels().find((c) => c.default) ?? getChannels()[0] ?? null;
}
