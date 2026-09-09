import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIsolatedStore, cleanup } from "../test/helpers";
import type * as StoreModule from "./../db/store";
import { searchKnowledge } from "./knowledge";

let store: typeof StoreModule;
let tmpDir: string;
let db: typeof StoreModule.db;

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  tmpDir = loaded.dir;
  db = store.db;
});

afterAll(() => cleanup(tmpDir));

describe("内置知识检索（M44 search.knowledge）", () => {
  it("空查询返回空结果", async () => {
    const r = await searchKnowledge("   ", "u1");
    expect(r.count).toBe(0);
    expect(r.hits).toHaveLength(0);
  });

  it("跨记忆召回（多用户隔离 + kind 附注）", async () => {
    store.createMemory({ kind: "preference", content: "开会喜欢简短结论" }, "u1");
    store.createMemory({ kind: "note", content: "另一用户的私有事务" }, "u2");
    const r = await searchKnowledge("我比较喜欢简洁汇报", "u1", 8);
    expect(r.hits.some((h) => h.source === "memory" && h.snippet.includes("开会喜欢简短结论"))).toBe(true);
    expect(r.hits.some((h) => h.snippet.includes("另一用户"))).toBe(false);
  });

  it("结果含 source/kind/title/snippet 字段结构", async () => {
    store.createMemory({ kind: "fact", content: "团队共 5 人" }, "u1");
    const r = await searchKnowledge("团队", "u1", 8);
    for (const h of r.hits) {
      expect(["memory", "workspace"]).toContain(h.source);
      expect(typeof h.title).toBe("string");
      expect(typeof h.snippet).toBe("string");
      expect(typeof h.kind).toBe("string");
    }
  });
});
