// ===== 模型渠道 API =====
// GET /api/channels —— 渠道列表 + 成功率统计（供前端设置页展示）。

import type { FastifyInstance } from "fastify";
import { getChannelStats } from "../models/router";

export async function channelRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return getChannelStats();
  });
}
