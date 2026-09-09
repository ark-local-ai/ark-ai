// ===== 统计仪表盘 API（M18） =====
// GET /api/stats —— 任务吞吐 + 渠道健康汇总，供前端统计页展示。
// 数据源复用：任务状态计数出 tasks；渠道健康/评分复用 models/router.getChannelStats。

import type { FastifyInstance } from "fastify";
import { countTasksByStatus, recentTasks } from "../db/store.js";
import { getChannelStats } from "../models/router.js";

export async function statsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const byStatus = countTasksByStatus();
    const statuses = ["queue", "running", "done", "failed"];
    const total = statuses.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);

    const channels = getChannelStats();
    const overall = channels.reduce(
      (acc, c) => {
        acc.rateSum += c.rate;
        acc.latSum += c.latency ?? 0;
        if (c.latency != null) acc.latN++;
        acc.scoreSum += c.score;
        return acc;
      },
      { rateSum: 0, latSum: 0, latN: 0, scoreSum: 0 },
    );
    const n = channels.length || 1;

    return {
      tasks: {
        total,
        byStatus: Object.fromEntries(statuses.map((s) => [s, byStatus[s] ?? 0])),
        recent: recentTasks(8),
      },
      channels: {
        total: channels.length,
        avgRate: Math.round(overall.rateSum / n),
        avgLatency: overall.latN ? Math.round(overall.latSum / overall.latN) : null,
        avgScore: Math.round(overall.scoreSum / n),
        best: channels.length ? channels.reduce((a, b) => (b.score > a.score ? b : a)) : null,
      },
    };
  });
}
