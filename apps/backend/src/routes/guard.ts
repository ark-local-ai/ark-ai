// ===== C3 认证硬门禁（写请求需登录）=====
// 在**根上下文**按装一个 preHandler：对 `/api/*` 的**写请求**（POST/PUT/PATCH/DELETE）
// 要求携带有效会话，否则 401。读请求（GET/HEAD/OPTIONS）保持开放（local-first：浏览不限）。
// `/api/auth/*` 自管（register/login/status/me/logout 本就各自鉴权），一律放行。
//
// 默认开启；`ARK_REQUIRE_AUTH=0` 可退回软门禁（旧行为，本地单机/演示用）。
// 与 audit 的 installAuditHook 一样，必须根上下文按装，否则只锁到部分插件。

import type { FastifyInstance } from "fastify";
import { currentUser } from "./auth.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function installAuthGate(app: FastifyInstance): void {
  if (process.env.ARK_REQUIRE_AUTH === "0") return; // 显式关掉硬门禁

  app.addHook("preHandler", async (req, reply) => {
    if (!MUTATING.has(req.method)) return; // 读请求放行
    const url = req.url ?? "";
    if (!url.startsWith("/api")) return; // 非 API 由各自中间件管
    if (url.startsWith("/api/auth")) return; // 认证端点自管
    if (!currentUser(req)) {
      return reply.code(401).send({ error: "未登录，请先登录" });
    }
  });
}
