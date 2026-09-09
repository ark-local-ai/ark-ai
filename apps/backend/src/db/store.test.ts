import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadIsolatedStore, makeTask, taskWithStatus, cleanup } from "../test/helpers";
import type * as StoreModule from "./store";

let store: typeof StoreModule;
let tmpDir: string;
let db: typeof StoreModule.db;

const resetTables = () => {
  db.exec(`
    DELETE FROM tasks;
    DELETE FROM steps;
    DELETE FROM artifacts;
    DELETE FROM spaces;
    DELETE FROM chat_sessions;
    DELETE FROM chat_messages;
    DELETE FROM chat_messages_fts;
    DELETE FROM users;
    DELETE FROM sessions;
  `);
};

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  tmpDir = loaded.dir;
  db = store.db;
  resetTables();
});

afterAll(() => cleanup(tmpDir));

beforeEach(() => {
  resetTables();
  // 重新播种默认空间，模拟首次启动
  store.listSpaces(undefined);
});

describe("tasks", () => {
  it("插入并读回任务（含 JSON 字段）", () => {
    const t = makeTask({ id: "abc" });
    store.insertTask(t, undefined);
    // 步骤独立于任务主行（getTask 从 steps 表读）
    store.insertStep("abc", 0, "步骤A");
    const got = store.getTask("abc")!;
    expect(got.id).toBe("abc");
    expect(got.status).toBe("queue");
    expect(got.checks).toHaveLength(3);
    expect(got.steps).toHaveLength(1);
    expect(got.steps[0].title).toBe("步骤A");
    expect(got.archived).toBe(false);
  });

  it("getTask 对不存在 id 返回 null", () => {
    expect(store.getTask("nope")).toBeNull();
  });

  it("步骤与产物增删", () => {
    store.insertTask(makeTask({ id: "x" }), undefined);
    const sid = store.insertStep("x", 0, "第一步");
    store.updateStepStatus(sid, "done");
    expect(store.getTask("x")!.steps[0].status).toBe("done");
    store.insertArtifact({ name: "成果.pptx", kind: "ppt", note: "n" }, "x", 1);
    expect(store.getTask("x")!.deliverable?.name).toBe("成果.pptx");
  });

  it("resetTask 幂等复位（重试前清残留）", () => {
    store.insertTask(makeTask({ id: "r" }), undefined);
    const sid = store.insertStep("r", 0, "步骤");
    store.insertArtifact({ name: "a.pptx", kind: "ppt", note: "n" }, "r", 1);
    store.resetTask("r");
    // 主行被删、步骤/产物被删
    expect(store.getTask("r")).toBeNull();
    expect(store.getTask("r")).toBeNull();
    void sid;
  });

  it("listTasks 默认只看活跃，归档需 archivedOnly", () => {
    store.insertTask(makeTask({ id: "active" }), undefined);
    store.insertTask(makeTask({ id: "arch", status: "done" }), undefined);
    store.setTaskArchived("arch", true);
    const active = store.listTasks(50, undefined, false).map((t) => t.id);
    const archived = store.listTasks(50, undefined, true).map((t) => t.id);
    expect(active).toContain("active");
    expect(active).not.toContain("arch");
    expect(archived).toContain("arch");
  });

  it("多用户隔离：见自己的 + 全局，不见他人", () => {
    store.insertTask(makeTask({ id: "alice1" }), "alice");
    store.insertTask(makeTask({ id: "alice2" }), "alice");
    store.insertTask(makeTask({ id: "bob1" }), "bob");
    store.insertTask(makeTask({ id: "global1" }), undefined); // 全局无主
    const aliceIds = store.listTasks(50, "alice", false).map((t) => t.id);
    const bobIds = store.listTasks(50, "bob", false).map((t) => t.id);
    const anonIds = store.listTasks(50, undefined, false).map((t) => t.id);
    expect(aliceIds).toEqual(expect.arrayContaining(["alice1", "alice2", "global1"]));
    expect(aliceIds).not.toContain("bob1");
    expect(bobIds).toContain("bob1");
    expect(anonIds.length).toBeGreaterThanOrEqual(4); // 匿名看全部
  });

  it("getUnfinishedTasks 只取非归档 queue/running 且带 user_id", () => {
    store.insertTask(taskWithStatus("q1", "queue", { prompt: "p1" }), "alice");
    store.insertTask(taskWithStatus("r1", "running"), undefined);
    store.insertTask(taskWithStatus("d1", "done"), undefined);
    store.insertTask(taskWithStatus("a1", "running", { archived: true }), undefined);
    const u = store.getUnfinishedTasks();
    const ids = u.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(["q1", "r1"]));
    expect(ids).not.toContain("d1");
    expect(ids).not.toContain("a1"); // 归档的不恢复
    expect(u.find((t) => t.id === "q1")?.userId).toBe("alice"); // 保留归属
  });

  it("countTasksByStatus 聚合", () => {
    store.insertTask(taskWithStatus("c1", "done"), undefined);
    store.insertTask(taskWithStatus("c2", "done"), undefined);
    store.insertTask(taskWithStatus("c3", "failed"), undefined);
    const by = store.countTasksByStatus();
    expect(by.done).toBe(2);
    expect(by.failed).toBe(1);
  });
});

describe("chat + FTS 搜索", () => {
  it("建会话、落消息、搜索命中", () => {
    const sid = store.createChatSession("测试会话", undefined);
    store.appendChatMessage(sid, "user", "想找一份行业报告的数据");
    store.appendChatMessage(sid, "assistant", "这是关于量子计算的行业报告。");
    const hits = store.searchChatMessages("行业报告", undefined);
    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe(sid);
    expect(hits[0].snippet).toContain("行业报告");
  });

  it("搜索按会话去重（同会话多条命中只回一条）", () => {
    const sid = store.createChatSession("去重会话", undefined);
    store.appendChatMessage(sid, "user", "市场战略分析");
    store.appendChatMessage(sid, "assistant", "再做一次市场战略分析总结");
    const hits = store.searchChatMessages("战略", undefined);
    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe(sid);
  });

  it("无匹配返回空数组", () => {
    const sid = store.createChatSession("a", undefined);
    store.appendChatMessage(sid, "user", "今天天气不错");
    expect(store.searchChatMessages("不存在的词XYZ", undefined)).toEqual([]);
  });
});

describe("spaces", () => {
  it("createSpace / getActiveSpace / deleteSpace", () => {
    const s = store.createSpace("项目A", "projA", "sp1", undefined);
    expect(s.id).toBe("sp1");
    store.updateSpace("sp1", { isActive: true });
    expect(store.getActiveSpace()?.id).toBe("sp1");
    expect(store.deleteSpace("sp1")).toBe(true);
    expect(store.deleteSpace("sp1")).toBe(false);
  });
});

describe("auth", () => {
  it("注册/校验密码/会话", () => {
    const u = store.createUser("alice", "secret123", "Alice");
    expect(u.username).toBe("alice");
    const row = store.findUserByUsername("alice")!;
    expect(store.verifyPassword("secret123", row.password_hash)).toBe(true);
    expect(store.verifyPassword("wrong", row.password_hash)).toBe(false);
    expect(row.id).toBe(u.id);
    const token = store.createSession(u.id);
    expect(store.resolveSession(token)?.id).toBe(u.id);
    store.destroySession(token);
    expect(store.resolveSession(token)).toBeUndefined();
  });
});
