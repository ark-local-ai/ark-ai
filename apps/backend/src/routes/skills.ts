// ===== 技能 API（Markdown 落盘热加载）=====
// GET /api/skills         技能列表（id/name/desc/enabled）
// GET /api/skills/:id     单个技能（含 code）
// PUT /api/skills/:id     {name?,desc?,enabled?,code?} 保存
// POST /api/skills/:id/toggle {enabled} 切换启用

import type { FastifyInstance } from "fastify";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  listSkills, getSkill, writeSkillMeta, toggleSkill, deleteSkill,
} from "../tools/skills";

const skillsDir = join(process.cwd(), "skills");
mkdirSync(skillsDir, { recursive: true });

/** 技能 id 只允许字母/数字/下划线/短横线，防 `${id}.md` 路径穿越 */
function validSkillId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

export async function skillRoutes(app: FastifyInstance) {
  app.get("/", async () => listSkills(skillsDir));

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!validSkillId(req.params.id)) return reply.code(400).send({ error: "非法的技能 id" });
    const s = getSkill(skillsDir, req.params.id);
    if (!s) return reply.code(404).send({ error: "技能不存在" });
    return reply.send(s);
  });

  app.put<{ Params: { id: string }; Body: { name?: string; desc?: string; enabled?: boolean; code?: string } }>(
    "/:id", async (req, reply) => {
      const id = req.params.id;
      if (!validSkillId(id)) return reply.code(400).send({ error: "非法的技能 id" });
      const cur = getSkill(skillsDir, id);
      if (!cur && !req.body?.code) return reply.code(404).send({ error: "技能不存在，且未提供 code 新建" });
      const merged = {
        name: req.body?.name ?? cur?.name ?? id,
        desc: req.body?.desc ?? cur?.desc ?? "",
        enabled: req.body?.enabled ?? cur?.enabled ?? true,
        code: req.body?.code ?? cur?.code ?? "",
      };
      return reply.send(writeSkillMeta(skillsDir, id, merged));
    },
  );

  app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>(
    "/:id/toggle", async (req, reply) => {
      if (!validSkillId(req.params.id)) return reply.code(400).send({ error: "非法的技能 id" });
      const s = toggleSkill(skillsDir, req.params.id, !!req.body?.enabled);
      if (!s) return reply.code(404).send({ error: "技能不存在" });
      return reply.send(s);
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!validSkillId(req.params.id)) return reply.code(400).send({ error: "非法的技能 id" });
    const ok = deleteSkill(skillsDir, req.params.id);
    if (!ok) return reply.code(404).send({ error: "技能不存在" });
    return reply.send({ ok: true });
  });
}
