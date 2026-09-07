// ===== 任务闭环共享类型（后端）=====

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface TaskStep {
  id: number;
  title: string;
  status: StepStatus;
  note?: string;
}

export type TaskStatus = "queue" | "running" | "done" | "failed";

export interface Artifact {
  name: string;
  kind: string;   // ppt/xls/doc/png/html/pdf/md
  note: string;
  path?: string;
}

export interface Task {
  id: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  model: string;
  expert: string;
  skills: string[];
  workspace: string;
  steps: TaskStep[];
  artifacts: Artifact[];
  deliverable: Artifact | null;
  checks: { label: string; ok: boolean }[];
  timeline: { time: string; label: string }[];
  created: string;
}

export interface SseEvent {
  type: "plan" | "step" | "artifact" | "deliver" | "check" | "done" | "error";
  taskId: string;
  data: unknown;
}
