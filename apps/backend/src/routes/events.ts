// ===== 全局任务事件流 API（M21）=====
// GET /api/events —— SSE，订阅【所有】任务的事件（done / error / step / plan…）。
// 供前端全局感知"任意任务完成/失败"，从而刷新侧栏列表 + 弹浏览器通知（不再只有打开任务页才能看见）。
// 复用 events.subscribeAll（M21 在 events.ts 加的全局扇出）。

import type { FastifyInstance } from "fastify";
import { subscribeAll } from "../agent/events.js";

export async function globalEventsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const unsub = subscribeAll((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify({ taskId: event.taskId, ...(event.data as object) })}\n\n`);
    });
    const hb = setInterval(() => reply.raw.write(": ping\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(hb);
      unsub();
    });
  });
}
