import { connectors } from "../data/mock";
import { useLocation, NavLink } from "react-router-dom";
import { IconUsers, IconSpark, IconLink } from "../components/icons";

const TABS = [
  { to: "/app/experts", label: "专家", icon: <IconUsers size={14} />, desc: "内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。" },
  { to: "/app/skills", label: "技能", icon: <IconSpark size={14} />, desc: "一套 Markdown 即技能 —— 改完下一条任务就生效。" },
  { to: "/app/connectors", label: "连接器", icon: <IconLink size={14} />, desc: "连通外部服务与通道，把成果推送到需要的地方。" },
];

export default function Connectors() {
  const loc = useLocation();
  const active = TABS.find((t) => t.to === loc.pathname) ?? TABS[2];
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

      <div className="conn-grid">
        {connectors.map((c) => (
          <div className="conn-card card" key={c.name}>
            <div className="conn-top">
              <span className="conn-dot" style={{ background: c.dot }} />
              <b>{c.name}</b>
              <span className={`badge${c.online ? " done" : " queue"}`}>{c.online ? "已连接" : "未启用"}</span>
            </div>
            <p className="conn-note">{c.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
