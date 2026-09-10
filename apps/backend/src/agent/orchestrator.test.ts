import { describe, expect, it, vi, beforeEach } from "vitest";

// resumeTask（M31）依赖的重模块全部 mock —— 只测「断点续跑」的决策与不重跑已完成步骤。
const mocks = vi.hoisted(() => {
  const noopLog = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
  return {
    log: () => noopLog,
    publish: vi.fn(),
    getTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateStepStatus: vi.fn(),
    updateTaskChecksAndTimeline: vi.fn(),
    insertArtifact: vi.fn(),
    resetTask: vi.fn(),
    insertTask: vi.fn(),
    insertStep: vi.fn(),
    getTaskRefs: vi.fn(() => []),
    getActiveSpace: vi.fn(() => undefined),
    defaultTool: { run: vi.fn(() => ({ title: "t", body: ["b"] })) },
    runContentPipeline: vi.fn(async () => ({
      sections: [{ title: "s", paragraphs: ["x"] }],
      agents: { analyst: false, writer: false, editor: false },
    })),
    genOffice: vi.fn(async () => ({ name: "成果.pptx", kind: "ppt", path: "/w/成果.pptx" })),
    verifyWithRetry: vi.fn(async (fn: () => unknown) => fn()),
    detectKind: vi.fn(() => "ppt"),
    planTask: vi.fn(),
  };
});

vi.mock("./planner.js", () => ({ planTask: mocks.planTask }));
vi.mock("./pipeline.js", () => ({ runContentPipeline: mocks.runContentPipeline }));
vi.mock("../tools/office.js", () => ({ genOffice: mocks.genOffice, detectKind: mocks.detectKind }));
vi.mock("../tools/registry.js", () => ({ defaultTool: mocks.defaultTool }));
vi.mock("./verifier.js", () => ({ verifyWithRetry: mocks.verifyWithRetry }));
vi.mock("../util/log.js", () => ({ taskLogger: mocks.log }));
vi.mock("./events.js", () => ({ publish: mocks.publish }));
vi.mock("../db/store.js", () => ({
  insertTask: mocks.insertTask,
  insertStep: mocks.insertStep,
  resetTask: mocks.resetTask,
  updateStepStatus: mocks.updateStepStatus,
  updateTaskStatus: mocks.updateTaskStatus,
  updateTaskChecksAndTimeline: mocks.updateTaskChecksAndTimeline,
  insertArtifact: mocks.insertArtifact,
  getTask: mocks.getTask,
  getActiveSpace: mocks.getActiveSpace,
  getTaskRefs: mocks.getTaskRefs,
}));

import { resumeTask, runTask } from "./orchestrator.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeExisting(steps: { id: number; title: string; status: string; note: string | null }[]) {
  return {
    id: "t1", title: "报告", prompt: "做一份报告", status: "running", model: "m",
    expert: "数据分析师", skills: ["文件生成"], workspace: "默认工作空间",
    steps,
    artifacts: [],
    deliverable: null,
    checks: [
      { label: "已理解需求意图", ok: true },
      { label: "已完成不少于 3 个执行步骤", ok: false },
      { label: "已生成可下载的成果文件", ok: false },
    ],
    timeline: [{ time: "00:00", label: "创建任务" }],
    created: "x", archived: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveSpace.mockReturnValue(undefined);
  mocks.detectKind.mockReturnValue("ppt");
  mocks.defaultTool.run.mockReturnValue({ title: "t", body: ["b"] });
  mocks.genOffice.mockResolvedValue({ name: "成果.pptx", kind: "ppt", path: "/w/成果.pptx" });
  mocks.planTask.mockResolvedValue({ steps: [{ title: "a" }, { title: "b" }], model: "m" });
});

