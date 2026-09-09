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
  archived: boolean;
}

export async function createTask(prompt: string): Promise<string> {
  const res = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
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

/** 全局事件回调：`type` + 展开后的 data（全局事件 data = { taskId, … }） */
export type GlobalEventHandler = (event: {
  type: SseEventType;
  taskId?: string;
  data: Record<string, unknown>;
}) => void;

/** 订阅【所有】任务事件流（/api/events）；返回取消函数（M21） */
export function subscribeGlobal(onEvent: GlobalEventHandler): () => void {
  const es = new EventSource(`${BASE}/api/events`);
  const types: SseEventType[] = [
    "plan", "step", "artifact", "deliver", "check", "done", "error",
  ];
  types.forEach((t) => {
    es.addEventListener(t, (e) => {
      const data = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      onEvent({ type: t, taskId: data.taskId as string | undefined, data });
    });
  });
  return () => es.close();
}

export function workspaceUrl(name: string, spaceId?: string): string {
  const q = spaceId ? `?space=${encodeURIComponent(spaceId)}` : "";
  return `${BASE}/api/workspace/${encodeURIComponent(name)}${q}`;
}

/** 若已登录则附带 Bearer 头（资源按用户隔离）。getToken 为提升的函数声明，运行时可访问。 */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
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
  const res = await fetch(`${BASE}/api/workspace${q}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取工作空间失败: ${res.status}`);
  return res.json();
}

// ===== 工作空间全文搜索（M20，FTS5）=====
export interface WorkspaceSearchResult {
  name: string;
  kind: string;
  size: number;
  sizeText: string;
  time: string;
  space: string;
  spaceName: string;
  spaceId: string | null;
}

export async function searchWorkspace(q: string): Promise<WorkspaceSearchResult[]> {
  const res = await fetch(`${BASE}/api/workspace/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`搜索工作空间失败: ${res.status}`);
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
  const res = await fetch(`${BASE}/api/spaces`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取空间失败: ${res.status}`);
  return res.json();
}

export async function createSpace(name: string, dir?: string): Promise<SpaceDto> {
  const res = await fetch(`${BASE}/api/spaces`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, dir }),
  });
  if (!res.ok) throw new Error(`新建空间失败: ${res.status}`);
  return res.json();
}

export async function deleteSpace(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/spaces/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`删除空间失败: ${res.status}`);
}

export async function setActiveSpace(id: string): Promise<SpaceDto> {
  const res = await fetch(`${BASE}/api/spaces/${id}/active`, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw new Error(`切换空间失败: ${res.status}`);
  return res.json();
}

/** 某空间目录下的文件列表 */
export async function listSpaceFiles(id: string): Promise<WorkspaceFileDto[]> {
  const res = await fetch(`${BASE}/api/spaces/${id}/files`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取空间文件失败: ${res.status}`);
  return res.json();
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/**
 * 发送对话，返回 SSE 流式回复（fetch stream 解析 token）。
 * onToken 每次收到文本增量调用；onDone 流结束（带完整回复文本与 sessionId）；onError 连接异常。
 * sessionId: M19 会话持久化——无则后端创建新会话，有则续写该会话。
 * 返回取消函数。
 */
export function sendChat(
  message: string,
  history: ChatMsg[],
  onToken: (t: string) => void,
  onDone?: (result: { text: string; sessionId?: string; taskId?: string }) => void,
  onError?: (err: unknown) => void,
  sessionId?: string,
  opts?: { runTask?: boolean; onTaskCreated?: (taskId: string, sessionId?: string) => void },
): () => void {
  const ctrl = new AbortController();
  let closed = false;

  (async () => {
    let full = "";
    let returnSessionId: string | undefined = sessionId;
    let taskIdRef: string | undefined;
    try {
      const res = await fetch(`${BASE}/api/chat`, {
        method: "POST",
        signal: ctrl.signal,
        headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({ message, history, sessionId, runTask: opts?.runTask }),
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
          const data = JSON.parse(dataStr) as { text?: string; sessionId?: string; taskId?: string };
          if (eventType === "task_created" && data.taskId) {
            if (data.sessionId) returnSessionId = data.sessionId;
            taskIdRef = data.taskId;
            opts?.onTaskCreated?.(data.taskId, data.sessionId);
          } else if (eventType === "token" && data.text) {
            full += data.text;
            onToken(data.text);
          } else if (eventType === "done") {
            if (data.sessionId) returnSessionId = data.sessionId;
          }
        }
      }
      if (!closed) onDone?.({ text: full, sessionId: returnSessionId, taskId: taskIdRef });
    } catch (err) {
      if (!closed && onError) onError(err);
    }
  })();

  return () => {
    closed = true;
    ctrl.abort();
  };
}

// ===== 对话会话持久化（M19）=====
export interface ChatSessionDto {
  id: string; title: string; created: string; updated: string;
}

export async function listChatSessions(): Promise<ChatSessionDto[]> {
  const res = await fetch(`${BASE}/api/chat/sessions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取会话失败: ${res.status}`);
  return res.json();
}

export async function getChatMessages(sessionId: string): Promise<ChatMsg[]> {
  const res = await fetch(`${BASE}/api/chat/sessions/${sessionId}/messages`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取会话消息失败: ${res.status}`);
  const d = (await res.json()) as { messages: ChatMsg[] };
  return d.messages;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/chat/sessions/${sessionId}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`删除会话失败: ${res.status}`);
}

