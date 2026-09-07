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

interface Stat { ok: number; fail: number }

function readStat(id: string): Stat {
  const row = db.prepare(`SELECT ok, fail FROM channel_stats WHERE id = ?`).get(id) as
    | { ok: number; fail: number }
    | undefined;
  return row ?? { ok: 0, fail: 0 };
}

function writeStat(id: string, s: Stat): void {
  db.prepare(
    `INSERT INTO channel_stats (id, ok, fail) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ok = ?, fail = ?`,
  ).run(id, s.ok, s.fail, s.ok, s.fail);
}

export function recordSuccess(id: string): void {
  const s = readStat(id);
  writeStat(id, { ok: s.ok + 1, fail: s.fail });
}

export function recordFailure(id: string): void {
  const s = readStat(id);
  writeStat(id, { ok: s.ok, fail: s.fail + 1 });
}

function successRate(s: Stat): number {
  const total = s.ok + s.fail;
  return total === 0 ? 1 : s.ok / total; // 无记录按可用处理，但优先级低于有成功记录的
}

/** 按成功率选最优渠道；完全没有渠道返回 null（调用方降级脚本） */
export function pickChannel(): Channel | null {
  const channels = getChannels();
  if (!channels.length) return null;

  // 无成功记录时优先用有成功记录的；否则退回默认/第一个
  let best = channels[0];
  let bestScore = -1;
  for (const c of channels) {
    const s = readStat(c.id);
    const score = successRate(s) * 1000 + (s.ok > 0 ? 1 : 0);
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
    };
  });
}

/** 兜底：仍暴露 getDefaultChannel 语义（无渠道时 null） */
export { getDefaultChannel };
