import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIsolatedStore, cleanup } from "../test/helpers";
import type * as StoreModule from "./../db/store";
import { extractUrls, appendRefSection, gatherContext } from "./context";

let store: typeof StoreModule;
let tmpDir: string;

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  tmpDir = loaded.dir;
  store.createMemory({ kind: "note", content: "季度销售目标 200 万" }, "u1");
});

afterAll(() => cleanup(tmpDir));

describe("编排上下文采集（M46 context）", () => {
  it("extractUrls 提取 http/https 顺带去尾标点、去重、最多 2 个", () => {
    const urls = extractUrls("参考 https://example.com/a，再来 https://example.com/a 和 https://b.test/x。");
    expect(urls).toContain("https://example.com/a");
    expect(urls).toHaveLength(2);
    expect(extractUrls("没有网址")).toEqual([]);
  });

  it("appendRefSection 有引用才追加参考资料 section，无引用原样返回", () => {
    const base = [{ title: "一", paragraphs: ["正文"] }];
    const withKb = appendRefSection(base, {
      web: [],
      knowledge: [{ source: "memory", kind: "note", title: "目标", snippet: "季度销售目标 200 万" }],
    });
    expect(withKb).toHaveLength(2);
    expect(withKb[1].title).toBe("参考资料");
    expect(withKb[1].paragraphs[0]).toContain("季度销售目标 200 万");
    // 无引用 → 不追加
    const none = appendRefSection(base, { web: [], knowledge: [] });
    expect(none).toHaveLength(1);
  });

  it("gatherContext 采集本地知识（多用户隔离），hasRef=true", async () => {
    const ctx = await gatherContext("关于销售目标要不要再定", "u1");
    expect(ctx.hasRef).toBe(true);
    expect(ctx.contextText).toContain("季度销售目标 200 万");
  });

  it("M52 gatherContext 注入显式 refs（送给任务）→ 上下文含 ref 正文且 hasRef=true", async () => {
    const ctx = await gatherContext("写一份分析", undefined, [
      { title: "趋势报告", url: "https://a.com/x", text: "这是用户指定带过去的参考资料正文。" },
    ]);
    expect(ctx.refs).toHaveLength(1);
    expect(ctx.hasRef).toBe(true);
    expect(ctx.contextText).toContain("参考资料");
    expect(ctx.contextText).toContain("这是用户指定带过去的参考资料正文。");
  });

  it("M52 appendRefSection 把 refs 收进参考资料 section", () => {
    const base = [{ title: "一", paragraphs: ["正文"] }];
    const out = appendRefSection(base, {
      web: [],
      knowledge: [],
      refs: [{ title: "附件", url: "https://a.com", text: "附件正文内容" }],
    });
    expect(out).toHaveLength(2);
    expect(out[1].title).toBe("参考资料");
    expect(out[1].paragraphs[0]).toContain("用户提供");
    expect(out[1].paragraphs[1]).toBe("附件正文内容");
  });
});
