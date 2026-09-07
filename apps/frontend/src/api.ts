// ===== Ark 前端 API 客户端 =====
// 开发时由 Vite 把 /api 代理到后端 127.0.0.1:4000（见 vite.config.ts）
const BASE = import.meta.env.VITE_API_BASE ?? "";

export interface TaskDto {
  id: string;
  title: string;
  prompt: string;
  status: "queue" | "running" | "done" | "failed";
  model: string;
  expert: string;
  skills: string[];
  workspace: string;
  steps: { id: number; title: string; status: "pending" | "running" | "done" | "failed"; note?: string }[];
  artifacts: { name: string; kind: string; note?: string; path?: string }[];
  deliverable: { name: string; kind: string; note?: string; path?: string } | null;
  checks: { label: string; ok: boolean }[];
  timeline: { time: string; label: string }[];
  created: string;
}

export async function createTask(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error(`创建任务失败: ${res.status}`);
  const data = (await res.json()) as { taskId: string };
  return data.taskId;
}

export async function getTask(id: string): Promise<TaskDto> {
  const res = await fetch(`${BASE}/api/tasks/${id}`);
  if (!res.ok) throw new Error(`获取任务失败: ${res.status}`);
  return res.json();
}

export type SseEventType =
  | "plan" | "step" | "artifact" | "deliver" | "check" | "done" | "error";

export type SseHandler = (event: { type: SseEventType; data: unknown }) => void;

/** 订阅任务 SSE 事件流；返回取消函数 */
export function subscribeTask(id: string, onEvent: SseHandler): () => void {
  const es = new EventSource(`${BASE}/api/tasks/${id}/events`);
  const types: SseEventType[] = [
    "plan", "step", "artifact", "deliver", "check", "done", "error",
  ];
  types.forEach((t) => {
    es.addEventListener(t, (e) => onEvent({ type: t, data: JSON.parse((e as MessageEvent).data) }));
  });
  return () => es.close();
}

export function workspaceUrl(name: string): string {
  return `${BASE}/api/workspace/${encodeURIComponent(name)}`;
}

export interface WorkspaceFileDto {
  name: string;
  kind: string;
  size: number;
  sizeText: string;
  time: string;
}

/** 工作空间真目录扫描：列出交付文件（类型/大小/时间） */
export async function listWorkspace(): Promise<WorkspaceFileDto[]> {
  const res = await fetch(`${BASE}/api/workspace`);
  if (!res.ok) throw new Error(`获取工作空间失败: ${res.status}`);
  return res.json();
}
