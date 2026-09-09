import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Artifact, Task, TaskStep, StepStatus, TaskStatus } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });
// 默认库文件 data/ark.db；测试可用 ARK_DB_PATH 指向临时库，避免污染真实数据（M25）
const dbPath = process.env.ARK_DB_PATH || join(dataDir, "ark.db");

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

// ---- 迁移：多用户归属（tasks.user_id / spaces.user_id），NULL=全局/未登录兼容 ----
const taskCols = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[];
if (!taskCols.some((c) => c.name === "user_id")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN user_id TEXT`);
}

// ---- 迁移：任务归档标记（tasks.archived），0=活跃 1=已归档 ----
if (!taskCols.some((c) => c.name === "archived")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
}

// ---- 迁移：任务创建时间戳（tasks.created_ts，epoch ms，M32 清理按龄用）----
// 旧行没有该列：补列后把既有记录统一回填为当前时间——本地既有数据的 created 是 zh-CN locale
// 字符串，无法可靠解析为 epoch，按"现在"记既安全又避免一迁移就被按龄清除。
if (!taskCols.some((c) => c.name === "created_ts")) {
  db.exec(`ALTER TABLE tasks ADD COLUMN created_ts INTEGER`);
  db.exec(`UPDATE tasks SET created_ts = ${Date.now()}`);
}

// ---- 任务写 / 读（node:sqlite 同步 API，prepare().run() / .get() / .all()）----
export function insertTask(task: Task, userId?: string): void {
  db.prepare(
    `INSERT INTO tasks (id, title, prompt, status, model, expert, skills, workspace, checks, timeline, created, created_ts, archived, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id, task.title, task.prompt, task.status, task.model, task.expert,
    JSON.stringify(task.skills), task.workspace,
    JSON.stringify(task.checks), JSON.stringify(task.timeline), task.created,
    Date.now(), task.archived ? 1 : 0, userId ?? null,
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

/**
 * 幂等清空某任务的全部旧行（steps / artifacts / 主行），用于重试同一 id 前复位，
 * 也是删除可复用的底层（M17）。
 */
export function resetTask(id: string): void {
  db.prepare(`DELETE FROM steps WHERE task_id = ?`).run(id);
  db.prepare(`DELETE FROM artifacts WHERE task_id = ?`).run(id);
  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}

/** 删除某任务（含其步骤/产物）；返回该任务原本是否存在 */
export function deleteTask(id: string): boolean {
  const existed = !!db.prepare(`SELECT 1 FROM tasks WHERE id = ?`).get(id);
  resetTask(id);
  return existed;
}

// ---- M32 自动清理：按龄取可清理的终态任务 / 取交付文件 / 裁剪审计 ----
/** 取创建时间早于 `olderThanMs` 的**终态**（done/failed）任务 id（running/queue/归档都不动） */
export function getCleanableTaskIds(olderThanMs: number): { id: string }[] {
  return db.prepare(
    `SELECT id FROM tasks
     WHERE status IN ('done','failed') AND archived = 0 AND created_ts IS NOT NULL AND created_ts < ?
     ORDER BY created_ts ASC`,
  ).all(olderThanMs) as { id: string }[];
}

/** 取这些任务的交付文件名（artifacts.path 只存文件名；绝对路径由调用方按工作目录拼装） */
export function listDeliverableFiles(taskIds: string[]): { taskId: string; path: string }[] {
  if (taskIds.length === 0) return [];
  const ph = taskIds.map(() => "?").join(",");
  return db.prepare(
    `SELECT task_id AS taskId, path FROM artifacts WHERE is_deliverable = 1 AND path IS NOT NULL AND task_id IN (${ph})`,
  ).all(...taskIds) as { taskId: string; path: string }[];
}

/** 裁剪审计日志：只保留最新 keepMax 条（按 id 倒序），返回删除条数 */
export function pruneAudit(keepMax: number): number {
  const r = db.prepare(
    `DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY id DESC LIMIT ?)`,
  ).run(keepMax);
  return Number(r.changes);
}

/**
 * 进程重启后仍「未完成」的任务（queue/running 且未归档）——供 M24 启动恢复重入队。
 * 编排在 runTask 开头会 resetTask(id) 幂等复位，因此重跑一次即干净地续跑/重做。
 */
export function getUnfinishedTasks(): { id: string; prompt: string; userId?: string; status: TaskStatus }[] {
  const rows = db.prepare(
    `SELECT id, prompt, user_id AS userId, status FROM tasks WHERE status IN ('queue','running') AND archived = 0 ORDER BY created`,
  ).all() as { id: string; prompt: string; userId?: string; status: TaskStatus }[];
  return rows;
}

/** 归档/取消归档任务（M22）；返回该任务原本是否存在 */
export function setTaskArchived(id: string, archived: boolean): boolean {
  const existed = !!db.prepare(`SELECT 1 FROM tasks WHERE id = ?`).get(id);
  if (existed) {
    db.prepare(`UPDATE tasks SET archived = ? WHERE id = ?`).run(archived ? 1 : 0, id);
  }
  return existed;
}

// ---- 任务读 ----
export function getTask(id: string): Task | null {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | ({
        id: string; title: string; prompt: string; status: TaskStatus; model: string;
        expert: string; skills: string; workspace: string; checks: string; timeline: string; created: string;
        archived: number;
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
    archived: !!row.archived,
  };
}

/** 任务各状态计数（供统计仪表盘 M18） */
export function countTasksByStatus(): Record<string, number> {
  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM tasks GROUP BY status`).all() as
    { status: string; n: number }[];
  return rows.reduce<Record<string, number>>((acc, r) => { acc[r.status] = r.n; return acc; }, {});
}

/** 最近 N 个任务（含状态+标题，供仪表盘最近动态） */
export function recentTasks(limit = 8): { id: string; title: string; created: string; status: string; archived: boolean }[] {
  const rows = db
    .prepare(`SELECT id, title, created, status, archived FROM tasks ORDER BY created DESC LIMIT ?`)
    .all(limit) as { id: string; title: string; created: string; status: string; archived: number }[];
  return rows.map((r) => ({ id: r.id, title: r.title, created: r.created, status: r.status, archived: !!r.archived }));
}
export interface TaskSummary {
  id: string;
  title: string;
  created: string;
  status: TaskStatus;
  archived: boolean;
}

/**
 * 任务列表摘要（供侧栏「最近任务」），按创建时间倒序。
 * `archivedOnly`：仅列出归档任务（否则默认只列活跃任务——归档任务默认不在主列表出现）。
 */
export function listTasks(limit = 50, userId?: string, archivedOnly = false): TaskSummary[] {
  // 归档筛选列：archivedOnly ? 只看归档 : 只看活跃（归档默认不进主列表）
  const filter = archivedOnly ? `archived = 1` : `archived = 0`;
  let rows: { id: string; title: string; created: string; status: TaskStatus; archived: number }[];
  // 多用户隔离：登录用户看自己的 + 全局无主任务；未登录看全部（兼容）
  if (userId) {
    rows = db.prepare(
      `SELECT id, title, created, status, archived FROM tasks WHERE (user_id = ? OR user_id IS NULL) AND ${filter} ORDER BY created DESC LIMIT ?`,
    ).all(userId, limit) as typeof rows;
  } else {
    rows = db.prepare(
      `SELECT id, title, created, status, archived FROM tasks WHERE ${filter} ORDER BY created DESC LIMIT ?`,
    ).all(limit) as typeof rows;
  }
  return rows.map((r) => ({ id: r.id, title: r.title, created: r.created, status: r.status, archived: !!r.archived }));
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
  userId?: string;  // 归属用户；undefined=全局/默认
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

// 迁移：旧库补 spaces.user_id 列（须在建表之后执行，否则全新库会因表不存在报错）
const spaceCols = db.prepare(`PRAGMA table_info(spaces)`).all() as { name: string }[];
if (!spaceCols.some((c) => c.name === "user_id")) {
  db.exec(`ALTER TABLE spaces ADD COLUMN user_id TEXT`);
}

// ===== 对话（chat）持久化（M19）=====
// 助理对话存入 SQLite：会话 + 消息两表。user_id 与任务同规（NULL=全局/未登录）。
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    user_id TEXT,
    created TEXT NOT NULL,
    updated TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    seq INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
    session_id UNINDEXED, role UNINDEXED, content, tokenize = 'trigram'
  );

  CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    desc TEXT,
    prompt TEXT NOT NULL,
    expert TEXT,
    skills TEXT,
    model TEXT,
    user_id TEXT,
    created TEXT NOT NULL
  );
`);

export interface ChatSessionRow {
  id: string; title: string; created: string; updated: string;
}
export interface ChatMessageRow {
  role: "user" | "assistant"; content: string;
}

export function createChatSession(title: string, userId?: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  const ts = new Date().toLocaleString("zh-CN", { hour12: false });
  db.prepare(`INSERT INTO chat_sessions (id, title, user_id, created, updated) VALUES (?, ?, ?, ?, ?)`)
    .run(id, title, userId ?? null, ts, ts);
  return id;
}

export function appendChatMessage(sessionId: string, role: string, content: string): void {
  const { n } = db
    .prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM chat_messages WHERE session_id = ?`)
    .get(sessionId) as { n: number };
  db.prepare(`INSERT INTO chat_messages (session_id, role, content, seq) VALUES (?, ?, ?, ?)`)
    .run(sessionId, role, content, n);
  // 同步进 FTS 索引，保证新消息即时可搜（M23）
  db.prepare(`INSERT INTO chat_messages_fts (session_id, role, content) VALUES (?, ?, ?)`)
    .run(sessionId, role, content);
  db.prepare(`UPDATE chat_sessions SET updated = ? WHERE id = ?`)
    .run(new Date().toLocaleString("zh-CN", { hour12: false }), sessionId);
}

export function listChatSessions(userId?: string): ChatSessionRow[] {
  return (userId
    ? db.prepare(`SELECT id, title, created, updated FROM chat_sessions WHERE user_id = ? OR user_id IS NULL ORDER BY updated DESC`)
      .all(userId)
    : db.prepare(`SELECT id, title, created, updated FROM chat_sessions ORDER BY updated DESC`).all()
  ) as unknown as ChatSessionRow[];
}

export function getChatMessages(sessionId: string): ChatMessageRow[] {
  return db
    .prepare(`SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY seq`)
    .all(sessionId) as unknown as ChatMessageRow[];
}

export function deleteChatSession(id: string): boolean {
  const existed = !!db.prepare(`SELECT 1 FROM chat_sessions WHERE id = ?`).get(id);
  db.prepare(`DELETE FROM chat_messages WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(id);
  return existed;
}

// ===== 对话全文搜索（M23，FTS5 trigram）=====
// 与工作空间文件搜索（searchIndex.ts）同套路：对中文做真正的子串匹配。
// 消息在 appendChatMessage 时增量入索引；此处也提供启动时全量重建兜底。
export interface ChatSearchHit {
  sessionId: string;
  title: string;
  role: string;
  snippet: string;
  updated: string;
}

/** 重建整个聊天 FTS 索引（启动时调用）：清空 → 回灌全部消息 */
export function reindexChats(): number {
  db.exec(`DELETE FROM chat_messages_fts;`);
  const rows = db.prepare(`SELECT session_id, role, content FROM chat_messages`).all() as
    { session_id: string; role: string; content: string }[];
  const ins = db.prepare(`INSERT INTO chat_messages_fts (session_id, role, content) VALUES (?, ?, ?)`);
  for (const r of rows) ins.run(r.session_id, r.role, r.content);
  return rows.length;
}

function escapeFtsPhrase(q: string): string {
  return q.replace(/["']/g, " ");
}

function makeSnippet(content: string, q: string): string {
  const idx = content.indexOf(q);
  const start = Math.max(0, idx - 10);
  const piece = content.slice(start, start + 50);
  return (start > 0 ? "…" : "") + piece + (start + 50 < content.length ? "…" : "");
}

/**
 * 按消息内容搜索历史对话（≥3 字走 FTS trigram 子串；更短退回 LIKE）。
 * 按会话去重（一个会话只返回一条命中），多用户隔离与会话列表同规。
 */
export function searchChatMessages(rawQ: string, userId?: string): ChatSearchHit[] {
  const q = rawQ.trim();
  if (!q) return [];
  const base = `FROM chat_messages_fts ft JOIN chat_sessions s ON s.id = ft.session_id`;
  const sel = `SELECT s.id AS sessionId, s.title AS title, ft.role AS role, ft.content AS content, s.updated AS updated\n           ${base}`;
  const rows: { sessionId: string; title: string; role: string; content: string; updated: string }[] =
    q.length >= 3
      ? userId
        ? (db.prepare(`${sel} WHERE chat_messages_fts MATCH ? AND (s.user_id = ? OR s.user_id IS NULL) ORDER BY s.updated DESC LIMIT 50`).all(`"${escapeFtsPhrase(q)}"`, userId) as typeof rows)
        : (db.prepare(`${sel} WHERE chat_messages_fts MATCH ? ORDER BY s.updated DESC LIMIT 50`).all(`"${escapeFtsPhrase(q)}"`) as typeof rows)
      : userId
        ? (db.prepare(`${sel} WHERE ft.content LIKE ? AND (s.user_id = ? OR s.user_id IS NULL) ORDER BY s.updated DESC LIMIT 50`).all(`%${q}%`, userId) as typeof rows)
        : (db.prepare(`${sel} WHERE ft.content LIKE ? ORDER BY s.updated DESC LIMIT 50`).all(`%${q}%`) as typeof rows);
  // 按会话去重（保留最新一条命中）
  const seen = new Set<string>();
  const hits: ChatSearchHit[] = [];
  for (const r of rows) {
    if (seen.has(r.sessionId)) continue;
    seen.add(r.sessionId);
    hits.push({ sessionId: r.sessionId, title: r.title, role: r.role, snippet: makeSnippet(r.content, q), updated: r.updated });
  }
  return hits;
}

// 首次启动若没有空间，播种一个「默认工作空间」（dir 为空字符串表示根目录，兼容既有平铺文件）
function seedSpaces(): void {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM spaces`).get() as { n: number };
  if (n.n === 0) {
    db.prepare(`INSERT INTO spaces (id, name, dir, is_active, created) VALUES (?, ?, ?, ?, ?)`)
      .run("default", "默认工作空间", "", 1, new Date().toLocaleString("zh-CN", { hour12: false }));
  }
}
seedSpaces();
reindexChats();

export function listSpaces(userId?: string): Space[] {
  // 多用户隔离：登录用户见自己的 + 全局；未登录见全部（兼容）
  const rows = userId
    ? db.prepare(`SELECT id, name, dir, is_active, created, user_id FROM spaces WHERE user_id = ? OR user_id IS NULL ORDER BY rowid`).all(userId) as {
        id: string; name: string; dir: string; is_active: number; created: string; user_id: string | null;
      }[]
    : db.prepare(`SELECT id, name, dir, is_active, created, user_id FROM spaces ORDER BY rowid`).all() as {
        id: string; name: string; dir: string; is_active: number; created: string; user_id: string | null;
      }[];
  return rows.map((r) => ({
    id: r.id, name: r.name, dir: r.dir, isActive: r.is_active === 1, created: r.created,
    userId: r.user_id ?? undefined,
  }));
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

export function createSpace(name: string, dir: string, id?: string, userId?: string): Space {
  const sid = id ?? `sp-${Math.random().toString(36).slice(2, 8)}`;
  const created = new Date().toLocaleString("zh-CN", { hour12: false });
  db.prepare(`INSERT INTO spaces (id, name, dir, is_active, created, user_id) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(sid, name, dir, 0, created, userId ?? null);
  return { id: sid, name, dir, isActive: false, created, userId };
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

// ============================== 用户与会话（本地多用户）==============================
// 密码用 Node 内置 crypto.scrypt 哈希（零依赖、本地优先、免原生编译）。
// 会话 = 随机 token（存 sessions 表，带过期），前端持 token 走 Bearer 头。

export interface User {
  id: string;
  username: string;
  displayName: string;
  created: string;
}

export interface SessionRow {
  token: string;
  userId: string;
  expires: number;
}

// 建表（幂等）
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

export type UserRow = {
  id: string; username: string; password_hash: string; display_name: string; created: string;
};

// ---- 密码哈希（scrypt：随机盐 + 时间成本）----
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---- 用户读写 ----
export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as UserRow | undefined;
}

export function findUserById(id: string): User | undefined {
  const r = db.prepare(`SELECT id, username, display_name, created FROM users WHERE id = ?`).get(id) as
    | { id: string; username: string; display_name: string; created: string }
    | undefined;
  return r ? { id: r.id, username: r.username, displayName: r.display_name, created: r.created } : undefined;
}

export function createUser(username: string, password: string, displayName: string): User {
  const id = `u-${randomBytes(6).toString("hex")}`;
  const created = new Date().toLocaleString("zh-CN", { hour12: false });
  const hash = hashPassword(password);
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created) VALUES (?, ?, ?, ?, ?)`)
    .run(id, username, hash, displayName || username, created);
  return { id, username, displayName: displayName || username, created };
}

export function countUsers(): number {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
  return r.n;
}

// ---- 会话 ----
const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 天

export function createSession(userId: string): string {
  const token = randomBytes(24).toString("hex");
  const expires = Date.now() + SESSION_TTL;
  db.prepare(`INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)`)
    .run(token, userId, expires);
  return token;
}

export function resolveSession(token: string): User | undefined {
  const row = db.prepare(`SELECT user_id, expires FROM sessions WHERE token = ?`).get(token) as
    | { user_id: string; expires: number }
    | undefined;
  if (!row) return undefined;
  if (Date.now() > row.expires) return undefined; // 过期即失效
  return findUserById(row.user_id);
}

export function destroySession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

/** 清理过期会话（可选，不阻塞） */
export function pruneSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expires < ?`).run(Date.now());
}

// ===== 操作审计日志（M29） =====
// 记录"谁在何时做了什么写操作"（登录/注册/建删任务/渠道 CRUD/空间 CRUD 等），
// 供合规审计与排查。写入是 fire-and-forget（不失败回滚业务），查询按时间倒序。
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT
  );
`);

export interface AuditEntry {
  id: number;
  ts: string;
  userId?: string;
  userName?: string;
  action: string;
  target?: string;
  detail?: string;
}

/** 追加一条审计记录（本地写，不抛错——审计不应影响业务） */
export function appendAudit(entry: Omit<AuditEntry, "id" | "ts">): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (ts, user_id, user_name, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      new Date().toLocaleString("zh-CN", { hour12: false }),
      entry.userId ?? null,
      entry.userName ?? null,
      entry.action,
      entry.target ?? null,
      entry.detail ?? null,
    );
  } catch {
    /* 审计失败静默，不影响主流程 */
  }
}

/** 最近 N 条审计记录（供审计查看；默认 200） */
export function listAudit(limit = 200): AuditEntry[] {
  return db
    .prepare(`SELECT id, ts, user_id AS userId, user_name AS userName, action, target, detail FROM audit_log ORDER BY id DESC LIMIT ?`)
    .all(limit) as unknown as AuditEntry[];
}

/** 清空审计日志（可选项；保留架构接口） */
export function clearAudit(): void {
  db.exec(`DELETE FROM audit_log;`);
}

// ---- M33 任务模板：CRUD（本地存储，可含预设的专家/技能/模型） ----
export interface TaskTemplate {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  expert?: string;
  skills?: string[];
  model?: string;
  created: string;
}

export function createTaskTemplate(
  tpl: { name: string; desc?: string; prompt: string; expert?: string; skills?: string[]; model?: string },
  userId?: string,
): string {
  const id = Math.random().toString(36).slice(2, 10);
  db.prepare(
    `INSERT INTO task_templates (id, name, desc, prompt, expert, skills, model, user_id, created)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, tpl.name, tpl.desc ?? null, tpl.prompt, tpl.expert ?? null,
    tpl.skills?.length ? JSON.stringify(tpl.skills) : null, tpl.model ?? null,
    userId ?? null, new Date().toLocaleString("zh-CN", { hour12: false }),
  );
  return id;
}

