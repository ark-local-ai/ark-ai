// ===== 模型路由 router =====
// 多渠道选优：按「成功率」选最稳的渠道；成功率相同取更靠前的。
// 统计写 SQLite（channel_stats），进程重启不丢；供前端设置页展示。
// 演进点：可加「成本 / 延迟 / 优先级」加权（见 5-企业级演进路线）。

import { db } from "../db/store";
import { getChannels, getDefaultChannel, type Channel } from "../config/channels";

db.exec(`
  CREATE TABLE IF NOT EXISTS channel_stats (
    id TEXT PRIMARY KEY,
    ok INTEGER NOT NULL DEFAULT 0,
    fail INTEGER NOT NULL DEFAULT 0
  );
`);

// 迁移：旧库补延迟统计列（成功调用累计耗时/次数 → 平均延迟）
const stCols = db.prepare(`PRAGMA table_info(channel_stats)`).all() as { name: string }[];
if (!stCols.some((c) => c.name === "latency_sum")) {
  db.exec(`ALTER TABLE channel_stats ADD COLUMN latency_sum REAL NOT NULL DEFAULT 0`);
}
if (!stCols.some((c) => c.name === "latency_n")) {
  db.exec(`ALTER TABLE channel_stats ADD COLUMN latency_n INTEGER NOT NULL DEFAULT 0`);
}

interface Stat { ok: number; fail: number; latencySum: number; latencyN: number }

function readStat(id: string): Stat {
  const row = db.prepare(`SELECT ok, fail, latency_sum, latency_n FROM channel_stats WHERE id = ?`).get(id) as
    | { ok: number; fail: number; latency_sum: number; latency_n: number }
    | undefined;
  return row
    ? { ok: row.ok, fail: row.fail, latencySum: row.latency_sum ?? 0, latencyN: row.latency_n ?? 0 }
    : { ok: 0, fail: 0, latencySum: 0, latencyN: 0 };
}

function writeStat(id: string, s: Stat): void {
  db.prepare(
    `INSERT INTO channel_stats (id, ok, fail, latency_sum, latency_n) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ok = ?, fail = ?, latency_sum = ?, latency_n = ?`,
  ).run(id, s.ok, s.fail, s.latencySum, s.latencyN, s.ok, s.fail, s.latencySum, s.latencyN);
}

export function recordSuccess(id: string): void {
  const s = readStat(id);
  writeStat(id, { ok: s.ok + 1, fail: s.fail, latencySum: s.latencySum, latencyN: s.latencyN });
  breakerReset(id); // 成功 → 熔断器关闭复位
}

export function recordFailure(id: string): void {
  const s = readStat(id);
  writeStat(id, { ok: s.ok, fail: s.fail + 1, latencySum: s.latencySum, latencyN: s.latencyN });
  breakerFail(id); // 计数连续失败，达到阈值 → 熔断 open
}

/** 记录一次成功调用的耗时（ms），用于计算平均延迟 */
export function recordLatency(id: string, ms: number): void {
  const s = readStat(id);
  writeStat(id, { ok: s.ok, fail: s.fail, latencySum: s.latencySum + ms, latencyN: s.latencyN + 1 });
}

// ===== 多渠道熔断器（M27） =====
// 单纯 failover（M14）只做到"失败就换渠道"，但一个持续故障的渠道仍会被反复尝试、每次都空耗
// 到超时，拖慢整体。熔断器在连续失败达到阈值后"打开"，一段时间内直接短路跳过该渠道，
// 冷却期后（half-open）放一个试探请求，成功则恢复、失败则继续保持打开。
// 状态是内存瞬时态（不需要落库——重启后从持久化的 ok/fail 统计重新评估），因此测试友好。

const BREAKER_THRESHOLD = 5; // 连续失败 5 次触发熔断
const BREAKER_COOLDOWN_MS = 10_000; // 打开后冷却 10s，之后允许 half-open 探测

interface Breaker { failures: number; open: boolean; openedAt: number }
const breakers = new Map<string, Breaker>();

/** 某渠道是否当前被熔断短路（open 且未过冷却期）。过半开放期(half-open)放行，用于探测。 */
export function isChannelOpen(id: string): boolean {
  const b = breakers.get(id);
  if (!b || !b.open) return false;
  // 冷却期已过 → 转 half-open，允许一次探测（调用成功即复位）
  if (Date.now() - b.openedAt >= BREAKER_COOLDOWN_MS) return false;
  return true;
}

/** 记录一次失败：连续失败计数，达到阈值打开熔断器 */
function breakerFail(id: string): void {
  const b = breakers.get(id) ?? { failures: 0, open: false, openedAt: 0 };
  if (b.open) {
    // half-open 探测失败 → 重新打开，重置冷却计时，避免反复试探刚失败的渠道
    b.openedAt = Date.now();
    breakers.set(id, b);
    return;
  }
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD) {
    b.open = true;
    b.openedAt = Date.now();
    b.failures = 0;
  }
  breakers.set(id, b);
}