describe("resumeTask 断点续跑（M31）", () => {
  it("有已完步骤时从断点续跑：不 reset、不重跑已完成步、沿用持久化标题", async () => {
    // 2 步 done（带产出 note）+ 2 步 pending
    mocks.getTask.mockReturnValue(makeExisting([
      { id: 10, title: "分析需求", status: "done", note: JSON.stringify({ title: "分析需求", paragraphs: ["要点A"] }) },
      { id: 11, title: "搜集资料", status: "done", note: JSON.stringify({ title: "搜集资料", paragraphs: ["要点B"] }) },
      { id: 12, title: "撰写正文", status: "pending", note: null },
      { id: 13, title: "生成交付", status: "pending", note: null },
    ]));

    await resumeTask("t1", "做一份报告", "user1");
    await sleep(5);

    // 关键：断点续跑不 reset 清库、不重插入步骤
    expect(mocks.resetTask).not.toHaveBeenCalled();
    expect(mocks.insertStep).not.toHaveBeenCalled();

    // 重跑的步骤从下标 2（撰写正文）开始 —— 第 0/1 步（已 done）的 updateStepStatus 不应再被置 done
    const stepStatusCalls = mocks.updateStepStatus.mock.calls;
    const touchedSteps = stepStatusCalls.map((c) => c[0]);
    // 只处理 12、13（续跑部分），不碰已完成的 10、11
    expect(touchedSteps).toEqual(expect.not.arrayContaining([10, 11]));
    expect(touchedSteps).toEqual(expect.arrayContaining([12, 13]));

    // 状态流转：续跑置 running → 最终 done
    const statuses = mocks.updateTaskStatus.mock.calls.map((c) => c[1]);
    expect(statuses).toContain("running");
    expect(statuses).toContain("done");
  });

  it("无已落步骤时退化为全新 runTask 行为（会 reset）", async () => {
    mocks.getTask.mockReturnValue(null); // 库里没这个任务
    await resumeTask("t2", "x", undefined);
    await sleep(5);
    // 无断点 → 走全新路径：重置 + 按 plan 插入步骤
    expect(mocks.resetTask).toHaveBeenCalled();
    expect(mocks.insertStep).toHaveBeenCalled();
  });

  it("resumeTask 重建并传递持久化的参考资料（M64）", async () => {
    mocks.getTask.mockReturnValue(makeExisting([
      { id: 10, title: "分析需求", status: "done", note: JSON.stringify({ title: "分析需求", paragraphs: ["要点A"] }) },
      { id: 11, title: "搜集资料", status: "pending", note: null },
    ]));
    // 参考资料此前随 insertTask 落库，续跑时从库重建
    mocks.getTaskRefs.mockReturnValue([{ title: "背景", url: "https://x.example", text: "参考正文" }]);

    await resumeTask("t1", "做一份报告", "user1");
    await sleep(5);

    // runContentPipeline 第 6 参（refs）应带上重建的参考资料
    const pipelineCalls = mocks.runContentPipeline.mock.calls;
    expect(pipelineCalls.length).toBeGreaterThan(0);
    const lastRefs = pipelineCalls[pipelineCalls.length - 1][5];
    expect(Array.isArray(lastRefs)).toBe(true);
    expect(lastRefs[0]).toMatchObject({ title: "背景", url: "https://x.example", text: "参考正文" });

    // 无持久化 refs 时传空数组（不 undefined）
    mocks.getTaskRefs.mockReturnValue([]);
    await resumeTask("t2", "x", undefined);
    await sleep(5);
    const later = mocks.runContentPipeline.mock.calls;
    expect(later[later.length - 1][5]).toEqual([]);
  });
});

describe("C2 模板字段真正生效", () => {
  beforeEach(() => {
    mocks.planTask.mockImplementation(async () => ({
      steps: [{ title: "理解需求" }, { title: "生成成果" }, { title: "校验交付" }],
      viaLLM: false,
      model: "内置计划器",
    }));
    mocks.runContentPipeline.mockImplementation(async () => ({
      sections: [{ title: "s", paragraphs: ["x"] }],
      agents: { analyst: false, writer: false, editor: false },
    }));
    mocks.getActiveSpace.mockReturnValue(undefined);
  });

  it("runTask 带 opts 时把 modelHint 传给 planTask、且 expert/skills 落进任务", async () => {
    mocks.insertTask.mockClear();
    mocks.planTask.mockClear();
    await runTask("c2t", "做一份模板任务", "user1", {
      expert: "财经分析师",
      skills: ["Excel", "数据可视化"],
      modelHint: "DeepSeek · deepseek-chat",
    });

    // modelHint 已传到规划器（驱动渠道偏好）
    const planArg = mocks.planTask.mock.calls[0][1];
    expect(planArg).toBe("DeepSeek · deepseek-chat");

    // expert/skills 真正写进任务记录（不再硬编码默认值）
    const taskArg = mocks.insertTask.mock.calls[0][0];
    expect(taskArg.expert).toBe("财经分析师");
    expect(taskArg.skills).toEqual(["Excel", "数据可视化"]);
  });

  it("runTask 不带 opts 时回落默认 expert/skills", async () => {
    mocks.insertTask.mockClear();
    await runTask("c2t2", "普通任务", undefined);
    const taskArg = mocks.insertTask.mock.calls[0][0];
    expect(taskArg.expert).toBe("数据分析师");
    expect(taskArg.skills).toEqual(["文件生成"]);
  });
});