export function listTaskTemplates(userId?: string): TaskTemplate[] {
  const rows = db.prepare(
    `SELECT id, name, desc, prompt, expert, skills, model, created
     FROM task_templates
     WHERE user_id = ? OR user_id IS NULL
     ORDER BY created DESC`,
  ).all(userId ?? null) as {
    id: string; name: string; desc: string | null; prompt: string;
    expert: string | null; skills: string | null; model: string | null; created: string;
  }[];
  return rows.map((r) => ({
    id: r.id, name: r.name, desc: r.desc ?? undefined, prompt: r.prompt,
    expert: r.expert ?? undefined,
    skills: r.skills ? JSON.parse(r.skills) as string[] : undefined,
    model: r.model ?? undefined,
    created: r.created,
  }));
}

export function getTaskTemplate(id: string): TaskTemplate | null {
  const r = db.prepare(
    `SELECT id, name, desc, prompt, expert, skills, model, created FROM task_templates WHERE id = ?`,
  ).get(id) as {
    id: string; name: string; desc: string | null; prompt: string;
    expert: string | null; skills: string | null; model: string | null; created: string;
  } | undefined;
  if (!r) return null;
  return {
    id: r.id, name: r.name, desc: r.desc ?? undefined, prompt: r.prompt,
    expert: r.expert ?? undefined,
    skills: r.skills ? JSON.parse(r.skills) as string[] : undefined,
    model: r.model ?? undefined,
    created: r.created,
  };
}

