// ===== 自动化定时任务 store + 调度器（本地 Cron） =====
// jobs 表存任务（schedule/action/push/enabled），job_logs 存执行历史。
// 调度器每 30s 检查：到期(每天 HH:MM 或每隔 N 分钟)且启用 → 调 runTask 执行并记日志。
// 数据全部本机（SQLite），契合「定时任务 + 数据不出本机」。

import { db } from "../db/store";
import { runTask } from "../agent/orchestrator";
import { runCleanup } from "../maintenance/cleanup.js";

export interface Job {
  id: string;
  name: string;
  schedule: string;     // "09:00"(每天) | "every:30"(每30分钟) | "每周五 18:00"(简写)
  action: string;
  push: string;
  enabled: boolean;
  next: string;
}

export interface JobLog {
  id: number;
  jobId: string;
  name: string;
  time: string;
  result: string;
  ok: boolean;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    action TEXT NOT NULL,
    push TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    name TEXT NOT NULL,
    time TEXT NOT NULL,
    result TEXT,
    ok INTEGER NOT NULL DEFAULT 1
  );
`);

// ---- CRUD ----
export function listJobs(): Job[] {
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY id`).all() as {
    id: string; name: string; schedule: string; action: string; push: string | null; enabled: number;
  }[];
  return rows.map((r) => ({
    id: r.id, name: r.name, schedule: r.schedule, action: r.action,
    push: r.push ?? "", enabled: !!r.enabled,
    next: r.enabled ? describeSchedule(r.schedule) : "已暂停",
  }));
}

export function getJob(id: string): Job | null {
  const r = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
    | { id: string; name: string; schedule: string; action: string; push: string | null; enabled: number }
    | undefined;
  if (!r) return null;
  return {
    id: r.id, name: r.name, schedule: r.schedule, action: r.action,
    push: r.push ?? "", enabled: !!r.enabled, next: r.enabled ? describeSchedule(r.schedule) : "已暂停",
  };
}

export function createJob(input: Omit<Job, "id" | "enabled" | "next"> & { enabled?: boolean }): Job {
  const id = `j${Date.now().toString(36)}`;
  db.prepare(`INSERT INTO jobs (id, name, schedule, action, push, enabled) VALUES (?,?,?,?,?,?)`)
    .run(id, input.name, input.schedule, input.action, input.push ?? "", input.enabled === false ? 0 : 1);
  return getJob(id)!;
}

export function updateJob(id: string, patch: Partial<Job>): Job | null {
  const cur = getJob(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare(`UPDATE jobs SET name=?, schedule=?, action=?, push=?, enabled=? WHERE id=?`)
    .run(next.name, next.schedule, next.action, next.push, next.enabled ? 1 : 0, id);
  return getJob(id)!;
}

export function deleteJob(id: string): boolean {
  const r = db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM job_logs WHERE job_id = ?`).run(id);
  return Number(r.changes) > 0;
}

// ---- 执行历史 ----
export function listJobLogs(limit = 10): JobLog[] {
  return db.prepare(`SELECT * FROM job_logs ORDER BY id DESC LIMIT ?`)
    .all(limit)
    .map((r) => {
      const x = r as unknown as { id: number; job_id: string; name: string; time: string; result: string | null; ok: number };
      return { id: x.id, jobId: x.job_id, name: x.name, time: x.time, result: x.result ?? "", ok: !!x.ok };
    });
}

function addLog(jobId: string, name: string, result: string, ok: boolean): void {
  const time = new Date().toLocaleString("zh-CN", { hour12: false });
  db.prepare(`INSERT INTO job_logs (job_id, name, time, result, ok) VALUES (?,?,?,?,?)`)
    .run(jobId, name, time, result, ok ? 1 : 0);
}

// ---- 最小调度匹配 ----
function describeSchedule(schedule: string): string {
  if (schedule.startsWith("every:")) {
    const n = schedule.split(":")[1];
    return `每 ${n} 分钟`;
  }
  return schedule.includes(":") ? `每天 ${schedule}` : schedule;
}

/** 判断某个 schedule 是否在当前分钟到期（每天 HH:MM 或每隔 N 分钟） */
function isDue(schedule: string, minuteOfDay: number): boolean {
  if (schedule.startsWith("every:")) {
    const n = parseInt(schedule.split(":")[1], 10);
    return n > 0 && minuteOfDay % n === 0;
  }
  // 形如 "09:00" 或 "每周五 18:00"：取末尾 HH:MM
  const m = /(\d{1,2}):(\d{2})/.exec(schedule);
  if (!m) return false;
  return minuteOfDay === parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** 手动触发一次（也可被调度器调用） */
export async function runJob(id: string): Promise<boolean> {
  const job = getJob(id);
  if (!job) return false;
  try {
    await runTask(`auto${Date.now().toString(36)}`, job.action);
    addLog(job.id, job.name, `成功 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`, true);
    return true;
  } catch (e) {
    addLog(job.id, job.name, `失败 · ${(e as Error).message}`, false);
    return false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
const lastFiredAt = new Map<string, string>(); // id -> "HH:MM" 防同一分钟内重复触发
let lastCleanup = 0; // 上次自动清理时间戳（epoch ms），每 6h 跑一次
const CLEANUP_INTERVAL_MS = 6 * 3600 * 1000;

/** 启动本地调度器（幂等）。每 30s 检查一次。 */
export function startScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    // M32：定时自动清理 —— 每 6 小时跑一次（过期任务/交付文件/审计裁剪）
    if (Date.now() - lastCleanup >= CLEANUP_INTERVAL_MS) {
      lastCleanup = Date.now();
      try { runCleanup(); } catch { /* 不因清理失败拖垮调度器 */ }
    }
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const key = `${now.getHours()}:${now.getMinutes()}`;
    for (const j of listJobs()) {
      if (!j.enabled) continue;
      // 同一分钟只触发一次（防止 30s 轮询重复投递）
      if (lastFiredAt.get(j.id) === key) continue;
      if (isDue(j.schedule, minuteOfDay)) {
        lastFiredAt.set(j.id, key);
        void runJob(j.id);
      }
    }
  }, 30000);
}
