import Fastify from "fastify";
import cors from "@fastify/cors";
import { createReadStream } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { taskRoutes } from "./routes/tasks.js";
import { channelRoutes } from "./routes/channels.js";
import { scanWorkspace } from "./tools/workspace.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workDir = join(__dirname, "..", "..", "frontend", "public", "workspace");

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // API 路由
  app.register(taskRoutes, { prefix: "/api/tasks" });
  app.register(channelRoutes, { prefix: "/api/channels" });

  // 工作空间列表（真目录扫描）
  app.get("/api/workspace", async () => {
    return scanWorkspace(workDir);
  });

  // 工作空间静态文件（成果下载）
  app.get("/api/workspace/*", (req, reply) => {
    const name = (req.params as { "*": string })["*"];
    // 防目录穿越：只允许工作空间内的文件
    const file = normalize(join(workDir, name));
    if (!file.startsWith(workDir)) return reply.code(403).send({ error: "禁止访问" });
    return reply.type("application/octet-stream").send(createReadStream(file));
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}

// 直接运行时监听启动（tsx src/server.ts）
const port = Number(process.env.PORT ?? 4000);
await buildApp().then((app) => app.listen({ port, host: "127.0.0.1" }));
