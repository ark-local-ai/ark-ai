import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { loadIsolatedStore, makeTask, cleanup } from "../test/helpers";

// buildApp 由 server.ts 提供；其 import 会触发 store/searchIndex 等模块副作用，
// 但 loadIsolatedStore 已先设好临时 ARK_DB_PATH / ARK_TEST，不会污染真实库、也不会起监听。
let store: typeof import("../db/store");
let buildApp: typeof import("../server").buildApp;
let tmpDir: string;
let app: Awaited<ReturnType<typeof import("../server").buildApp>>;

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  tmpDir = loaded.dir;
  // 清掉播种之外的数据，保证幂等起点
  store.db.exec(`DELETE FROM tasks; DELETE FROM steps; DELETE FROM artifacts; DELETE FROM users; DELETE FROM sessions;`);
  const serverModule = await import("../server");
  buildApp = serverModule.buildApp;
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  cleanup(tmpDir);
});

async function post(url: string, body: unknown, token?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url,
    payload: body as Record<string, unknown>,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
async function get(url: string, token?: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("认证 API", () => {
  it("register → me → login → 错密 401 → logout → me 401", async () => {
    const reg = await post("/api/auth/register", { username: "alice", password: "secret1", displayName: "Alice" });
    expect(reg.statusCode).toBe(201);
    const token: string = reg.json().token;
    expect(token).toBeTruthy();

    const me = await get("/api/auth/me", token);
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("alice");

    const dup = await post("/api/auth/register", { username: "alice", password: "secret1" });
    expect(dup.statusCode).toBe(409); // 重名

    const login = await post("/api/auth/login", { username: "alice", password: "secret1" });
    expect(login.statusCode).toBe(200);

    const bad = await post("/api/auth/login", { username: "alice", password: "wrong" });
    expect(bad.statusCode).toBe(401);

    const logout = await post("/api/auth/logout", {}, token);
    expect(logout.statusCode).toBe(204);
    const me2 = await get("/api/auth/me", token);
    expect(me2.statusCode).toBe(401);
  });
});

describe("任务/统计/搜索路由", () => {
  beforeAll(async () => {
    // 直接落库构造数据，避免触发真实编排（写盘慢、非幂等）
    store.insertTask(makeTask({ id: "t1", title: "甲", status: "done" }), undefined);
    store.insertTask(makeTask({ id: "t2", title: "乙", status: "failed" }), undefined);
    store.insertTask(makeTask({ id: "t3", title: "丙", status: "running" }), undefined);
    store.insertStep("t1", 0, "步骤A");
  });

  it("GET /health", async () => {
    const r = await get("/health");
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
  });

  it("GET /api/tasks 返回摘要（含归档过滤）", async () => {
    const r = await get("/api/tasks");
    expect(r.statusCode).toBe(200);
    const ids = r.json().map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["t1", "t2", "t3"]));
  });

  it("GET /api/tasks/:id 完整快照（含步骤）", async () => {
    const r = await get("/api/tasks/t1");
    expect(r.statusCode).toBe(200);
    const t = r.json();
    expect(t.status).toBe("done");
    expect(t.steps).toHaveLength(1);
  });

  it("GET /:id 不存在返回 404", async () => {
    const r = await get("/api/tasks/nope");
    expect(r.statusCode).toBe(404);
  });

  it("GET /api/stats 聚合任务与渠道", async () => {
    const r = await get("/api/stats");
    expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(s.tasks.total).toBeGreaterThanOrEqual(3);
    expect(s.channels.total).toBeGreaterThanOrEqual(1);
  });
});

describe("审计 API", () => {
  it("写请求经 onResponse 钩子落审计，GET /api/audit 可读", async () => {
    // 触发一个真实的 HTTP 写请求
    const r = await post("/api/auth/register", { username: "audit_probe", password: "x1234567", displayName: "probe" });
    expect(r.statusCode).toBe(201);
    const probe = await get("/api/audit");
    expect(probe.statusCode).toBe(200);
    const rows = probe.json() as { action: string; detail: string; userId?: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((x) => x.detail.includes("/api/auth/register"))).toBe(true);
    expect(rows.some((x) => x.action === "登录" || x.action === "注册用户")).toBe(true);
  });
});

describe("对话搜索路由", () => {
  it("发消息后 /api/chat/search 命中", async () => {
    const sid = store.createChatSession("会话1", undefined);
    store.appendChatMessage(sid, "user", "想找行业报告和量子计算的资料");
    const r = await get("/api/chat/search?q=" + encodeURIComponent("行业报告"));
    expect(r.statusCode).toBe(200);
    const hits = r.json() as { sessionId: string }[];
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].sessionId).toBe(sid);
  });
});
