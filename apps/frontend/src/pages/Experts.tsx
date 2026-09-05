import { experts } from "../data/mock";
import { useNavigate } from "react-router-dom";

export default function Experts() {
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <p style={{ color: "var(--text-2)", fontSize: 13.5 }}>内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。</p>
        <button className="btn primary" style={{ marginLeft: "auto" }}>创建专属专家</button>
      </div>
      <div className="ex-grid">
        {experts.map((e) => (
          <div key={e.id} className="ex-card card" onClick={() => nav("/")}>
            <div className="e-top">
              <div className="ex-ava" style={{ background: e.color }}>{e.icon}</div>
              <div>
                <div className="e-name">{e.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{e.builtin ? "内置" : "自定义"}</div>
              </div>
            </div>
            <div className="e-desc">{e.desc}</div>
            <div className="ex-meta">
              <span className="pill">技能 {e.skills}</span>
              <span className="pill">连接器 {e.connectors}</span>
              <button className="btn soft sm" style={{ marginLeft: "auto" }}>使用</button>
            </div>
          </div>
        ))}
        <div className="ex-create" onClick={() => nav("/settings")}>
          <div style={{ fontSize: 28 }}>＋</div>
          <div style={{ fontWeight: 600 }}>创建专属专家</div>
          <div style={{ fontSize: 12 }}>自定义流程 + 验收清单 + 绑定技能</div>
        </div>
      </div>
    </div>
  );
}
