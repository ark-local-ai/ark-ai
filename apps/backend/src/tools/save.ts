// ===== 保存到资料库工具（M50 tools.save） =====
// 把「联网搜到的正文 / 手工内容」以 Markdown 文件写进当前活动工作空间，并走版本快照（M38），
// 让资料库搜索结果能真正落盘、可下载/被全文搜索（M20）/被后续任务 gatherContext 引用。
// 写入带路径穿越防护（resolve + startsWith(工作区根 + 分隔符)），失败返回 error 不抛。

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { getActiveSpace } from "../db/store";
import { snapshotDeliverable } from "./fileVersions";

export interface SaveToWorkspaceInput {
  title?: string;
  url?: string;
  text: string;
  /** 来源类型，用于文件名前缀（search/read/manual），默认 read */
  source?: string;
}

export interface SaveToWorkspaceResult {
  name: string;
  path: string;
  dir: string;
  versionSeq: number | null;
  error?: string;
}

/** 解析当前活动工作空间的磁盘目录（目录不存在则创建）；ARK_WORKSPACE_ROOT 覆盖根（测试隔离用） */
export function activeWorkspaceDir(): string {
  const workRoot = resolve(
    process.env.ARK_WORKSPACE_ROOT ?? join(process.cwd(), "..", "frontend", "public", "workspace"),
  );
  mkdirSync(workRoot, { recursive: true });
  const active = getActiveSpace();
  const dir = active?.dir ? resolve(join(workRoot, active.dir)) : workRoot;
  // 防穿越：解析后必须仍落在工作区根内
  if (dir !== workRoot && !dir.startsWith(workRoot + sep)) return workRoot;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 安全路径：仅允许落在 base 目录内的相对写路径 */
function safeJoin(base: string, rel: string): string | null {
  const abs = resolve(join(base, rel));
  if (abs === base || abs.startsWith(base + sep)) return abs;
  return null; // 越界
}

function sanitizeName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "未命名资料";
}

export async function saveToWorkspace(
  input: SaveToWorkspaceInput,
): Promise<SaveToWorkspaceResult> {
  const text = (input.text ?? "").trim();
  if (!text) return { name: "", path: "", dir: "", versionSeq: null, error: "内容为空" };

  const dir = activeWorkspaceDir();
  const title = sanitizeName(input.title || input.url || "");
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  const body = [
    `# ${title}`,
    "",
    input.url ? `> 来源：${input.url}` : "> 来源：Ark 保存",
    `> 保存时间：${stamp}`,
    "",
    "---",
    "",
    text,
    "",
  ].join("\n");

  const name = `${(input.source || "read")}-${title}-${Date.now().toString(36)}.md`;
  const safePath = safeJoin(dir, name);
  if (!safePath) return { name, path: name, dir, versionSeq: null, error: "路径非法" };

  try {
    writeFileSync(safePath, body, "utf8");
    const versionSeq = snapshotDeliverable(dir, name);
    return { name, path: name, dir, versionSeq };
  } catch (e) {
    return {
      name, path: name, dir, versionSeq: null,
      error: e instanceof Error ? `保存失败: ${e.message}` : "保存失败",
    };
  }
}
