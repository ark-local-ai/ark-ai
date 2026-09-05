import { useState } from "react";
import { skills, connectors } from "../data/mock";

export default function Skills() {
  const [selId, setSelId] = useState(skills[0].id);
  const sel = skills.find((s) => s.id === selId)!;
  return (
    <div className="page">
      <div className="tabs">
        <button className="tab on">技能</button>
        <button className="tab">连接器</button>
        <button className="tab">提示词</button>
      </div>
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
