import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task, TaskStatus } from "../types";

/**
 * 测试用：把 ARK_DB_PATH 指向一个临时文件，再动态 import store，
 * 让测试跑在独立数据库上，绝不触碰真实 data/ark.db。
 * 返回 store 模块与临时库路径（供 afterAll 清理）。
 */
export async function loadIsolatedStore() {
  const dir = mkdtempSync(join(tmpdir(), "ark-test-"));
  const dbPath = join(dir, "test.db");
  process.env.ARK_DB_PATH = dbPath;
  process.env.ARK_TEST = "1";
  // 动态导入以在设置好环境变量后再执行 module 副作用
  const store = await import("../db/store");
  return { store, dir, dbPath };
}

/** 构造一个最小的 Task 对象（insertTask / orchestrator task 共用） */
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `t${Math.random().toString(36).slice(2, 8)}`,
    title: "测试任务",
    prompt: "生成一份测试报告",
    status: "queue",
    model: "内置计划器",
    expert: "数据分析师",
    skills: ["文件生成"],
    workspace: "默认工作空间",
    steps: [],
    artifacts: [],
    deliverable: null,
    checks: [
      { label: "已理解需求意图", ok: false },
      { label: "已完成不少于 3 个执行步骤", ok: false },
      { label: "已生成可下载的成果文件", ok: false },
    ],
    timeline: [{ time: "00:00", label: "创建任务" }],
    created: new Date().toLocaleString("zh-CN", { hour12: false }),
    archived: false,
    ...overrides,
  };
}

/** 状态快捷构造 */
export function taskWithStatus(id: string, status: TaskStatus, extra: Partial<Task> = {}): Task {
  return makeTask({ id, status, ...extra });
}

/** 清理临时库目录（afterAll 用） */
export function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
}
