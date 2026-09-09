// ===== 任务队列状态 API（M30）=====
// 让前端/观测者能查看任务队列当前有多少任务在跑、多少在排队、并发上限是多少。
// 配合 runner 的信号量实现（见 agent/runner.ts）。

import type { FastifyInstance } from "fastify";
import { getQueueStats } from "../agent/runner.js";

export async function queueRoutes(app: FastifyInstance) {
  app.get("/", async () => getQueueStats());
}
