// ===== 对话会话 API（M19，持久化）=====
// GET    /api/chat/sessions         会话列表（多用户隔离）
// GET    /api/chat/sessions/:id/messages   某会话完整消息
// DELETE /api/chat/sessions/:id     删除会话（含消息）
// 会话/消息由 POST /api/chat 自动落库；这里是读取与管理的补充接口。

import type { FastifyInstance } from "fastify";
import {
  listChatSessions, getChatMessages, deleteChatSession,
} from "../db/store.js";
import { currentUser } from "./auth.js";

export async function chatSessionRoutes(app: FastifyInstance) {
  app.get("/", async (req) => listChatSessions(currentUser(req)?.id));

  app.get<{ Params: { id: string } }>("/:id/messages", async (req, reply) => {
    const msgs = getChatMessages(req.params.id);
    return reply.send({ messages: msgs });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!deleteChatSession(req.params.id)) {
      return reply.code(404).send({ error: "会话不存在" });
    }
    return reply.send({ ok: true });
  });
}
