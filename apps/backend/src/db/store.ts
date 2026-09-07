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
