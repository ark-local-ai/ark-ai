// ===== 工作空间全文搜索（M20，FTS5 trigram）=====
// 为「资料库」与 Sidebar Cmd+K 提供按文件名的子串搜索。
// 用 SQLite FTS5 的 trigram tokenizer——它对中文做真正的子串匹配（unicode61 只按词切、查中文基本无效）。
// 启动时（模块加载）从磁盘重建索引；`searchWorkspaceFiles(q)` 走 FTS 命中元数据表返回。
// 刻意只索引文件名（用户记忆与搜索的入口），不读文件内容，避免大文件/敏感内容进库。

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db, listSpaces } from "../db/store.js";

const workRoot = join(process.cwd(), "..", "frontend", "public", "workspace");

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

export interface WorkspaceIndexRow {
  name: string;
  kind: string;
  size: number;
  sizeText: string;
  time: string;
  space: string;      // 空 = 默认工作空间（根目录）
  spaceName: string;
  spaceId: string | null;
}

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_files (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL,
    sizeText TEXT NOT NULL,
    time TEXT NOT NULL,
    space TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS workspace_files_fts USING fts5(
    name, path UNINDEXED, space UNINDEXED, tokenize = 'trigram'
  );
`);

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

function indexDir(dir: string, space: string): void {
  let entries: { name: string; kind: string; size: number; time: string }[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (!st.isFile()) continue;
      entries.push({ name, kind: kindOf(name), size: st.size, time: timeText(st.mtimeMs) });
    }
  } catch {
    return;
  }
  const ins = db.prepare(
    `INSERT OR REPLACE INTO workspace_files (path, name, kind, size, sizeText, time, space) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insFts = db.prepare(`INSERT INTO workspace_files_fts (name, path, space) VALUES (?, ?, ?)`);
  for (const e of entries) {
    const path = space ? `${space}/${e.name}` : e.name;
    ins.run(path, e.name, e.kind, e.size, sizeText(e.size), e.time, space);
    insFts.run(e.name, path, space);
  }
}

/** 重建整个索引（启动时调用）：清空 → 扫根目录 + 各空间子目录 */
export function reindexWorkspace(): number {
  db.exec(`DELETE FROM workspace_files_fts; DELETE FROM workspace_files;`);
  indexDir(workRoot, "");
  for (const s of listSpaces()) {
    if (s.dir) indexDir(join(workRoot, s.dir), s.dir);
  }
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM workspace_files`).get() as { n: number };
  return n;
}

function escapeFtsPhrase(q: string): string {
  return q.replace(/["']/g, " ");
}

/** 按文件名搜索（≥3 字走 FTS trigram 子串；更短退回 LIKE），返回命中文件 + 空间信息 */
export function searchWorkspaceFiles(rawQ: string): WorkspaceIndexRow[] {
  const q = rawQ.trim();
  if (!q) return [];
  const spaceNames = new Map<string, string>();
  const spaceIds = new Map<string, string>();
  for (const s of listSpaces()) {
    if (s.dir) { spaceNames.set(s.dir, s.name); spaceIds.set(s.dir, s.id); }
  }

  const rows: { name: string; kind: string; size: number; sizeText: string; time: string; space: string | null }[] =
    q.length >= 3
      ? (db.prepare(
          `SELECT f.name, f.kind, f.size, f.sizeText, f.time, f.space
           FROM workspace_files_fts ft
           JOIN workspace_files f ON f.path = ft.path
           WHERE workspace_files_fts MATCH ?
           ORDER BY f.size DESC LIMIT 50`,
        ).all(`"${escapeFtsPhrase(q)}"`) as typeof rows)
      : (db.prepare(
          `SELECT name, kind, size, sizeText, time, space FROM workspace_files
           WHERE name LIKE ? ORDER BY size DESC LIMIT 50`,
        ).all(`%${q}%`) as typeof rows);

  return rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    size: r.size,
    sizeText: r.sizeText,
    time: r.time,
    space: r.space ?? "",
    spaceName: r.space ? (spaceNames.get(r.space) ?? r.space) : "默认工作空间",
    spaceId: r.space ? (spaceIds.get(r.space) ?? null) : null,
  }));
}
