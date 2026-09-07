// ===== 工作空间真目录扫描 =====
// 扫描 workspace 目录，列出交付文件（按类型分组 + 大小 + 修改时间）。
// 供 GET /api/workspace 返回，前端工作空间页展示与下载。

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface WorkspaceFile {
  name: string;
  kind: string; // ppt/xls/doc/png/html/md/pdf/other
  size: number;
  sizeText: string;
  time: string;
}

const KIND_BY_EXT: Record<string, string> = {
  pptx: "ppt", ppt: "ppt",
  xlsx: "xls", xls: "xls", csv: "xls",
  docx: "doc", doc: "doc", md: "md", txt: "md",
  png: "png", jpg: "png", jpeg: "png", gif: "png", svg: "png",
  html: "html", htm: "html", pdf: "pdf",
};

function kindOf(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return KIND_BY_EXT[ext] ?? "other";
}

function sizeText(bytes: number): string {
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${Math.round(bytes / (1 << 10))} KB`;
  return `${bytes} B`;
}

function timeText(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 扫描目录，返回文件列表（含类型 / 大小 / 时间），按修改时间倒序 */
export function scanWorkspace(dir: string): WorkspaceFile[] {
  let entries: { name: string; kind: string; size: number; time: string }[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (!st.isFile()) continue;
      entries.push({ name, kind: kindOf(name), size: st.size, time: timeText(st.mtimeMs) });
    }
  } catch {
    return []; // 目录尚不存在等
  }
  entries.sort((a, b) => b.size - a.size);
  return entries.map((e) => ({ ...e, sizeText: sizeText(e.size) }));
}
