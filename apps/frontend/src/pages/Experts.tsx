import { experts } from "../data/mock";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import { IconUsers, IconSpark, IconLink } from "../components/icons";

const TABS = [
  { to: "/app/experts", label: "专家", icon: <IconUsers size={14} />, desc: "内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。" },
  { to: "/app/skills", label: "技能", icon: <IconSpark size={14} />, desc: "一套 Markdown 即技能 —— 改完下一条任务就生效。" },
  { to: "/app/connectors", label: "连接器", icon: <IconLink size={14} />, desc: "连通外部服务与通道，把成果推送到需要的地方。" },
];

export default function Experts() {
  const nav = useNavigate();
  const loc = useLocation();
  const active = TABS.find((t) => t.to === loc.pathname) ?? TABS[0];
  return (
    <div className="page">
      <header className="pn-hd">
        <nav className="pn-tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) => `pn-tab${isActive ? " on" : ""}`}>
              {t.icon}{t.label}
            </NavLink>
          ))}
        </nav>
        <p className="pn-desc">{active.desc}</p>
      </header>
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
