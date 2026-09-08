import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Artifact, Task, TaskStep, StepStatus, TaskStatus } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "ark.db");

// Node 22 内置 SQLite：零原生编译依赖，本地优先首选
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

// ---- 建表（幂等）----
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queue',
    model TEXT,
    expert TEXT,
    skills TEXT,
    workspace TEXT,
    checks TEXT,
    timeline TEXT,
    created TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    seq INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT,
    path TEXT,
    is_deliverable INTEGER NOT NULL DEFAULT 0
  );
`);

// ---- 迁移：旧库补 steps.note 列（CREATE IF NOT EXISTS 不会补列）----
const stepCols = db.prepare(`PRAGMA table_info(steps)`).all() as { name: string }[];
if (!stepCols.some((c) => c.name === "note")) {
  db.exec(`ALTER TABLE steps ADD COLUMN note TEXT`);
}

// ---- 任务写 / 读（node:sqlite 同步 API，prepare().run() / .get() / .all()）----
export function insertTask(task: Task): void {
  db.prepare(
    `INSERT INTO tasks (id, title, prompt, status, model, expert, skills, workspace, checks, timeline, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id, task.title, task.prompt, task.status, task.model, task.expert,
    JSON.stringify(task.skills), task.workspace,
    JSON.stringify(task.checks), JSON.stringify(task.timeline), task.created,
  );
}

export function insertStep(taskId: string, seq: number, title: string): number {
  const r = db
    .prepare(`INSERT INTO steps (task_id, title, status, seq) VALUES (?, ?, 'pending', ?)`)
    .run(taskId, title, seq);
  return Number(r.lastInsertRowid);
}

export function updateStepStatus(id: number, status: StepStatus, note?: string): void {
  db.prepare(`UPDATE steps SET status = ?, note = ? WHERE id = ?`).run(status, note ?? null, id);
}

export function updateTaskStatus(id: string, status: TaskStatus): void {
  db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run(status, id);
}

export function updateTaskChecksAndTimeline(
  id: string,
  checks: { label: string; ok: boolean }[],
  timeline: { time: string; label: string }[],
): void {
  db.prepare(`UPDATE tasks SET checks = ?, timeline = ? WHERE id = ?`).run(
    JSON.stringify(checks), JSON.stringify(timeline), id,
  );
}

