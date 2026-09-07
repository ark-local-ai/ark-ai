// ===== 助理对话 API =====
// POST /api/chat { sessionId?, message, history? } → SSE 流式回复
// 优先用已配置模型（openai 兼容流式），无 key/失败降级为内置回复（逐字流式），保证开箱可跑。

import type { FastifyInstance } from "fastify";
import { pickChannel, recordSuccess, recordFailure } from "../models/router";
import { chatStream, type ChatMessage } from "../models/client";

interface ChatBody {
  sessionId?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

function builtinReply(message: string): string {
  return (
    `我是方舟助理（当前未配置模型渠道，用内置回复占位）。你说的是：「${message}」。\n\n` +
    `我可以帮你把这句话做成一个任务：到首页输入同样的话，专家团队会自动规划步骤、生成可编辑的 PPT / Word / Excel 成果文件并交付。\n\n` +
    `配置了模型渠道（设置 ARK_BASE_URL / ARK_API_KEY / ARK_MODEL）后，我会用真实模型和你多轮对话。`
  );
}

export async function chatRoutes(app: FastifyInstance) {
  app.post<{ Body: ChatBody }>("/", async (req, reply) => {
    const message = req.body?.message?.trim();
    if (!message) {
      return reply.code(400).send({ error: "message 不能为空" });
    }
    const history: ChatMessage[] = (req.body?.history ?? []).slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    // SSE 头
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (type: string, data: unknown) => {
      reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 优先真实模型
    const ch = pickChannel();
    if (ch) {
      try {
        const full = await chatStream(ch, history, (delta) => send("token", { text: delta }));
        recordSuccess(ch.id);
        send("done", { text: full });
        return;
      } catch (e) {
        recordFailure(ch.id);
        // 降级到内置
        send("fallback", { reason: "模型不可用，降级内置回复" });
      }
    }

    // 内置回复（逐字流式，模拟流式体验）
    const replyText = builtinReply(message);
    let sent = "";
    for (let i = 0; i < replyText.length; i += 6) {
      const chunk = replyText.slice(i, i + 6);
      sent += chunk;
      send("token", { text: chunk });
      await new Promise((r) => setTimeout(r, 24));
    }
    send("done", { text: sent });
  });
}
