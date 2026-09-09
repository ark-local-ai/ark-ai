// ===== C5 交付版本 API：列出历史 + 回滚 =====
// 版本存档由 orchestrator 每次产出交付时写入（tools/fileVersions.snapshotDeliverable）。
// 这里提供只读列表与回滚（回滚是写 → 走 M36 认证门禁需登录）。

import type { FastifyInstance } from "fastify";
import { spaceDir } from "./spaces.js";
import { getActiveSpace } from "../db/store.js";
import { listVersions, rollbackVersion } from "../tools/fileVersions.js";

/** 与 orchestrator 同款根目录解析：活动空间目录或默认 workspace 根 */
function resolveRoot(): string {
  const active = getActiveSpace();
  return spaceDir(active?.dir ?? "");
}

// 交付文件名只允许顶层文件名（无路径分隔、非隐藏版本目录）
function validName(name: string): boolean {
  return !!name && !name.includes("/") && !name.includes("\\") && !name.startsWith("_") && !name.startsWith(".");
}

export async function versionRoutes(app: FastifyInstance) {
  // 列出某交付文件的历史版本（倒序，最新在前）
  app.get<{ Params: { name: string } }>("/:name", async (req, reply) => {
    const name = decodeURIComponent(req.params.name);
    if (!validName(name)) return reply.code(400).send({ error: "非法文件名" });
    return listVersions(name).map((v) => ({ seq: v.seq, ts: v.ts, taskId: v.taskId ?? null }));
  });

  // 回滚到某历史版本：把存档复制回当前路径覆盖
  app.post<{ Params: { name: string }; Body: { seq?: number } }>("/:name/rollback", async (req, reply) => {
    const name = decodeURIComponent(req.params.name);
    if (!validName(name)) return reply.code(400).send({ error: "非法文件名" });
    const seq = Number(req.body?.seq);
    if (!Number.isInteger(seq) || seq < 1) return reply.code(400).send({ error: "缺少有效的版本号 seq" });
    try {
      const v = rollbackVersion(resolveRoot(), name, seq);
      return reply.send({ ok: true, seq: v.seq, ts: v.ts });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });
}
