// ===== 维护 API（M32）：手动触发自动清理 =====
// POST /api/maintenance/cleanup —— 立即跑一次清理（清过期终态任务+交付文件、裁剪审计日志），
// 返回摘要。清理策略见 src/maintenance/cleanup.ts（env 可配：ARK_CLEANUP_ENABLED/TASK_DAYS/AUDIT_MAX）。

import type { FastifyInstance } from "fastify";
import { runCleanup } from "../maintenance/cleanup.js";

export async function maintenanceRoutes(app: FastifyInstance) {
  app.post("/cleanup", async () => runCleanup());
}
