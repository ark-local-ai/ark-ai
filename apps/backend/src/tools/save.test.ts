import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveToWorkspace, activeWorkspaceDir } from "./save";
import {
  isWebSearchEnabled, setWebSearchEnabled, getSearchSourceStatus,
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
