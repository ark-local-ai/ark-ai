import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { IconSend, IconTrash, IconNote } from "../components/icons";
import {
  sendChat, listChatSessions, getChatMessages, deleteChatSession, subscribeTask, workspaceUrl,
  type ChatMsg, type ChatSessionDto,
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

  const newChat = () => {
    historyRef.current = [];
    setMsgs(WELCOME);
    setSessionId(null);
    setV("");
    nav("/app/chat");
  };

  const openSession = async (id: string) => {
    nav(`/app/chat?sess=${id}`);
  };

  const delSession = async (id: string) => {
    await deleteChatSession(id).catch(() => {});
    if (id === sessionId) newChat();
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
