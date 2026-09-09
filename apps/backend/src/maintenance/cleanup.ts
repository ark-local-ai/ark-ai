// ===== 自动清理策略（M32）=====
// 本地工具跑久了会积累：过期任务（含其落盘的交付文件）与无限增长的审计日志。
// 清理策略按龄/按量裁剪，均可由环境变量配置（默认保守，本地个人数据不误删）：
//   - ARK_CLEANUP_ENABLED       总开关，默认 "1"（开启）
//   - ARK_CLEANUP_TASK_DAYS     保留终态任务的天数，默认 90（更早的 done/failed 任务被清；running/queue/归档不碰）
//   - ARK_CLEANUP_AUDIT_MAX     审计日志保留条数，默认 5000（只留最新 N 条）
// 作用对象刻意只选「终态」任务并跳过归档，避免误删正在跑或用户主动留下的任务。

import { existsSync, unlinkSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCleanableTaskIds, listDeliverableFiles, deleteTask, pruneAudit, db,
} from "../db/store.js";
import { taskLogger } from "../util/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workRoot = normalize(join(__dirname, "..", "..", "..", "frontend", "public", "workspace"));

const CLEANUP_ENABLED = process.env.ARK_CLEANUP_ENABLED !== "0";
const TASK_DAYS = (() => {
  const n = Number(process.env.ARK_CLEANUP_TASK_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : 90;
})();
const AUDIT_MAX = (() => {
  const n = Number(process.env.ARK_CLEANUP_AUDIT_MAX);
  return Number.isFinite(n) && n >= 1 && n <= 100000 ? n : 5000;
})();

/** 只删落在工作区根目录内的文件，防目录穿越误删其他路径 */
function safeUnlink(absPath: string): void {
  const norm = normalize(absPath);
  if (!norm.startsWith(workRoot)) return; // 越界不删
  if (existsSync(norm)) {
    try {
      unlinkSync(norm);
    } catch {
      /* 文件被占用等，忽略 */
    }
  }
}

/**
 * 执行一次清理；返回本次清理摘要。
 * 入口：手动 `POST /api/maintenance/cleanup` 与调度器定时 tick（见 scheduler）。
 */
export function runCleanup(): {
  enabled: boolean;
  tasksDeleted: number;
  filesDeleted: number;
  auditPruned: number;
  taskRetentionDays: number;
  auditKeepMax: number;
} {
  const log = taskLogger("cleanup");
  const summary = {
    enabled: CLEANUP_ENABLED,
    tasksDeleted: 0,
    filesDeleted: 0,
    auditPruned: 0,
    taskRetentionDays: TASK_DAYS,
    auditKeepMax: AUDIT_MAX,
  };
  if (!CLEANUP_ENABLED) {
    log.info({ ...summary }, "cleanup skipped (disabled)");
    return summary;
  }

  // 1) 清过期终态任务 + 其落盘交付文件
  const olderThan = Date.now() - TASK_DAYS * 24 * 3600 * 1000;
  const cleanable = getCleanableTaskIds(olderThan);
  if (cleanable.length > 0) {
    const ids = cleanable.map((t) => t.id);
    const files = listDeliverableFiles(ids);
    for (const f of files) safeUnlink(join(workRoot, f.path));
    summary.filesDeleted = files.length;
    for (const t of cleanable) deleteTask(t.id);
    summary.tasksDeleted = cleanable.length;
  }

  // 2) 裁剪审计日志到保留条数
  const beforeAudit = db.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get() as { n: number };
  if (beforeAudit.n > AUDIT_MAX) {
    summary.auditPruned = pruneAudit(AUDIT_MAX);
  }

  log.info({ ...summary }, "cleanup finished");
  return summary;
}
