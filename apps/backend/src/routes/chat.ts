// ===== 助理对话 API =====
// POST /api/chat { sessionId?, message, history?, runTask? } → SSE 流式回复
// 优先用已配置模型（openai 兼容流式），无 key/失败降级为内置回复（逐字流式），保证开箱可跑。
// M40：对话式多轮任务执行——`runTask` 为真（或消息命中工作意图）时，把该条消息作为真实 Agent
// 任务入队执行，SSE 先发 `task_created`（带 taskId），前端据此订阅任务进度并回传交付链接。

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { pickChannel, recordSuccess, recordFailure } from "../models/router";
import { chatStream, type ChatMessage } from "../models/client";
import { createChatSession, appendChatMessage, searchChatMessages } from "../db/store";
import { enqueueTask } from "./../agent/runner.js";
import { currentUser } from "./auth";

interface ChatBody {
  sessionId?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  runTask?: boolean;
}

/**
 * M40 工作意图检测：消息命中「做/生成/来一份…(PPT/文档/报告/分析/表格)」等词即视为要跑任务。
 * 保守策略——避免休闲聊天误触发建任务；同时前端可用 `runTask:true` 显式强制。
 */
export function looksLikeTask(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  const triggers = ["做", "生成", "制作", "来一份", "给一份", "写一份", "帮我", "做一个", "做一份", "创建", "分析", "调研", "整理", "总结", "跑"];
  const kinds = ["ppt", "pptx", "word", "doc", "docx", "excel", "xlsx", "报告", "文档", "表格", "周报", "月报", "推文", "方案", "卡片", "演示", "图表"];
  const hit = (word: string) => m.includes(word);
  // 必须同时出现「动作 + 产出物」才算任务请求，显著降低误伤
  return triggers.some(hit) && kinds.some(hit);
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
    const userId = currentUser(req)?.id;
    // M19：会话持久化——无 sessionId 则新建（标题取首条消息前 20 字），有则复用
    let sessionId = req.body?.sessionId;
    if (!sessionId) {
      sessionId = createChatSession(message.slice(0, 20) || "新对话", userId);
    }
    appendChatMessage(sessionId, "user", message);

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

    // M40 对话式多轮任务执行：命中工作意图（或前端显式 runTask）→ 把该消息跑成真实 Agent 任务
    const shouldRun = req.body?.runTask === true || looksLikeTask(message);
    if (shouldRun) {
      const taskId = randomUUID().slice(0, 8);
      enqueueTask(taskId, message, currentUser(req)?.id);
      const msg = `好的，我来执行「${message.slice(0, 40)}」…\n已创建任务 ${taskId}，正在规划步骤并生成可编辑文件，完成后这里会给出下载。`;
      appendChatMessage(sessionId, "assistant", msg);
      send("task_created", { taskId, sessionId });
      // 先落一段说明文本；前端拿到 task_created 后会订阅任务 SSE，把实时进度与交付回填进这条气泡
      send("done", { text: msg, sessionId, taskId });
      return;
    }

    // 优先真实模型
    const ch = pickChannel();
    if (ch) {
      try {
        const full = await chatStream(ch, history, (delta) => send("token", { text: delta }));
        recordSuccess(ch.id);
        appendChatMessage(sessionId, "assistant", full);
        send("done", { text: full, sessionId });
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
    appendChatMessage(sessionId, "assistant", sent);
    send("done", { text: sent, sessionId });
  });

  // 对话全文搜索（M23）：GET /api/chat/search?q= — 按消息内容搜历史对话，按会话去重
  app.get<{ Querystring: { q?: string } }>("/search", async (req) => {
    return searchChatMessages(req.query.q ?? "", currentUser(req)?.id);
  });
}
