// ===== 场景库 API =====
// GET /api/scenarios —— 场景 + 参考提示词（首页场景胶囊 / 提示词库共用）。

import type { FastifyInstance } from "fastify";
import { scenarios as allScenarios } from "../data/scenarios";

export async function scenarioRoutes(app: FastifyInstance) {
  app.get("/", async () => allScenarios);
}
