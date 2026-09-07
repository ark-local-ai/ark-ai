import { useEffect, useMemo, useState } from "react";
import { spaces, ftColor, ftLabel } from "../data/mock";
import { listWorkspace, workspaceUrl, type WorkspaceFileDto } from "../api";

export default function Workspace() {
  const [sp, setSp] = useState(0);
  const [files, setFiles] = useState<WorkspaceFileDto[] | null>(null);
  const [err, setErr] = useState(false);

  const load = () => {
    setErr(false);
    listWorkspace().then(setFiles).catch(() => { setFiles([]); setErr(true); });
  };
  useEffect(load, []);

  // 文件树：真实交付文件按「任务_日期_标题」归档（这里用父目录名近似；当前平铺展示）
  const tree = useMemo(() => files ?? [], [files]);
  // 成果网格：官方交付文件（Office/pdf/md/html）按类型分组
  const grid = useMemo(() => (files ?? []).filter((f) => f.kind !== "other"), [files]);

  return (
    <div className="page">
      <div className="workspace-wrap">
        <div className="space-list">
          <b style={{ fontSize: 13.5 }}>工作空间</b>
          <div style={{ marginTop: 12 }}>
            {spaces.map((s, i) => (
              <div key={i} className={`space-item${i === sp ? " on" : ""}`} onClick={() => setSp(i)}>
                <span>▸ {s.name}</span>
                <span className="cnt">{i === 0 ? files?.length ?? 0 : s.count}</span>
              </div>
            ))}
            <div className="space-item" style={{ color: "var(--brand)" }}>＋ 新建工作空间</div>
          </div>
          <div className="tree" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 6 }}>文件树 · 按「任务_月日_标题」归档</div>
            {err && <div style={{ fontSize: 12, color: "var(--warn)" }}>后端未启动，无法扫描</div>}
            {!err && tree.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>暂无交付文件</div>
            )}
            {tree.map((f, i) => (
              <div key={i} className={`tree-row${f.kind === "other" ? "" : " dir"}`}>
                <span style={{ paddingLeft: 0 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <b style={{ fontSize: 15 }}>成果文件</b>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>真实落盘 · 可直接在 Office 打开继续编辑</span>
            <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={load}>刷新</button>
          </div>
          {err ? (
            <div className="empty" style={{ color: "var(--warn)" }}>
              无法连接后端（127.0.0.1:4000），请先启动 apps/backend
            </div>
          ) : grid.length === 0 ? (
            <div className="empty">还没有成果文件，去首页提一个任务吧</div>
          ) : (
            <div className="files-grid">
              {grid.map((f, i) => (
                <div key={i} className="file-card card">
                  <div className="ftext" style={{ background: ftColor[f.kind] }}>{ftLabel(f.kind)}</div>
                  <div className="fname" title={f.name}>{f.name}</div>
                  <div className="fmeta">{f.sizeText} · {f.time}</div>
                  <div className="fops">
                    <a className="btn soft sm" href={workspaceUrl(f.name)} download>下载</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