/** 对话搜索命中（M23）：一个会话去重为一条，含标题/角色/片段，可跳回会话 */
export interface ChatSearchHit {
  sessionId: string;
  title: string;
  role: string;
  snippet: string;
  updated: string;
}

/** 按消息内容全文搜索历史对话（后端 FTS5 trigram） */
export async function searchChatMessages(q: string): Promise<ChatSearchHit[]> {
  const res = await fetch(`${BASE}/api/chat/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`搜索对话失败: ${res.status}`);
  return res.json();
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
    headers: authHeaders({ "Content-Type": "application/json" }),
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

export interface ExpertInput {
  name: string;
  icon?: string;
  color?: string;
  desc?: string;
  skills?: string;
  connectors?: string;
}

export async function createExpert(input: ExpertInput): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/experts`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`创建专家失败: ${res.status}`);
  return res.json();
}

export async function updateExpert(id: string, input: ExpertInput): Promise<void> {
  const res = await fetch(`${BASE}/api/experts/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`编辑专家失败: ${res.status}`);
}

export async function deleteExpert(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/experts/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`删除专家失败: ${res.status}`);
}

/** 新建技能：新建时需给出 code，其余字段可缺省 */
export async function createSkill(id: string, body: Partial<SkillDto>): Promise<SkillDto> {
  const res = await fetch(`${BASE}/api/skills/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`创建技能失败: ${res.status}`);
  return res.json();
}

export async function deleteSkill(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/skills/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`删除技能失败: ${res.status}`);
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`创建任务失败: ${res.status}`);
  return res.json();
}

export async function updateJob(id: string, body: Partial<JobDto>): Promise<JobDto> {
  const res = await fetch(`${BASE}/api/jobs/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新任务失败: ${res.status}`);
  return res.json();
}

export async function deleteJob(id: string): Promise<void> {
  await fetch(`${BASE}/api/jobs/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function runJobNow(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/jobs/${id}/run`, { method: "POST", headers: authHeaders() });
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
  priority?: number; // 用户优先级 0-100，默认 50
  cost?: number;     // 每千 token 成本（约 $）
  latency?: number | null; // 实测平均延迟 ms
  score?: number;    // 路由综合评分 0-1
}

export async function listChannels(): Promise<ChannelDto[]> {
  const res = await fetch(`${BASE}/api/channels`);
  if (!res.ok) throw new Error(`获取渠道失败: ${res.status}`);
  return res.json();
}

// ===== 统计仪表盘（M18）=====
export interface StatsDto {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    recent: { id: string; title: string; created: string; status: string }[];
  };
  channels: {
    total: number;
    avgRate: number;
    avgLatency: number | null;
    avgScore: number;
    best: { id: string; name: string; model: string; score: number } | null;
  };
}

export async function getStats(): Promise<StatsDto> {
  const res = await fetch(`${BASE}/api/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取统计失败: ${res.status}`);
  return res.json();
}

// ===== 任务队列状态（M30）=====
export interface QueueDto {
  active: number; // 正在执行的任务数
  queued: number; // 排队待执行的任务数
  concurrency: number; // 配置的并发上限
}

export async function getQueue(): Promise<QueueDto> {
  const res = await fetch(`${BASE}/api/queue`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取队列失败: ${res.status}`);
  return res.json();
}


export async function createChannel(p: { name: string; proto: "openai" | "anthropic"; model: string; baseUrl: string; apiKey?: string }): Promise<ChannelDto> {
  const res = await fetch(`${BASE}/api/channels`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`新增渠道失败: ${res.status}`);
  return res.json();
}

export async function updateChannel(id: string, body: Partial<ChannelDto>): Promise<ChannelDto> {
  const res = await fetch(`${BASE}/api/channels/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`更新渠道失败: ${res.status}`);
  return res.json();
}

