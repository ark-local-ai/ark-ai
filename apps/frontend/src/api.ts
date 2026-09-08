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

export function workspaceUrl(name: string, spaceId?: string): string {
  const q = spaceId ? `?space=${encodeURIComponent(spaceId)}` : "";
  return `${BASE}/api/workspace/${encodeURIComponent(name)}${q}`;
}

export interface WorkspaceFileDto {
  name: string;
  kind: string;
  size: number;
  sizeText: string;
  time: string;
}

/** 工作空间真目录扫描：列出交付文件（类型/大小/时间）。spaceId 缺省扫默认空间根目录 */
export async function listWorkspace(spaceId?: string): Promise<WorkspaceFileDto[]> {
  const q = spaceId ? `?space=${encodeURIComponent(spaceId)}` : "";
  const res = await fetch(`${BASE}/api/workspace${q}`);
  if (!res.ok) throw new Error(`获取工作空间失败: ${res.status}`);
  return res.json();
}

// ===== 多工作空间（spaces）=====
export interface SpaceDto {
  id: string;
  name: string;
  dir: string;
  isActive: boolean;
  created: string;
  files?: number;
}

export async function listSpaces(): Promise<SpaceDto[]> {
  const res = await fetch(`${BASE}/api/spaces`);
  if (!res.ok) throw new Error(`获取空间失败: ${res.status}`);
  return res.json();
}

export async function createSpace(name: string, dir?: string): Promise<SpaceDto> {
  const res = await fetch(`${BASE}/api/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, dir }),
  });
  if (!res.ok) throw new Error(`新建空间失败: ${res.status}`);
  return res.json();
}

export async function deleteSpace(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/spaces/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`删除空间失败: ${res.status}`);
}

export async function setActiveSpace(id: string): Promise<SpaceDto> {
  const res = await fetch(`${BASE}/api/spaces/${id}/active`, { method: "POST" });
  if (!res.ok) throw new Error(`切换空间失败: ${res.status}`);
  return res.json();
}

/** 某空间目录下的文件列表 */
export async function listSpaceFiles(id: string): Promise<WorkspaceFileDto[]> {
  const res = await fetch(`${BASE}/api/spaces/${id}/files`);
  if (!res.ok) throw new Error(`获取空间文件失败: ${res.status}`);
  return res.json();
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/**
 * 发送对话，返回 SSE 流式回复（fetch stream 解析 token）。
 * onToken 每次收到文本增量调用；onDone 流结束（带完整回复文本）；onError 连接异常。
 * 返回取消函数。
 */
export function sendChat(
  message: string,
  history: ChatMsg[],
  onToken: (t: string) => void,
  onDone?: (full: string) => void,
  onError?: (err: unknown) => void,
): () => void {
  const ctrl = new AbortController();
  let closed = false;

  (async () => {
    let full = "";
    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message, history }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          let eventType = "message";
          let dataStr = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          const data = JSON.parse(dataStr) as { text?: string };
          if (eventType === "token" && data.text) {
            full += data.text;
            onToken(data.text);
          }
        }
      }
      if (!closed) onDone?.(full);
    } catch (err) {
      if (!closed && onError) onError(err);
    }
  })();

  return () => {
    closed = true;
    ctrl.abort();
  };
}

export interface SkillDto {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  code: string;
}

export async function listSkills(): Promise<SkillDto[]> {
  const res = await fetch(`${BASE}/api/skills`);
  if (!res.ok) throw new Error(`获取技能失败: ${res.status}`);
  return res.json();
}

export async function getSkill(id: string): Promise<SkillDto> {
  const res = await fetch(`${BASE}/api/skills/${id}`);
  if (!res.ok) throw new Error(`获取技能失败: ${res.status}`);
  return res.json();
}

export async function saveSkill(id: string, body: Partial<SkillDto>): Promise<SkillDto> {
  const res = await fetch(`${BASE}/api/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`保存技能失败: ${res.status}`);
  return res.json();
}

