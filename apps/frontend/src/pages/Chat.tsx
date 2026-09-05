import { useState } from "react";
import { IconSend } from "../components/icons";

interface Msg { role: "user" | "ai"; text: string }

const INITIAL: Msg[] = [
  { role: "ai", text: "你好，我是方舟助理。我可以帮你做调研、写文档、做 PPT、分析数据等。告诉我你想做什么？" },
];

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL);
  const [v, setV] = useState("");
  const send = () => {
    if (!v.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: v }]);
    setV("");
    setTimeout(() => {
      setMsgs((m) => [...m, { role: "ai", text: "收到，我会把这一步交给专家团队处理。你也可以到任务页查看执行进度。" }]);
    }, 500);
  };
  return (
    <div className="page chat-page">
      <div className="chat-list" style={{ maxWidth: 760, margin: "0 auto" }}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="msg-bub">{m.text}</div>
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
          <button className="send" onClick={send}><IconSend /></button>
        </div>
      </div>
    </div>
  );
}