/** 记录一次成功：关闭熔断器、复位连续失败计数 */
function breakerReset(id: string): void {
  breakers.delete(id);
}


function successRate(s: Stat): number {
  const total = s.ok + s.fail;
  return total === 0 ? 0.5 : s.ok / total; // 无记录按 0.5（中性）处理
}

/** 平均延迟 ms（无记录返回 null） */
function avgLatency(s: Stat): number | null {
  return s.latencyN > 0 ? s.latencySum / s.latencyN : null;
}

/** 单渠道综合评分（0~1）：可靠性为主，兼顾延迟/成本/用户优先级 */
export function channelScore(c: Channel, s: Stat): number {
  const reliability = successRate(s);
  const latency = avgLatency(s);
  const latencyScore = latency == null ? 0.5 : Math.max(0, 1 - latency / 4000); // <4s 加分，超时趋近 0
  const costScore = !c.cost || c.cost <= 0 ? 1 : Math.max(0, 1 - c.cost / 50); // ~$50/1K tokens 之上趋近 0
  const priorityScore = (c.priority ?? 50) / 100;
  return reliability * 0.5 + latencyScore * 0.2 + costScore * 0.15 + priorityScore * 0.15;
}

/** 按综合评分选最优渠道（跳过当前被熔断短路的渠道）；无可用渠道返回 null（调用方降级脚本） */
export function pickChannel(): Channel | null {
  const channels = getChannels().filter((c) => !isChannelOpen(c.id));
  if (!channels.length) return null;

  let best = channels[0];
  let bestScore = -1;
  for (const c of channels) {
    const score = channelScore(c, readStat(c.id));
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** 返回全部渠道的成功率统计（供 /api/channels） */
export function getChannelStats(): {
  id: string; name: string; model: string; proto: string; baseUrl: string;
  ok: number; fail: number; rate: number; default?: boolean;
  priority: number; cost: number; latency: number | null; score: number;
}[] {
  return getChannels().map((c) => {
    const s = readStat(c.id);
    const total = s.ok + s.fail;
    return {
      id: c.id,
      name: c.name,
      model: c.model,
      proto: c.proto,
      baseUrl: c.baseUrl,
      ok: s.ok,
      fail: s.fail,
      rate: total === 0 ? 0 : Math.round((s.ok / total) * 100),
      default: c.default,
      priority: c.priority ?? 50,
      cost: c.cost ?? 0,
      latency: avgLatency(s),
      score: channelScore(c, s),
    };
  });
}

/** 兜底：仍暴露 getDefaultChannel 语义（无渠道时 null） */
export { getDefaultChannel };

// ===== 多渠道 failover（接真 LLM 的核心韧性） =====
// 之前各调用方只 `pickChannel()` 挑一个"最稳"渠道，一旦它失败（key 失效/超时/限流）就直接
// 降级脚本——明明还有其它已配置渠道可能能用。这里按成功率从高到低逐个尝试，直到某渠道成功
// 返回；全部失败才抛错（由上层降级脚本）。每次尝试都记统计，路由下次更稳。

import { chat, type ChatMessage, type ChatOptions } from "./client";

/** 渠道按综合评分从高到低排序（可靠性+延迟+成本+优先级），排除当前被熔断短路的渠道。
 *  若给 modelHint（如模板指定的模型/渠道名），则命中的渠道提到最前（偏好，非排他）——找不到仍回退全渠道。 */
function orderedChannels(modelHint?: string): Channel[] {
  const hint = modelHint?.trim().toLowerCase();
  return getChannels()
    .filter((c) => !isChannelOpen(c.id))
    .sort((a, b) => {
      const hit = (c: Channel) =>
        !!hint && (
          c.name.toLowerCase().includes(hint) ||
          c.model.toLowerCase().includes(hint) ||
          hint.includes(c.model.toLowerCase())
        );
      const aHit = hit(a) ? 1 : 0;
      const bHit = hit(b) ? 1 : 0;
      if (aHit !== bHit) return bHit - aHit;
      return channelScore(b, readStat(b.id)) - channelScore(a, readStat(a.id));
    });
}

/**
 * 依次尝试所有渠道直到一次成功（非流式）。按成功率从高到低；
 * 传 modelHint 时优先尝试模型匹配的渠道（仍是偏好而非排他）。
 * 至少一次成功返回该渠道与文本；全部失败抛最后一次错误（上层决定降级）。
 */
export async function chatWithFailover(
  messages: ChatMessage[],
  opts: ChatOptions = {},
  modelHint?: string,
): Promise<{ text: string; channel: string; model: string }> {
  const channels = orderedChannels(modelHint);
  if (!channels.length) throw new Error("无可用渠道");
  let lastErr: unknown = new Error("无可用渠道");
  for (const c of channels) {
    const t0 = Date.now();
    try {
      const text = await chat(c, messages, { timeoutMs: 20000, ...opts });
      recordSuccess(c.id);
      recordLatency(c.id, Date.now() - t0);
      return { text, channel: c.name, model: c.model };
    } catch (e) {
      recordFailure(c.id);
      lastErr = e;
    }
  }
  throw lastErr;
}
