// ===== 模型渠道（DB 持久化，本地优先） =====
// 渠道存 SQLite `channels` 表，可增删改、设默认、验活；进程重启不丢。
// 首次启动（表为空）时，用环境变量 ARK_* / ARK_CHANNELS 引导，否则内置 6 个默认目录。

import { db } from "../db/store";

export interface Channel {
  id: string;
  name: string;
  proto: "openai" | "anthropic";
  model: string;
  baseUrl: string;
  apiKey?: string;
  default?: boolean;
  /** 用户优先级 0-100，默认 50；越高越优先（路由加权用） */
  priority?: number;
  /** 每千 token 成本（约 $），默认 0=未设置；越低越优先，本地(Ollama)填 0 表示近乎免费 */
  cost?: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    proto TEXT NOT NULL DEFAULT 'openai',
    model TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
  );
`);

// 迁移：旧库补 priority / cost 列（须在建表之后执行，全新库已在建表含列则跳过）
const chCols = db.prepare(`PRAGMA table_info(channels)`).all() as { name: string }[];
if (!chCols.some((c) => c.name === "priority")) {
  db.exec(`ALTER TABLE channels ADD COLUMN priority INTEGER NOT NULL DEFAULT 50`);
}
if (!chCols.some((c) => c.name === "cost")) {
  db.exec(`ALTER TABLE channels ADD COLUMN cost REAL NOT NULL DEFAULT 0`);
}

const BUILTIN: Omit<Channel, "id">[] = [
  { name: "DeepSeek", proto: "openai", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1", apiKey: "" },
  { name: "通义 Qwen", proto: "openai", model: "qwen-max", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "" },
  { name: "智谱 GLM", proto: "openai", model: "glm-4-plus", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "" },
  { name: "Kimi", proto: "openai", model: "moonshot-v1-32k", baseUrl: "https://api.moonshot.cn/v1", apiKey: "" },
  { name: "Ollama 本地", proto: "openai", model: "qwen3:14b", baseUrl: "http://localhost:11434/v1", apiKey: "" },
  { name: "Anthropic Claude", proto: "anthropic", model: "claude-sonnet-5", baseUrl: "https://api.anthropic.com/v1", apiKey: "" },
];

function seedFromEnv(): void {
  const raw = process.env.ARK_CHANNELS;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Channel[];
      if (Array.isArray(arr) && arr.length) {
        arr.forEach((c, i) => insertRow(c, i === 0));
        return;
      }
    } catch {
      // 忽略坏 JSON，走单/内置
    }
    return;
  }
  // 单渠道回退：ARK_BASE_URL / ARK_API_KEY / ARK_MODEL / ARK_PROTO
  if (process.env.ARK_BASE_URL) {
    insertRow({
      id: "env",
      name: "环境变量渠道",
      proto: (process.env.ARK_PROTO as Channel["proto"]) || "openai",
      model: process.env.ARK_MODEL || "deepseek-chat",
      baseUrl: process.env.ARK_BASE_URL,
      apiKey: process.env.ARK_API_KEY,
    }, true);
    return;
  }
  // 内置默认目录，第一个设默认
  BUILTIN.forEach((c, i) => insertRow({ ...c, id: `c${i + 1}` }, i === 0));
}

function insertRow(c: Channel, isDefault: boolean): void {
  db.prepare(`INSERT OR IGNORE INTO channels (id,name,proto,model,base_url,api_key,is_default,priority,cost) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(c.id, c.name, c.proto, c.model, c.baseUrl, c.apiKey ?? null, isDefault ? 1 : 0, c.priority ?? 50, c.cost ?? 0);
}

// 确保至少有一次种子（表为空时）
(function ensureSeed() {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM channels`).get() as { n: number }).n;
  if (n === 0) seedFromEnv();
})();

interface ChannelRow {
  id: string; name: string; proto: string; model: string; base_url: string;
  api_key: string | null; is_default: number; priority: number; cost: number;
}

function rowToChannel(r: ChannelRow): Channel {
  return {
    id: r.id, name: r.name, proto: r.proto === "anthropic" ? "anthropic" : "openai",
    model: r.model, baseUrl: r.base_url, apiKey: r.api_key ?? undefined, default: !!r.is_default,
    priority: r.priority, cost: r.cost,
  };
}

export function getChannels(): Channel[] {
  const rows = db.prepare(`SELECT * FROM channels ORDER BY is_default DESC, id`).all() as unknown as ChannelRow[];
  return rows.map(rowToChannel);
}

export function getChannelById(id: string): Channel | null {
  const r = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(id) as unknown as ChannelRow | undefined;
  return r ? rowToChannel(r) : null;
}

export function getDefaultChannel(): Channel | null {
  return getChannels().find((c) => c.default) ?? getChannels()[0] ?? null;
}

export function createChannel(input: Omit<Channel, "id" | "default"> & { id?: string }): Channel {
  const id = input.id ?? `c${Date.now().toString(36)}`;
  const channels = getChannels();
  const isDefault = channels.length === 0;
  insertRow({ ...input, id, default: isDefault }, isDefault);
  return getChannelById(id)!;
}

export function updateChannel(id: string, patch: Partial<Omit<Channel, "id">>): Channel | null {
  const cur = getChannelById(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare(`UPDATE channels SET name=?, proto=?, model=?, base_url=?, api_key=?, is_default=?, priority=?, cost=? WHERE id=?`)
    .run(next.name, next.proto, next.model, next.baseUrl, next.apiKey ?? null, next.default ? 1 : 0, next.priority ?? 50, next.cost ?? 0, id);
  return getChannelById(id)!;
}

export function deleteChannel(id: string): boolean {
  const r = db.prepare(`DELETE FROM channels WHERE id = ?`).run(id);
  return Number(r.changes) > 0;
}

export function setDefaultChannel(id: string): boolean {
  if (!getChannelById(id)) return false;
  db.prepare(`UPDATE channels SET is_default = 0`).run();
  db.prepare(`UPDATE channels SET is_default = 1 WHERE id = ?`).run(id);
  return true;
}