export async function toggleSkill(id: string, enabled: boolean): Promise<SkillDto> {
  return saveSkill(id, { enabled });
}

export interface ExpertDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  desc: string;
  skills: string;
  connectors: string;
  builtin: boolean;
}

export async function listExperts(): Promise<ExpertDto[]> {
  const res = await fetch(`${BASE}/api/experts`);
  if (!res.ok) throw new Error(`获取专家失败: ${res.status}`);
  return res.json();
}

export interface JobDto {
  id: string;
  name: string;
  schedule: string;
  action: string;
  push: string;
  enabled: boolean;
  next: string;
}
export interface JobLogDto {
  id: number;
  jobId: string;
  name: string;
  time: string;
  result: string;
  ok: boolean;
}

export async function listJobs(): Promise<JobDto[]> {
  const res = await fetch(`${BASE}/api/jobs`);
  if (!res.ok) throw new Error(`获取任务失败: ${res.status}`);
  return res.json();
}

export async function createJob(p: { name: string; schedule: string; action: string; push?: string; enabled?: boolean }): Promise<JobDto> {
  const res = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`创建任务失败: ${res.status}`);
  return res.json();
}

export async function updateJob(id: string, body: Partial<JobDto>): Promise<JobDto> {
  const res = await fetch(`${BASE}/api/jobs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新任务失败: ${res.status}`);
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  await fetch(`${BASE}/api/jobs/${id}`, { method: "DELETE" });
}

export async function runJobNow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/jobs/${id}/run`, { method: "POST" });
  return res.json();
}

export async function listJobLogs(): Promise<JobLogDto[]> {
  const res = await fetch(`${BASE}/api/jobs/logs`);
  if (!res.ok) throw new Error(`获取执行历史失败: ${res.status}`);
  return res.json();
}
export interface ChannelDto {
  id: string;
  name: string;
  proto: "openai" | "anthropic";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  default?: boolean;
  ok?: number;
  fail?: number;
  rate?: number;
}

export async function listChannels(): Promise<ChannelDto[]> {
  const res = await fetch(`${BASE}/api/channels`);
  if (!res.ok) throw new Error(`获取渠道失败: ${res.status}`);
  return res.json();
}

export async function createChannel(p: { name: string; proto: "openai" | "anthropic"; model: string; baseUrl: string; apiKey?: string }): Promise<ChannelDto> {
  const res = await fetch(`${BASE}/api/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`新增渠道失败: ${res.status}`);
  return res.json();
}

export async function updateChannel(id: string, body: Partial<ChannelDto>): Promise<ChannelDto> {
  const res = await fetch(`${BASE}/api/channels/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新渠道失败: ${res.status}`);
  return res.json();
}

export async function deleteChannel(id: string): Promise<void> {
  await fetch(`${BASE}/api/channels/${id}`, { method: "DELETE" });
}

export async function setDefaultChannel(id: string): Promise<void> {
  await fetch(`${BASE}/api/channels/${id}/default`, { method: "POST" });
}

export async function testChannel(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/channels/${id}/test`, { method: "POST" });
  return res.json();
}

export interface ConnectorDto {
  name: string;
  online: boolean;
  note: string;
  dot: string;
}

export async function listConnectors(): Promise<ConnectorDto[]> {
  const res = await fetch(`${BASE}/api/connectors`);
  if (!res.ok) throw new Error(`获取连接器失败: ${res.status}`);
  return res.json();
}

export interface ScenarioDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  desc: string;
  prompts: { text: string; note: string }[];
}

export async function listScenarios(): Promise<ScenarioDto[]> {
  const res = await fetch(`${BASE}/api/scenarios`);
  if (!res.ok) throw new Error(`获取场景失败: ${res.status}`);
  return res.json();
}

export interface RecentTaskDto { id: string; title: string; created: string; status: string; }

export async function listTasks(): Promise<RecentTaskDto[]> {
  const res = await fetch(`${BASE}/api/tasks`);
  if (!res.ok) throw new Error(`获取任务列表失败: ${res.status}`);
  return res.json();
}
