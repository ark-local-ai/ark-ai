// ===== 专家 API =====
// GET /api/experts —— 专家目录列表。

import type { FastifyInstance } from "fastify";
import { experts } from "../data/experts";

export async function expertRoutes(app: FastifyInstance) {
  app.get("/", async () => experts);
}
