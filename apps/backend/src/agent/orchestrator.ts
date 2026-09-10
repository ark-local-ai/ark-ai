import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Task, TaskStep, Artifact } from "../types";
import {
  insertTask, insertStep, updateStepStatus, updateTaskStatus,
  insertArtifact, getTask, updateTaskChecksAndTimeline, getActiveSpace, resetTask, getTaskRefs,
} from "../db/store";
import { publish } from "./events";
import { planTask } from "./planner";
import { genOffice, detectKind, type StepContent, type OfficeKind } from "../tools/office";
import { snapshotDeliverable } from "../tools/fileVersions";

/** C2：任务创建时的可选 Agent 配置——由模板/前端带入，让 expert/skills/model 真正落进任务与路由 */
export interface AgentOptions {
  expert?: string;
  skills?: string[];
  /** 偏好的模型（模板指定），用于路由时把匹配渠道提前（非排他） */
  modelHint?: string;
  /** M52：显式附加的参考资料（「送给任务」，跟随任务注入多 Agent 上下文） */
  refs?: AttachmentRef[];
}
import { defaultTool } from "../tools/registry";
import { runContentPipeline } from "./pipeline";
import { type AttachmentRef } from "../tools/context";
import { verifyWithRetry } from "./verifier";
import { taskLogger } from "../util/log";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 工作空间根目录 */
const workRoot = join(process.cwd(), "..", "frontend", "public", "workspace");
mkdirSync(workRoot, { recursive: true });

