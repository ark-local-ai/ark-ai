// ===== 连接器状态 API =====
// GET /api/connectors —— 各连接器的真实在线/可达状态。
//   · 模型渠道：DB 有的渠道数（有即在线）
//   · Ollama 本地：实测 GET http://localhost:11434/api/tags（真实可达性）
//   · 联网搜索 / 内置浏览器 / IM 桥：尚未接入（如实标记未接入，不假在线）
// 演进：联网搜索/浏览器/IM 桥接入后各自实现真实探测。

import type { FastifyInstance } from "fastify";
import { getChannels, getDefaultChannel } from "../config/channels";

async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ConnectorStatus {
  name: string;
  online: boolean;
  note: string;
  dot: string;
}

export async function connectorRoutes(app: FastifyInstance) {
  app.get("/", async (): Promise<ConnectorStatus[]> => {
    const channels = getChannels();
    const def = getDefaultChannel();
    const ollamaOnline = await probeOllama();

    return [
      {
        name: "模型渠道",
        online: channels.length > 0,
        note: `${channels.length} 个渠道${def ? ` · 默认 ${def.name}` : ""}`,
        dot: channels.length > 0 ? "#16A34A" : "#B6B7C4",
      },
      {
        name: "Ollama 本地",
        online: ollamaOnline,
        note: ollamaOnline ? "已连通 · 可本地运行" : "未检测到（未启动 / 非 11434）",
        dot: ollamaOnline ? "#16A34A" : "#B6B7C4",
      },
      { name: "联网搜索", online: false, note: "未接入", dot: "#B6B7C4" },
      { name: "内置浏览器", online: false, note: "未接入", dot: "#B6B7C4" },
      { name: "IM 桥", online: false, note: "未接入", dot: "#B6B7C4" },
    ];
  });
}
