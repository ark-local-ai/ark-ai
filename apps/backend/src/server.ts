import Fastify from "fastify";
import cors from "@fastify/cors";
import { createReadStream } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { taskRoutes } from "./routes/tasks.js";
import { channelRoutes } from "./routes/channels.js";
import { chatRoutes } from "./routes/chat.js";
import { skillRoutes } from "./routes/skills.js";
import { expertRoutes } from "./routes/experts.js";
import { jobRoutes } from "./routes/jobs.js";
import { connectorRoutes } from "./routes/connectors.js";
import { scenarioRoutes } from "./routes/scenarios.js";
import { spaceRoutes, resolveSpaceDir } from "./routes/spaces.js";
import { scanWorkspace } from "./tools/workspace.js";
import { startScheduler } from "./scheduler/jobs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workDir = join(__dirname, "..", "..", "frontend", "public", "workspace");

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // API 路由
  app.register(taskRoutes, { prefix: "/api/tasks" });
  app.register(channelRoutes, { prefix: "/api/channels" });
  app.register(chatRoutes, { prefix: "/api/chat" });
  app.register(skillRoutes, { prefix: "/api/skills" });
  app.register(expertRoutes, { prefix: "/api/experts" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  app.register(connectorRoutes, { prefix: "/api/connectors" });
  app.register(scenarioRoutes, { prefix: "/api/scenarios" });
  app.register(spaceRoutes, { prefix: "/api/spaces" });

  // 工作空间列表：?space=<id> 指定空间目录，缺省扫根（默认工作空间）
  app.get("/api/workspace", async (req) => {
    const q = (req.query as { space?: string }).space;
    if (q) {
      const dir = resolveSpaceDir(q);
      if (!dir) return { error: "空间不存在" } as never;
      return scanWorkspace(dir);
    }
    return scanWorkspace(workDir);
  });

  // 工作空间静态文件（成果下载）：?space=<id> 支持从空间子目录取
  app.get("/api/workspace/*", (req, reply) => {
    const name = (req.params as { "*": string })["*"];
    const q = (req.query as { space?: string }).space;
    const root = q && resolveSpaceDir(q) ? resolveSpaceDir(q)! : workDir;
    // 防目录穿越：只允许工作空间内的文件
    const file = normalize(join(root, name));
    if (!file.startsWith(root)) return reply.code(403).send({ error: "禁止访问" });
    return reply.type("application/octet-stream").send(createReadStream(file));
  });

  app.get("/health", async () => ({ ok: true }));

  return app;
}

// 直接运行时监听启动（tsx src/server.ts）
const port = Number(process.env.PORT ?? 4000);
startScheduler(); // 启动本地定时任务调度器
await buildApp().then((app) => app.listen({ port, host: "127.0.0.1" }));