export function updateTaskTemplate(id: string, patch: Partial<{ name: string; desc: string; prompt: string; expert: string; skills: string[]; model: string }>): boolean {
  const existed = !!db.prepare(`SELECT 1 FROM task_templates WHERE id = ?`).get(id);
  if (!existed) return false;
  const cur = getTaskTemplate(id)!;
  const name = patch.name ?? cur.name;
  const desc = patch.desc !== undefined ? patch.desc : (cur.desc ?? "");
  const prompt = patch.prompt ?? cur.prompt;
  const expert = patch.expert !== undefined ? patch.expert : (cur.expert ?? "");
  const skills = patch.skills ?? (cur.skills ?? []);
  const model = patch.model !== undefined ? patch.model : (cur.model ?? "");
  db.prepare(
    `UPDATE task_templates SET name = ?, desc = ?, prompt = ?, expert = ?, skills = ?, model = ? WHERE id = ?`,
  ).run(name, desc || null, prompt, expert || null, skills.length ? JSON.stringify(skills) : null, model || null, id);
  return true;
}

export function deleteTaskTemplate(id: string): boolean {
  const existed = !!db.prepare(`SELECT 1 FROM task_templates WHERE id = ?`).get(id);
  if (existed) db.prepare(`DELETE FROM task_templates WHERE id = ?`).run(id);
  return existed;
}
