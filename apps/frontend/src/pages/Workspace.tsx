import { useState } from "react";
import { spaces, spaceFiles, appFiles, ftColor, ftLabel } from "../data/mock";

export default function Workspace() {
  const [sp, setSp] = useState(0);
  return (
    <div className="page">
      <div className="workspace-wrap">
        <div className="space-list">
          <b style={{ fontSize: 13.5 }}>工作空间</b>
          <div style={{ marginTop: 12 }}>
            {spaces.map((s, i) => (
              <div key={i} className={`space-item${i === sp ? " on" : ""}`} onClick={() => setSp(i)}>
                <span>▸ {s.name}</span>
                <span className="cnt">{s.count}</span>
              </div>
            ))}
            <div className="space-item" style={{ color: "var(--brand)" }}>＋ 新建工作空间</div>
          </div>
          <div className="tree" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 6 }}>文件树 · 按「任务_月日_标题」归档</div>
            {spaceFiles.map((f, i) => (
              <div key={i} className={`tree-row${f.dir ? " dir" : ""}`}>
                {f.dir && <span className="tdot" />}
                <span style={{ paddingLeft: f.dir ? 0 : 18 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <b style={{ fontSize: 15 }}>成果文件</b>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>按任务归档 · 可直接在 Office 打开继续编辑</span>
          </div>
          <div className="files-grid">
            {appFiles.map((f, i) => (
              <div key={i} className="file-card card">
                <div className="ftext" style={{ background: ftColor[f.kind] }}>{ftLabel(f.kind)}</div>
                <div className="fname">{f.name}</div>
                <div className="fmeta">{f.size} · {f.time}</div>
                <div className="fops">
                  <button className="btn ghost sm">打开</button>
                  <button className="btn soft sm">下载</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