export async function deleteChannel(id: string): Promise<void> {
  await fetch(`${BASE}/api/channels/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function setDefaultChannel(id: string): Promise<void> {
  await fetch(`${BASE}/api/channels/${id}/default`, { method: "POST", headers: authHeaders() });
}

export async function testChannel(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/channels/${id}/test`, { method: "POST", headers: authHeaders() });
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

export interface RecentTaskDto { id: string; title: string; created: string; status: string; archived: boolean; }

export async function listTasks(archivedOnly = false): Promise<RecentTaskDto[]> {
  const res = await fetch(`${BASE}/api/tasks${archivedOnly ? "?archived=1" : ""}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取任务列表失败: ${res.status}`);
  return res.json();
}

/** 归档/取消归档任务（M22） */
export async function setTaskArchived(id: string, archived: boolean): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/${id}/archive`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) throw new Error(`归档任务失败: ${res.status}`);
}

/** 重试任务：把 failed/done 任务用原 prompt 重新入队（M17） */
export async function retryTask(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/${id}/retry`, {
    method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`重试任务失败: ${res.status}`);
}

/** 删除任务（含其步骤/产物）（M17） */
export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) throw new Error(`删除任务失败: ${res.status}`);
}

// ===== 本地用户认证（M12）=====
const TOKEN_KEY = "ark_session_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  created: string;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** 首屏：是否有用户、是否已登录 */
export async function getAuthStatus(): Promise<{ hasUsers: boolean; me: AuthUser | null }> {
  const res = await fetch(`${BASE}/api/auth/status`);
  return res.json();
}

export async function register(username: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await authFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? `注册失败: ${res.status}`);
  }
  const data = (await res.json()) as { token: string; user: AuthUser };
  setToken(data.token);
  return data.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await authFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? `登录失败: ${res.status}`);
  }
  const data = (await res.json()) as { token: string; user: AuthUser };
  setToken(data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  try { await authFetch("/api/auth/logout", { method: "POST" }); } catch { /* 忽略 */ }
  setToken(null);
}

/** 取当前登录用户；未登录返回 null */
export async function me(): Promise<AuthUser | null> {
  const res = await authFetch("/api/auth/me");
  if (!res.ok) return null;
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

// ===== M33 任务模板 =====
export interface TaskTemplateDto {
  id: string;
  name: string;
  desc?: string;
  prompt: string;
  expert?: string;
  skills?: string[];
  model?: string;
  created: string;
}

export async function listTemplates(): Promise<TaskTemplateDto[]> {
  const res = await fetch(`${BASE}/api/templates`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取模板失败: ${res.status}`);
  return res.json();
}

export async function createTemplate(input: {
  name: string; desc?: string; prompt: string; expert?: string; skills?: string[]; model?: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/api/templates`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`创建模板失败: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateTemplate(id: string, input: Partial<TaskTemplateDto>): Promise<void> {
  const res = await fetch(`${BASE}/api/templates/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`更新模板失败: ${res.status}`);
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/templates/${id}`, {
    method: "DELETE", headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`删除模板失败: ${res.status}`);
}

/** 应用模板：以其提示词创建并启动一个真实任务 */
export async function runTemplate(id: string): Promise<string> {
  const res = await fetch(`${BASE}/api/templates/${id}/run`, {
    method: "POST", headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`应用模板失败: ${res.status}`);
  const data = (await res.json()) as { taskId: string };
  return data.taskId;
}

/** 另存为模板（C1）：从已完成任务一键固化为模板，返回模板 id */
export async function saveTaskAsTemplate(id: string, name?: string): Promise<string> {
  const res = await fetch(`${BASE}/api/tasks/${id}/template`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (!res.ok) throw new Error(`另存为模板失败: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

// ===== C5 交付版本历史 =====
export interface FileVersionDto { seq: number; ts: string; taskId?: string | null; }

export async function listFileVersions(name: string): Promise<FileVersionDto[]> {
  const res = await fetch(`${BASE}/api/versions/${encodeURIComponent(name)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`获取版本失败: ${res.status}`);
  return res.json();
}

export async function rollbackFileVersion(name: string, seq: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/versions/${encodeURIComponent(name)}/rollback`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ seq }),
  });
  if (!res.ok) throw new Error(`回滚失败: ${res.status}`);
  return res.json();
}
