import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { IconSend, IconTrash, IconNote, IconCheck, IconX } from "../components/icons";
import {
  sendChat, listChatSessions, getChatMessages, deleteChatSession, subscribeTask, workspaceUrl,
  distillSession, saveDistilledFacts,
  type ChatMsg, type ChatSessionDto, type DistillCandidate,
} from "../api";

interface Msg {
  role: "user" | "ai";
  text: string;
  task?: { taskId: string; status: string; steps: { title: string; status: string }[]; deliverable: string | null };
}

const WELCOME: Msg[] = [
  { role: "ai", text: "你好，我是方舟助理。我可以帮你做调研、写文档、做 PPT、分析数据等。点「执行」把这句话变成真实任务，完成后这里给出文件下载。" },
];

const taskStatusLabel = (s: string) =>
  ({ running: "执行中", done: "已完成", failed: "失败", queue: "排队" }[s] ?? s);

export default function Chat() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessParam = params.get("sess");

  const [msgs, setMsgs] = useState<Msg[]>(WELCOME);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionDto[]>([]);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [runMode, setRunMode] = useState(false);
  const [memFlash, setMemFlash] = useState<string | null>(null);
  // M55：/记忆 检索结果芯片（点击引用进输入框）
  const [memResults, setMemResults] = useState<{ id: string; kind: string; content: string }[]>([]);
  // M62：/档案 —— 聚合偏好/事实记忆，渲染成带来源回链的用户档案列表
  const [profileItems, setProfileItems] = useState<{ id: string; kind: string; content: string; source?: string | null; expired?: boolean }[]>([]);
  const [memKeyword, setMemKeyword] = useState("");
  // M58：离开会话时的「记忆沉淀」确认面板
  const [distill, setDistill] = useState<{ candidates: DistillCandidate[]; viaLLM: boolean; error?: string } | null>(null);
  const [distillChecked, setDistillChecked] = useState<Set<number>>(new Set());
  const [distillBusy, setDistillBusy] = useState(false);
  const distillCtxRef = useRef<{ sessionId: string; action: () => void } | null>(null);
  const historyRef = useRef<ChatMsg[]>([]);

  const loadSessions = () => {
    listChatSessions().then(setSessions).catch(() => {});
  };
  useEffect(loadSessions, []);

  // 进入时有 ?sess= 则恢复该会话
  useEffect(() => {
    if (!sessParam) return;
    getChatMessages(sessParam)
      .then((msgs) => {
        historyRef.current = msgs.map((m) => ({ role: m.role, content: m.content }));
        setMsgs(msgs.map((m) => ({ role: m.role === "assistant" ? "ai" : "user", text: m.content })));
        setSessionId(sessParam);
      })
      .catch(() => {});
  }, [sessParam]);

  // M58：离开当前会话前，先尝试沉淀记忆——有当前会话就弹确认面板，否则直接执行
  const requestLeave = (action: () => void) => {
    if (!sessionId || busy) { action(); return; }
    setDistillBusy(true);
    distillSession(sessionId)
      .then((r) => {
        setDistillBusy(false);
        if (r.candidates && r.candidates.length) {
          distillCtxRef.current = { sessionId, action };
          setDistill({ candidates: r.candidates, viaLLM: r.viaLLM, error: r.error });
          setDistillChecked(new Set(r.candidates.map((_, i) => i)));
        } else {
          action();
        }
      })
      .catch(() => { setDistillBusy(false); action(); });
  };

  const newChat = () => {
    const doNew = () => {
      historyRef.current = [];
      setMsgs(WELCOME);
      setSessionId(null);
      setV("");
      nav("/app/chat");
    };
    requestLeave(doNew);
  };

  const openSession = async (id: string) => {
    if (id === sessionId) return;
    requestLeave(() => nav(`/app/chat?sess=${id}`));
  };

  // 确认面板：默认全选，用户可勾掉不想存的
  const toggleDistill = (i: number) => {
    setDistillChecked((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  const confirmDistill = async () => {
    const ctx = distillCtxRef.current;
    if (!ctx) { setDistill(null); return; }
    const chosen = (distill?.candidates ?? []).filter((_, i) => distillChecked.has(i));
    setDistillBusy(true);
    try {
      if (chosen.length) await saveDistilledFacts(ctx.sessionId, chosen);
      setDistill(null);
      distillCtxRef.current = null;
      ctx.action();
    } catch { setDistillBusy(false); }
  };

  const skipDistill = () => {
    const ctx = distillCtxRef.current;
    setDistill(null);
    distillCtxRef.current = null;
    ctx?.action();
  };

  const delSession = async (id: string) => {
    await deleteChatSession(id).catch(() => {});
    if (id === sessionId) { historyRef.current = []; setMsgs(WELCOME); setSessionId(null); setV(""); nav("/app/chat"); }
    loadSessions();
  };

  const send = () => {
    const text = v.trim();
    if (!text || busy) return;
    setV("");
    historyRef.current.push({ role: "user", content: text });
    setMsgs((m) => [...m, { role: "user", text }, { role: "ai", text: "" }]);
    setBusy(true);

    const aiIndex = msgs.length + 1;
    let acc = "";
    let subOff: (() => void) | null = null;

    const setTask = (fn: (t: NonNullable<Msg["task"]>) => NonNullable<Msg["task"]>) => {
      setMsgs((m) => {
        if (aiIndex >= m.length) return m;
        const next = [...m];
        const cur = next[aiIndex];
        const base: NonNullable<Msg["task"]> = cur.task ?? { taskId: "", status: "running", steps: [], deliverable: null };
        next[aiIndex] = { ...cur, task: fn(base) };
        return next;
      });
    };

    sendChat(
      text,
      historyRef.current,
      (t) => {
        acc += t;
        setMsgs((m) => {
          if (aiIndex >= m.length) return m;
          const next = [...m];
          next[aiIndex] = { ...next[aiIndex], text: next[aiIndex].text + t };
          return next;
        });
      },
      ({ text: full, sessionId: sid, taskId }) => {
        historyRef.current.push({ role: "assistant", content: full || acc });
        if (sid) setSessionId(sid);      // 新会话后端创建，记住 id
        if (subOff) { subOff(); subOff = null; }
        setBusy(false);
        loadSessions();
        void taskId;
      },
      () => { if (subOff) { subOff(); subOff = null; } setBusy(false); },
      sessionId ?? undefined,
      {
        runTask: runMode,
        onMemoryCtx: (count) => {
          setMemFlash(`已注入 ${count} 条相关记忆`);
          setTimeout(() => setMemFlash(null), 4000);
        },
        onMemorySearch: (items, keyword) => {
          // /记忆 指令：把命中记忆显示为上方可点选的芯片
          setMemResults(items);
          setMemKeyword(keyword);
          if (memFlash) setMemFlash(null);
        },
        onMemoryProfile: (items) => {
          // /档案 指令：把偏好/事实记忆渲染成档案列表（带来源回链与过期标注）
          setProfileItems(items);
          setMemResults([]);
          if (memFlash) setMemFlash(null);
        },
        onMemorySaved: (content) => {
          // /记得 已存，替换助理气泡为确认文案
          setMsgs((m) => {
            if (aiIndex >= m.length) return m;
            const next = [...m];
            next[aiIndex] = { ...next[aiIndex], text: `✅ 已记住：${content.slice(0, 40)}` };
            return next;
          });
          setMemFlash(null);
        },
        onTaskCreated: (taskId, sid) => {
          if (sid) setSessionId(sid);
          setTask((t) => ({ ...t, taskId }));
          subOff = subscribeTask(taskId, (ev) => {
            if (ev.type === "plan" && Array.isArray(ev.data)) {
              const steps = (ev.data as { title: string; status: string }[]).map((s) => ({ title: s.title, status: s.status ?? "pending" }));
              setTask((t) => ({ ...t, steps }));
            } else if (ev.type === "deliver") {
              const d = ev.data as { name: string };
              setTask((t) => ({ ...t, status: "done", deliverable: d.name }));
            } else if (ev.type === "done") {
              setTask((t) => ({ ...t, status: "done" }));
              if (subOff) { subOff(); subOff = null; }
            } else if (ev.type === "error") {
              setTask((t) => ({ ...t, status: "failed" }));
              if (subOff) { subOff(); subOff = null; }
            }
          });
        },
      },
    );
  };

  return (
    <div className="page chat-page">
      {/* M58：离开会话前的记忆沉淀确认面板 */}
      {distill && (
        <>
          <div className="chat-overlay" onClick={distillBusy ? undefined : skipDistill} />
          <div className="chat-distill card">
            <div className="chat-distill-h">
              <b>从这段对话沉淀记忆？</b>
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                {distill.viaLLM ? "由模型提炼" : "启发式提炼"}{distill.error ? " · 已降级" : ""}
              </span>
              <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={skipDistill} title="关闭"><IconX size={14} /></button>
            </div>
            <p className="chat-distill-tip">要离开当前会话了。下面是从对话里提炼出的、可能值得长期记住的信息，勾选需要记住的，或直接跳过。</p>
            <div className="chat-distill-list">
              {distill.candidates.map((c, i) => (
                <div key={i} className="chat-distill-item" onClick={() => !distillBusy && toggleDistill(i)}>
                  <span className={`chk${distillChecked.has(i) ? " on" : ""}`}>{distillChecked.has(i) && <IconCheck size={11} />}</span>
                  <span className={`pill ${c.kind}`}>{c.kind === "fact" ? "事实" : c.kind === "preference" ? "偏好" : "笔记"}</span>
                  <span className="chat-distill-content">{c.content}</span>
                </div>
              ))}
            </div>
            <div className="chat-distill-h">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>已选 {distillChecked.size} 条</span>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
                <button className="btn soft sm" onClick={skipDistill} disabled={distillBusy}>跳过</button>
                <button className="btn primary sm" onClick={confirmDistill} disabled={distillBusy}>
                  {distillBusy ? "保存中…" : `记住所选 ${distillChecked.size ? `(${distillChecked.size})` : ""}`}
                </button>
              </span>
            </div>
          </div>
        </>
      )}
      <div className="chat-wrap">
        {/* 会话列表（M19 持久化） */}
        <div className="chat-sess">
          <div className="chat-sess-head">
            <b>对话</b>
            <button className="btn ghost sm" onClick={newChat} title="新对话"><IconNote size={13} /> 新对话</button>
          </div>
          <div className="chat-sess-list">
            {sessions.length === 0 && <div className="empty" style={{ height: 60, justifyContent: "center" }}>暂无历史对话</div>}
            {sessions.map((s) => (
              <div key={s.id} className={`chat-sess-item${s.id === sessionId ? " on" : ""}`}
                onClick={() => openSession(s.id)}>
                <span className="cst-title">{s.title}</span>
                <span className="cst-time">{s.updated}</span>
                <button className="cst-del" title="删除"
                  onClick={(e) => { e.stopPropagation(); delSession(s.id); }}>
                  <IconTrash size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 对话主体 */}
        <div className="chat-main">
          <div className="chat-list" style={{ maxWidth: 760, margin: "0 auto" }}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="msg-bub">
                  {m.text}
                  {busy && i === msgs.length - 1 && m.role === "ai" && <span className="caret" />}
                  {m.task && (
                    <div className="chat-task">
                      <div className="chat-task-h">
                        <b>任务 {m.task.taskId}</b>
                        <span className={`pill task-st ${m.task.status}`}>{taskStatusLabel(m.task.status)}</span>
                      </div>
                      {(m.task.steps ?? []).map((s, si) => (
                        <div key={si} className={`task-step ${s.status}`}>
                          <span className="ts-dot" />{s.title}
                        </div>
                      ))}
                      {m.task.deliverable && (
                        <a className="btn primary sm chat-dl"
                          href={workspaceUrl(m.task.deliverable)}
                          target="_blank" rel="noreferrer">下载 {m.task.deliverable}</a>
                      )}
                      {m.task.status === "failed" && <div className="chat-task-err">任务执行失败</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {profileItems.length > 0 && (
            <div className="mem-profile" style={{ maxWidth: 760, margin: "0 auto 10px", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", background: "var(--surface)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <b style={{ fontSize: 13, color: "var(--brand)" }}>你的档案</b>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{profileItems.length} 条偏好/事实 · 点击来源可回看原对话</span>
                <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setProfileItems([])}>收起</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {profileItems.map((m) => {
                  const sid = m.source?.startsWith("chat") ? m.source.replace(/^chat-?distill:/, "").replace(/^chat:/, "") : null;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                      <span className={`pill ${m.kind}${m.expired ? " off" : ""}`} style={{ flexShrink: 0 }}>{m.kind === "preference" ? "偏好" : "事实"}{m.expired ? " · 过期" : ""}</span>
                      <span style={{ flex: 1, color: m.expired ? "var(--text-3)" : "var(--text-1)" }}>{m.content}</span>
                      {m.source === "manual" && <span style={{ fontSize: 10.5, color: "var(--text-3)", flexShrink: 0 }}>手动</span>}
                      {sid && (
                        <button className="link-btn" style={{ flexShrink: 0 }} onClick={() => nav(`/app/chat?sess=${sid}`)}>回看来源</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {memResults.length > 0 && (
            <div className="mem-results" style={{ maxWidth: 760, margin: "0 auto 10px", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--brand-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 12.5, color: "var(--brand)" }}>记忆 · {memKeyword ? `“${memKeyword}”` : "最近"}</b>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>点击芯片引用进下一条消息</span>
                <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setMemResults([])}>×</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {memResults.map((m) => (
                  <button key={m.id} className="pill mem-chip" style={{ cursor: "pointer", textAlign: "left", maxWidth: "100%" }}
                    title="点击把这条记忆引用到输入框"
                    onClick={() => {
                      setV((prev) => `${prev}\n📌 引用记忆：${m.content}`);
                      setMemResults([]);
                    }}>
                    {m.kind && m.kind !== "note" ? `[${m.kind}] ` : ""}{m.content.slice(0, 46)}{m.content.length > 46 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="inputbar" style={{ maxWidth: 760, margin: "20px auto 0" }}>
            <textarea rows={1} placeholder="输入消息…" value={v}
              onChange={(e) => setV(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <div className="row">
              <span className="pill">＋</span>
              <button className={`pill${runMode ? " blue" : ""}`} onClick={() => setRunMode((x) => !x)}
                title="执行模式：把这句话作为真实 Agent 任务执行">
                {runMode ? "执行 ON" : "执行 OFF"}
              </button>
              {memFlash && <span className="pill mem-flash">{memFlash}</span>}
              <button className="send" onClick={send} disabled={busy}><IconSend /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
