import { useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { skills, connectors } from "../data/mock";
import { IconUsers, IconSpark, IconLink } from "../components/icons";

const TABS = [
  { to: "/app/experts", label: "专家", icon: <IconUsers size={14} />, desc: "内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。" },
  { to: "/app/skills", label: "技能", icon: <IconSpark size={14} />, desc: "一套 Markdown 即技能 —— 改完下一条任务就生效。" },
  { to: "/app/connectors", label: "连接器", icon: <IconLink size={14} />, desc: "连通外部服务与通道，把成果推送到需要的地方。" },
];

export default function Skills() {
  const [selId, setSelId] = useState(skills[0].id);
  const sel = skills.find((s) => s.id === selId)!;
  const loc = useLocation();
  const active = TABS.find((t) => t.to === loc.pathname) ?? TABS[1];
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
      <div className="skills-wrap">
        <div className="skill-list-sec">
          <div className="sec-h">
            <b>技能库</b>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Markdown 即技能 · 改完即生效</span>
          </div>
          {skills.map((s) => (
            <div key={s.id}
              className={`skill-row${s.id === selId ? " sel" : ""}`}
              onClick={() => setSelId(s.id)}>
              <div>
                <div className="s-name">{s.name}</div>
                <div className="s-desc">{s.desc}</div>
              </div>
              <div className={`switch${s.enabled ? " on" : ""}`} onClick={(e) => e.stopPropagation()} />
            </div>
          ))}
        </div>

        <div>
          <div className="code-pane">
            <div className="cp-h">
              <b>{sel.name}.md</b>
              <span className="badge done">已保存 ✓</span>
            </div>
            <pre className="code-area">{sel.code}</pre>
          </div>

          <div className="card" style={{ padding: "16px 18px", marginTop: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>连接器</div>
            {connectors.map((c) => (
              <div key={c.name} className="conn-row">
                <span className="cdot" style={{ background: c.dot }} />
                <span className="cname">{c.name}</span>
                <span className="cnote">{c.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