export function insertArtifact(a: Artifact, taskId: string, isDeliverable = 0): void {
  db.prepare(
    `INSERT INTO artifacts (task_id, name, kind, note, path, is_deliverable)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(taskId, a.name, a.kind, a.note ?? null, a.path ?? null, isDeliverable);
}

// ---- 任务读 ----
export function getTask(id: string): Task | null {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | ({
        id: string; title: string; prompt: string; status: TaskStatus; model: string;
        expert: string; skills: string; workspace: string; checks: string; timeline: string; created: string;
      })
    | undefined;
  if (!row) return null;

  const steps = db
    .prepare(`SELECT id, title, status, note FROM steps WHERE task_id = ? ORDER BY seq`)
    .all(id)
    .map((s) => s as unknown as TaskStep);
  const artifacts = db
    .prepare(`SELECT name, kind, note, path FROM artifacts WHERE task_id = ? AND is_deliverable = 0`)
    .all(id)
    .map((a) => a as unknown as Artifact);
  const deliverable = db
    .prepare(`SELECT name, kind, note, path FROM artifacts WHERE task_id = ? AND is_deliverable = 1 LIMIT 1`)
    .get(id) as Artifact | undefined;

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    model: row.model,
    expert: row.expert,
    skills: JSON.parse(row.skills),
    workspace: row.workspace,
    steps,
    artifacts,
    deliverable: deliverable ?? null,
    checks: JSON.parse(row.checks),
    timeline: JSON.parse(row.timeline),
    created: row.created,
  };
}

export interface TaskSummary {
  id: string;
  title: string;
  created: string;
  status: TaskStatus;
}

/** 任务列表摘要（供侧栏「最近任务」），按创建时间倒序 */
export function listTasks(limit = 50): TaskSummary[] {
  const rows = db.prepare(`SELECT id, title, created, status FROM tasks ORDER BY created DESC LIMIT ?`)
    .all(limit) as { id: string; title: string; created: string; status: TaskStatus }[];
  return rows.map((r) => ({ id: r.id, title: r.title, created: r.created, status: r.status }));
}

// ============================== 多工作空间 spaces ==============================
// 每个空间 = SQLite 一行 + 磁盘一个工作目录（workspace/<dir>/）。
// 数据不出本机：表建在本地 ark.db，目录在本地 workspace。

export interface Space {
  id: string;
  name: string;
  dir: string;      // 工作子目录名（唯一）
  isActive: boolean; // 是否活动空间
  created: string;
}

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dir TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL
  );
`);

// 首次启动若没有空间，播种一个「默认工作空间」（dir 为空字符串表示根目录，兼容既有平铺文件）
function seedSpaces(): void {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM spaces`).get() as { n: number };
  if (n.n === 0) {
    db.prepare(`INSERT INTO spaces (id, name, dir, is_active, created) VALUES (?, ?, ?, ?, ?)`)
      .run("default", "默认工作空间", "", 1, new Date().toLocaleString("zh-CN", { hour12: false }));
  }
}
seedSpaces();

export function listSpaces(): Space[] {
  const rows = db.prepare(`SELECT id, name, dir, is_active, created FROM spaces ORDER BY rowid`).all() as {
    id: string; name: string; dir: string; is_active: number; created: string;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, dir: r.dir, isActive: r.is_active === 1, created: r.created }));
}

export function getSpace(id: string): Space | undefined {
  const row = db.prepare(`SELECT id, name, dir, is_active, created FROM spaces WHERE id = ?`).get(id) as
    | { id: string; name: string; dir: string; is_active: number; created: string }
    | undefined;
  return row ? { id: row.id, name: row.name, dir: row.dir, isActive: row.is_active === 1, created: row.created } : undefined;
}

export function getSpaceByDir(dir: string): Space | undefined {
  const row = db.prepare(`SELECT id, name, dir, is_active, created FROM spaces WHERE dir = ?`).get(dir) as
    | { id: string; name: string; dir: string; is_active: number; created: string }
    | undefined;
  return row ? { id: row.id, name: row.name, dir: row.dir, isActive: row.is_active === 1, created: row.created } : undefined;
}

export function createSpace(name: string, dir: string, id?: string): Space {
  const sid = id ?? `sp-${Math.random().toString(36).slice(2, 8)}`;
  const created = new Date().toLocaleString("zh-CN", { hour12: false });
  db.prepare(`INSERT INTO spaces (id, name, dir, is_active, created) VALUES (?, ?, ?, ?, ?)`)
    .run(sid, name, dir, 0, created);
  return { id: sid, name, dir, isActive: false, created };
}

export function updateSpace(
  id: string,
  patch: { name?: string; dir?: string; isActive?: boolean },
): Space | undefined {
  const cur = getSpace(id);
  if (!cur) return undefined;
  const name = patch.name ?? cur.name;
  const dir = patch.dir ?? cur.dir;
  const isActive = patch.isActive ?? cur.isActive;
  db.prepare(`UPDATE spaces SET name = ?, dir = ?, is_active = ? WHERE id = ?`).run(name, dir, isActive ? 1 : 0, id);
  return getSpace(id);
}

export function deleteSpace(id: string): boolean {
  const r = db.prepare(`DELETE FROM spaces WHERE id = ?`).run(id);
  return Number(r.changes) > 0;
}

/** 活动空间（is_active=1），无则取第一个，再无可取 null */
export function getActiveSpace(): Space | undefined {
  const first = listSpaces().find((s) => s.isActive);
  if (first) return first;
  return listSpaces()[0];
}
