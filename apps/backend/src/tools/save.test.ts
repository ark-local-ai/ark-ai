import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveToWorkspace, activeWorkspaceDir } from "./save";
import {
  isWebSearchEnabled, setWebSearchEnabled, getSearchSourceStatus,
  getConfiguredSearch, updateSearchProvider, getQuotaStatus, tryConsumeQuota, setQuota,
} from "./searchSettings";

describe("保存到资料库（M50 tools.save）", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ark-save-"));
    process.env.ARK_WORKSPACE_ROOT = tmp;
  });
  afterEach(() => {
    delete process.env.ARK_WORKSPACE_ROOT;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("把正文写进活动工作空间为 .md 文件（含来源/时间 front-matter）+ 版本快照", async () => {
    const r = await saveToWorkspace({ title: "调研报告", url: "https://a.com/x", text: "这是保存的正文内容。" });
    expect(r.error).toBeUndefined();
    expect(r.path.endsWith(".md")).toBe(true);
    expect(r.versionSeq).toBe(1); // 首次保存 seq=1
    const files = readdirSync(activeWorkspaceDir());
    expect(files).toContain(r.path);
    const body = readFileSync(join(activeWorkspaceDir(), r.path), "utf8");
    expect(body).toContain("# 调研报告");
    expect(body).toContain("> 来源：https://a.com/x");
    expect(body).toContain("这是保存的正文内容。");
  });

  it("空内容返回 error 不写文件", async () => {
    const r = await saveToWorkspace({ title: "空", text: "   " });
    expect(r.error).toBeTruthy();
  });

  it("非法标题字符被清洗（不含路径分隔符）", async () => {
    const r = await saveToWorkspace({ title: "a/b:c*d", text: "x" });
    expect(r.error).toBeUndefined();
    // 清洗后不含这些字符
    expect(r.path.includes("/")).toBe(false);
    expect(r.path.includes(":")).toBe(false);
  });
});

describe("联网搜索源设置（M50 副线）", () => {
  afterEach(() => setWebSearchEnabled(true));

  it("默认启用", () => {
    expect(isWebSearchEnabled()).toBe(true);
  });

  it("setWebSearchEnabled(false) 后关闭、可再开启", () => {
    expect(setWebSearchEnabled(false)).toBe(false);
    expect(isWebSearchEnabled()).toBe(false);
    setWebSearchEnabled(true);
    expect(isWebSearchEnabled()).toBe(true);
  });

  it("getSearchSourceStatus 反映启停与默认 provider", () => {
    const s = getSearchSourceStatus();
    expect(s.enabled).toBe(true);
    expect(s.provider).toBe("duckduckgo"); // 未配 ARK_WEBSEARCH_ENDPOINT
    setWebSearchEnabled(false);
    expect(getSearchSourceStatus().enabled).toBe(false);
  });
});

describe("搜索源 provider 配置（M53 searchSettings）", () => {
  it("默认 duckduckgo，未配 endpoint", () => {
    const cfg = getConfiguredSearch();
    expect(cfg.provider).toBe("duckduckgo");
    expect(cfg.configuredEndpoint).toBe("");
  });

  it("updateSearchProvider('custom', ep) → provider=custom、endpoint 落库可读回", () => {
    const cfg = updateSearchProvider("custom", "https://search.example.com/v1", "sk-test");
    expect(cfg.provider).toBe("custom");
    expect(cfg.configuredEndpoint).toBe("https://search.example.com/v1");
    expect(cfg.key).toBe("sk-test");
  });

  it("custom 不配 endpoint → 回落 duckduckgo（未生效）", () => {
    const cfg = updateSearchProvider("custom", "   ");
    expect(cfg.provider).toBe("duckduckgo");
  });

  it("切回 duckduckgo 清掉库内 endpoint/key，status 不再暴露 hasKey", () => {
    updateSearchProvider("custom", "https://a.test", "k");
    updateSearchProvider("duckduckgo");
    expect(getConfiguredSearch().provider).toBe("duckduckgo");
    const s = getSearchSourceStatus();
    expect(s.provider).toBe("duckduckgo");
    expect((s as { hasKey?: boolean }).hasKey).toBeUndefined();
  });
});

describe("搜索配额（M53 节流限流）", () => {
  afterEach(() => setQuota(30));

  it("默认 rpm=30、初始剩满、未超限", () => {
    const q = getQuotaStatus();
    expect(q.rpm).toBe(30);
    expect(q.used).toBe(0);
    expect(q.remaining).toBe(30);
    expect(q.limited).toBe(false);
  });

  it("tryConsumeQuota 消耗计数，达到上限后拒绝", () => {
    setQuota(2);
    expect(tryConsumeQuota()).toBe(true);
    expect(tryConsumeQuota()).toBe(true);
    expect(getQuotaStatus().limited).toBe(true);
    expect(tryConsumeQuota()).toBe(false); // 超额拒绝
    expect(getQuotaStatus().used).toBe(2);
  });

  it("setQuota 钳制到 1~6000", () => {
    expect(setQuota(0).rpm).toBe(1);
    expect(setQuota(99999).rpm).toBe(6000);
  });
});