/** 解析当前活动空间的交付目录（默认空间 dir 为空 → 根目录） */
function resolveWorkDir(): string {
  const active = getActiveSpace();
  const dir = active?.dir ? join(workRoot, active.dir) : workRoot;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 解析某步的 note → StepContent（逐步断点续跑 M31 用） */
function sectionFromNote(note: string | undefined | null): StepContent | undefined {
  if (!note) return undefined;
  try {
    const parsed = JSON.parse(note);
    if (parsed && typeof parsed.title === "string" && Array.isArray(parsed.paragraphs)) {
      return { title: parsed.title, paragraphs: parsed.paragraphs as string[] };
    }
  } catch {
    /* note 不是上次断点存的内容结构，忽略 */
  }
  return undefined;
}

/**
 * 核心步骤执行循环：从 startIdx 起逐条经 Tool Registry 真执行，产出 StepContent 注入 sections，
 * 最后一步生成可编辑 Office 交付。M10 起逐步真执行；M31 起可被「断点续跑」从中间开始。
 */
async function runPlanSteps(opts: {
  id: string;
  userId?: string;
  plan: string[];
  stepIds: number[];
  kind: OfficeKind;
  startIdx: number;
  sections: StepContent[];
  task: Task;
  modelHint?: string;
  refs?: AttachmentRef[];
}): Promise<void> {
  const { id, userId, plan, stepIds, kind, startIdx, sections, task, modelHint, refs } = opts;
  const log = taskLogger(id);

  // 若从断点开局，前面 done 的步骤已算作"理解需求中"，先同步 checks 基态
  if (startIdx >= 1) task.checks[0].ok = true;

  for (let stepIdx = startIdx; stepIdx < plan.length; stepIdx++) {
    const title = plan[stepIdx];
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
    const now0 = new Date().toTimeString().slice(0, 5);
    task.timeline.push({ time: now0, label: "执行步骤" });
    publish({ type: "check", taskId: id, data: task.checks });

    // M10：逐步真实执行 —— 经 Tool Registry 调用工具，产出该步正文段
    const tool = defaultTool; // 当前单一"内容整编"工具；后续按步选工具
    const result = tool.run({ prompt: task.prompt, plan, step: title, kind });
    const stepContent: StepContent = { title: result.title, paragraphs: result.body };
    sections.push(stepContent);

    // 中间产物：每一步的内容作为 artifact 推送（无具体文件，仅展示说明）
    publish({
      type: "artifact", taskId: id,
      data: { name: `步骤${stepIdx + 1}`, kind, note: result.body[0]?.slice(0, 40) ?? result.title, path: undefined },
    });

    await sleep(700); // 模拟执行/工具耗时

    if (stepIdx === plan.length - 1) {
      // 最后一步：生成真实可编辑 Office 文件（PPT/Excel/Word），注入各步结果，带验收重试（最多 3 次）
      const dir = resolveWorkDir();
      // M10b：多 Agent 内容管线（分析师 → 写手 → 校验），LLM 可用时真内容，否则脚本降级
      const { sections: contentSections, agents } = await runContentPipeline(task.prompt, plan, kind, modelHint, userId, refs);
      const anyLLM = agents.analyst || agents.writer || agents.editor;
      const { name, kind: fKind } = await verifyWithRetry(
        () => genOffice(task.prompt, plan, dir, contentSections), 3,
      );
      const deliver: Artifact = {
        name, kind: fKind,
        note: anyLLM
          ? `Ark 生成 · 多 Agent(分析/写手/校验)${agents.writer ? " · 真实 LLM 内容" : ""} · 可编辑 Office 文件`
          : "Ark 生成 · 脚本模板（未配模型渠道）· 可编辑 Office 文件",
        path: name,
      };
      insertArtifact(deliver, id, 1);
      task.deliverable = deliver;
      // C5：每次产出交付即快照进版本历史（_ark_versions/<name>/<seq>-<name> + file_versions 表）
      snapshotDeliverable(dir, deliver.name, id);
      log.info({ deliverable: deliver.name }, "task deliverable created");
      publish({ type: "deliver", taskId: id, data: deliver });
    }

    // 断点续跑（M31）：在置 done 时把本步产出整篇持久化进 note（此时 status=done 不会被后续覆盖），
    // 重启 resumeTask 据此接回已完成步骤，不必重跑。
    updateStepStatus(sid, "done", JSON.stringify(stepContent));
    task.steps[stepIdx].status = "done";
    publish({ type: "step", taskId: id, data: { stepId: sid, status: "done" } });
    if (stepIdx >= 1) { task.checks[0].ok = true; }
    if (stepIdx >= 3) {
      task.checks[1].ok = true; // 已完成不少于 3 步
      task.checks[2].ok = true; // 已生成成果
    }
    publish({ type: "check", taskId: id, data: task.checks });
  }
}

/** 收尾：置 done + 广播 + 落库最终 checks/timeline */
function finishTask(id: string, task: Task): Task {
  updateTaskStatus(id, "done");
  task.status = "done";
  task.steps.forEach((s) => (s.status = "done"));
  const now = new Date().toTimeString().slice(0, 5);
  task.timeline.push({ time: now, label: "执行完成" });
  taskLogger(id).info({ status: "done" }, "task finished");
  publish({ type: "check", taskId: id, data: task.checks });
  publish({ type: "done", taskId: id, data: { taskId: id } });
  updateTaskChecksAndTimeline(id, task.checks, task.timeline);
  const saved = getTask(id);
  return saved ?? task;
}

export async function runTask(id: string, prompt: string, userId?: string, opts?: AgentOptions): Promise<Task> {
  const log = taskLogger(id); // 用任务 ID 贯穿编排全过程日志
  const title = prompt.slice(0, 20) || "未命名任务";
  const created = new Date().toLocaleString("zh-CN", { hour12: false });

  // 规划：优先 LLM 拆真步骤，失败降级脚本；模板可给 modelHint 偏好的模型
  const { steps: planned, model } = await planTask(prompt, opts?.modelHint);
  log.info({ userId, plan: planned.map((p) => p.title), model }, "task started");
  const plan = planned.map((p) => p.title);
  const modelUsed = model;

  const task: Task = {
    id, title, prompt, status: "queue", model: modelUsed,
    expert: opts?.expert || "数据分析师",
    skills: opts?.skills?.length ? opts.skills : ["文件生成"],
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
    created,
    archived: false,
  };

  // 幂等复位：重试同一 id 时先清掉上次残留的 steps/artifacts/主行，再写新快照
  resetTask(id);
  // 持久化任务 + 步骤（M64：把 refs 参考资料一并落库，断点续跑时才不丢）
  insertTask(task, userId, opts?.refs);
  const stepIds: number[] = [];
  plan.forEach((p, i) => stepIds.push(insertStep(id, i, p)));
  task.steps = plan.map((title, i) => ({ id: stepIds[i], title, status: "pending" }));

  // 置为运行并广播计划
  updateTaskStatus(id, "running");
  task.status = "running";
  publish({ type: "plan", taskId: id, data: task.steps });
  publish({ type: "step", taskId: id, data: { stepId: stepIds[0], status: "running" } });

  // M30 后并发由 runner 管；压缩 sleep 反馈清晰
  await runPlanSteps({ id, userId, plan, stepIds, kind: detectKind(prompt), startIdx: 0, sections: [], task, modelHint: opts?.modelHint, refs: opts?.refs });
  return finishTask(id, task);
}

/**
 * M31 逐步断点续跑：进程重启后调用（runner.resumeUnfinishedTasks 的 execute 走这里）。
 * 与 runTask 不同：不 resetTask 从零重跑，而是读取已持久化的步骤，把「已完成」步的产出（note）
 * 接回 sections，只重跑第一个未完成步开始的余下部分，再从末步重新生成交付。
 * 若库里没有任何已落步骤（从未跑过/被清空），退化为全新 runTask。
 */
export async function resumeTask(id: string, prompt: string, userId?: string): Promise<Task> {
  const log = taskLogger(id);
  const existing = getTask(id);
  const stepIds = existing?.steps?.map((s) => s.id as number) ?? [];
  const storedTitles: string[] = [];
  let startIdx = 0;
  const sections: StepContent[] = [];
  // M64：断点续跑时重建「送给任务」的参考资料（此前已随 insertTask 落库），不因重启/续跑丢失
  const refs: AttachmentRef[] = getTaskRefs(id);

  if (existing && stepIds.length > 0) {
    // 沿用已持久化步骤（其标题即计划），断点 = 第一个非 done 的步骤下标
    existing.steps.forEach((s, i) => {
      storedTitles.push(s.title);
      if (s.status === "done") {
        const seeded = sectionFromNote(s.note as string | undefined);
        if (seeded) sections.push(seeded); // 把已产出接回，避免重跑已完成的步
        startIdx = i + 1;
      }
    });
    log.info({ userId, resumeFromStep: startIdx, totalSteps: storedTitles.length }, "task resumed from checkpoint");
  } else {
    // 无已落步骤：没跑过就正常全新跑（M64：仍带上已持久化的 refs，避免全新跑时丢参考资料）
    return runTask(id, prompt, userId, refs.length ? { refs } : undefined);
  }

  const task: Task = {
    id, title: existing ? existing.title : prompt.slice(0, 20) || "未命名任务",
    prompt, status: "running", model: existing?.model ?? null,
    expert: "数据分析师", skills: ["文件生成"], workspace: "默认工作空间",
    steps: existing ? existing.steps : [], artifacts: existing?.artifacts ?? [],
    deliverable: existing?.deliverable ?? null,
    checks: existing?.checks ?? [
      { label: "已理解需求意图", ok: false },
      { label: "已完成不少于 3 个执行步骤", ok: false },
      { label: "已生成可下载的成果文件", ok: false },
    ],
    timeline: existing?.timeline ?? [{ time: "00:00", label: "创建任务" }],
    created: existing?.created ?? new Date().toLocaleString("zh-CN", { hour12: false }),
    archived: existing?.archived ?? false,
  };

  // 需要重跑的步骤（startIdx 之后）确保库里存在且对齐
  if (startIdx === stepIds.length) {
    // 所有步都 done 但任务没置 done（进程崩在收尾）：无需重跑步骤，直接重新生成交付
    const plan = storedTitles;
    await runPlanSteps({ id, userId, plan, stepIds, kind: detectKind(prompt), startIdx: stepIds.length - 1, sections, task, refs });
  } else {
    updateTaskStatus(id, "running");
    task.status = "running";
    publish({ type: "step", taskId: id, data: { stepId: stepIds[Math.max(0, startIdx)], status: "running" } });
    await runPlanSteps({ id, userId, plan: storedTitles, stepIds, kind: detectKind(prompt), startIdx, sections, task, refs });
  }

  return finishTask(id, task);
}
