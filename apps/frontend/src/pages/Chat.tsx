import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { IconSend, IconTrash, IconNote } from "../components/icons";
import {
  sendChat, listChatSessions, getChatMessages, deleteChatSession,
  type ChatMsg, type ChatSessionDto,
} from "../api";

interface Msg { role: "user" | "ai"; text: string }

const WELCOME: Msg[] = [
  { role: "ai", text: "你好，我是方舟助理。我可以帮你做调研、写文档、做 PPT、分析数据等。告诉我你想做什么？" },
];

export default function Chat() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessParam = params.get("sess");

  const [msgs, setMsgs] = useState<Msg[]>(WELCOME);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionDto[]>([]);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
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

    sendChat(
      text,
      historyRef.current,
      (t) => {
        acc += t;
        setMsgs((m) => {
          const next = [...m];
          next[aiIndex] = { role: "ai", text: next[aiIndex].text + t };
          return next;
        });
      },
      ({ text, sessionId: sid }) => {
        historyRef.current.push({ role: "assistant", content: text || acc });
        if (sid) setSessionId(sid);      // 新会话后端创建，记住 id
        setBusy(false);
        loadSessions();
      },
      () => setBusy(false),
      sessionId ?? undefined,
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
              <span className="pill blue">DeepSeek ▾</span>
              <button className="send" onClick={send} disabled={busy}><IconSend /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
