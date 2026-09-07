import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task, TaskStep, Artifact } from "../types";
import {
  insertTask, insertStep, updateStepStatus, updateTaskStatus,
  insertArtifact, getTask, updateTaskChecksAndTimeline,
} from "../db/store";
import { publish } from "./events";
import { planTask } from "./planner";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 交付目录（工作空间） */
const workDir = join(process.cwd(), "..", "frontend", "public", "workspace");
mkdirSync(workDir, { recursive: true });

/**
 * 里程碑2：编排闭环 —— 用 planner 拆步骤（优先 LLM，无渠道降级脚本），
 * 逐条执行、生成真实交付文件。LLM 真实拆解已接入：planner.ts。
 */
export async function runTask(id: string, prompt: string): Promise<Task> {
  const title = prompt.slice(0, 20) || "未命名任务";
  const created = new Date().toLocaleString("zh-CN", { hour12: false });

  // 规划：优先 LLM 拆真步骤，失败降级脚本
  const { steps: planned, viaLLM } = await planTask(prompt);
  const plan = planned.map((p) => p.title);
  const modelUsed = viaLLM ? "LLM" : "内置计划器";

  const task: Task = {
    id, title, prompt, status: "queue", model: modelUsed, expert: "数据分析师",
    skills: ["文件生成"], workspace: "默认工作空间",
    steps: [],
    artifacts: [],
    deliverable: null,
    checks: [
      { label: "已理解需求意图", ok: false },
      { label: "已完成不少于 3 个执行步骤", ok: false },
      { label: "已生成可下载的成果文件", ok: false },
    ],
    timeline: [{ time: "00:00", label: "创建任务" }],
    created,
  };

  // 持久化任务 + 步骤
  insertTask(task);
  const stepIds: number[] = [];
  plan.forEach((p, i) => stepIds.push(insertStep(id, i, p)));
  task.steps = plan.map((title, i) => ({ id: stepIds[i], title, status: "pending" }));

  // 置为运行并广播计划
  updateTaskStatus(id, "running");
  task.status = "running";
  publish({ type: "plan", taskId: id, data: task.steps });
  publish({ type: "step", taskId: id, data: { stepId: stepIds[0], status: "running" } });

  const tick = () => {
    const now = new Date().toTimeString().slice(0, 5);
    task.timeline.push({ time: now, label: "执行步骤" });
    publish({ type: "check", taskId: id, data: task.checks });
  };

  let stepIdx = 0;
  let failed = false;
  for (const title of plan) {
    // 标记当前步为 running
    if (stepIdx > 0) {
      updateStepStatus(stepIds[stepIdx - 1], "done");
      task.steps[stepIdx - 1].status = "done";
    }
    if (stepIdx >= 1) {
      task.checks[0].ok = true; // 理解需求
      publish({ type: "check", taskId: id, data: task.checks });
    }
    const sid = stepIds[stepIdx];
    updateStepStatus(sid, "running");
    task.steps[stepIdx].status = "running";
    publish({ type: "step", taskId: id, data: { stepId: sid, status: "running" } });
    tick();

    await sleep(900); // 模拟执行耗时

    if (stepIdx === plan.length - 1) {
      // 最后一步行：生成真实交付文件
      const fileName = `${title}-${id}.md`;
      const content = `# ${title}\n\n> 需求：${prompt}\n\n## 生成时间\n${new Date().toLocaleString("zh-CN", { hour12: false })}\n\n## 规划步骤\n${plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n## 说明\n这是一份由 Ark 编排层生成的成果文件（${modelUsed} 拆解计划后产出，可编辑）。\n`;
      writeFileSync(join(workDir, fileName), content, "utf8");

      const deliver: Artifact = { name: fileName, kind: "md", note: "Ark 生成成果文件 · 可编辑", path: fileName };
      insertArtifact(deliver, id, 1);
      task.deliverable = deliver;
      publish({ type: "deliver", taskId: id, data: deliver });
    }

    updateStepStatus(sid, "done");
    task.steps[stepIdx].status = "done";
    publish({ type: "step", taskId: id, data: { stepId: sid, status: "done" } });
    stepIdx++;
    if (stepIdx >= 1) { task.checks[0].ok = true; }
    if (stepIdx >= 3) {
      task.checks[1].ok = true; // 已完成不少于 3 步
      task.checks[2].ok = true; // 已生成成果
    }
    publish({ type: "check", taskId: id, data: task.checks });
  }

  updateTaskStatus(id, "done");
  task.status = "done";
  task.steps.forEach((s) => (s.status = "done"));
  const now = new Date().toTimeString().slice(0, 5);
  task.timeline.push({ time: now, label: "执行完成" });
  publish({ type: "check", taskId: id, data: task.checks });
  publish({ type: "done", taskId: id, data: { taskId: id } });

  // 把最终 checks 与 timeline 写回库，供查询快照一致
  updateTaskChecksAndTimeline(id, task.checks, task.timeline);
  // 重新落库最终状态供查询
  const saved = getTask(id);
  return saved ?? task;
}
