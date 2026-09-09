import { useEffect, useMemo, useState } from "react";
import { ftColor, ftLabel } from "../data/mock";
import {
  listSpaces, listSpaceFiles, createSpace, setActiveSpace, deleteSpace,
  workspaceUrl, searchWorkspace, listFileVersions, rollbackFileVersion,
  webSearch, webRead, webRender, saveToWorkspace, getSearchSource, setSearchSourceEnabled,
  type WebSearchHit,
  type SpaceDto, type WorkspaceFileDto, type WorkspaceSearchResult, type FileVersionDto,
} from "../api";

export default function Workspace() {
  const [spaces, setSpaces] = useState<SpaceDto[]>([]);
  const [activeId, setActiveId] = useState<string>("default");
  const [files, setFiles] = useState<WorkspaceFileDto[] | null>(null);
  const [err, setErr] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // C5 版本历史面板
  const [verName, setVerName] = useState<string | null>(null);
  const [vers, setVers] = useState<FileVersionDto[]>([]);
  const openVersions = async (name: string) => {
    setVerName(name);
    try { setVers(await listFileVersions(name)); } catch { setVers([]); }
  };
  const doRollback = async (seq: number) => {
    if (!verName) return;
    try {
      await rollbackFileVersion(verName, seq);
      setVers(await listFileVersions(verName));
      loadFiles(activeId);
      alert("已回滚到该版本");
    } catch (e) { console.error(e); alert("回滚失败"); }
  };

  // 加载空间列表，默认选中活动空间
  const loadSpaces = () => {
    listSpaces()
      .then((ss) => {
        setSpaces(ss);
        const act = ss.find((s) => s.isActive) ?? ss[0];
        if (act) setActiveId(act.id);
      })
      .catch(() => setErr(true));
  };
  useEffect(loadSpaces, []);

  // 当前选中空间
  const active = useMemo(() => spaces.find((s) => s.id === activeId) ?? null, [spaces, activeId]);

  // 加载当前空间的文件
  const loadFiles = (id: string) => {
    setFiles(null);
    setErr(false);
    listSpaceFiles(id).then(setFiles).catch(() => { setFiles([]); setErr(true); });
  };
  useEffect(() => { loadFiles(activeId); }, [activeId]);

  const switchSpace = async (id: string) => {
    await setActiveSpace(id).catch(() => {});
    setActiveId(id);
    await listSpaces().then(setSpaces).catch(() => {});
  };

  const doCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const sp = await createSpace(name);
      await listSpaces().then(setSpaces).catch(() => {});
      setNewName("");
      setCreating(false);
      if (sp) await switchSpace(sp.id);
    } catch { /* 忽略 */ }
  };

  const doDelete = async () => {
    if (!active) return;
    try {
      await deleteSpace(active.id);
      await listSpaces().then((ss) => {
        setSpaces(ss);
        const def = ss.find((s) => s.id === "default") ?? ss[0];
        if (def) { setActiveId(def.id); setActiveSpace(def.id).catch(() => {}); }
      }).catch(() => {});
    } catch { /* 忽略 */ }
  };

  // 成果网格：官方交付文件（Office/pdf/md/html）按类型分组
  const grid = useMemo(() => (files ?? []).filter((f) => f.kind !== "other"), [files]);

  // M20 全文搜索：跨全部工作空间按文件名 FTS 子串匹配
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<WorkspaceSearchResult[] | null>(null);
  const doSearch = (kw: string) => {
    const v = kw.trim();
    setQ(v);
    if (!v) { setHits(null); return; }
    searchWorkspace(v).then(setHits).catch(() => setHits([]));
  };

  // M48 联网搜索：资料库内直接搜真实网络（web.search），可一键 web.read 读正文
  const [wq, setWq] = useState("");
  const [whits, setWhits] = useState<WebSearchHit[] | null>(null);
  const [wloading, setWloading] = useState(false);
  const [werr, setWerr] = useState("");
  const [wover, setWover] = useState<Record<string, string>>({}); // url -> 已展开正文
  const [wreading, setWreading] = useState("");
  const doWebSearch = async () => {
    const v = wq.trim();
    if (!v) return;
    setWloading(true); setWerr(""); setWover({});
    const r = await webSearch(v);
    setWloading(false);
    if (r.error) { setWhits(null); setWerr(r.error); return; }
    setWhits(r.hits);
  };
  // M51：读正文优先 web.read（快），拿不到（报错/为空=JS 渲染页）→ 自动用无头浏览器渲染兜底
  const [wmode, setWmode] = useState<Record<string, "read" | "render" | "err">>({});
  const readOrRender = async (url: string): Promise<{ text: string; error?: string; mode: "read" | "render" | "err" }> => {
    const r = await webRead(url);
    if (!r.error && r.text?.trim()) return { text: r.text, mode: "read" };
    const b = await webRender(url).catch(() => ({ url, title: "", text: "", length: 0, error: "浏览器不可用" as string }));
    if (b.error || !b.text?.trim()) return { text: "", error: b.error || "网页无法读取", mode: "err" };
    return { text: b.text, mode: "render" };
  };
  const doRead = async (h: WebSearchHit) => {
    if (wover[h.url]) { setWover((o) => { const n = { ...o }; delete n[h.url]; return n; }); return; }
    setWreading(h.url);
    const r = await readOrRender(h.url);
    setWreading("");
    setWmode((m) => ({ ...m, [h.url]: r.error ? "err" : r.mode }));
    setWover((o) => ({ ...o, [h.url]: r.error ? `⚠ ${r.error}` : r.text }));
  };

  // M50：把结果「存进资料库」（有正文用正文，否则先读网页）；+ 搜索源开关
  const [srcEnabled, setSrcEnabled] = useState(true);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    getSearchSource().then((s) => setSrcEnabled(s.enabled)).catch(() => {});
  }, []);
  const doToggleSearch = async () => {
    const next = !srcEnabled;
    setSrcEnabled(next);
    try {
      await setSearchSourceEnabled(next);
      setSaveMsg({ ok: true, text: next ? "已开启联网搜索" : "已关闭联网搜索（数据不再出网）" });
    } catch {
      setSrcEnabled(!next);
      setSaveMsg({ ok: false, text: "开关失败" });
    }
  };
  const doSaveHit = async (h: WebSearchHit) => {
    let text = wover[h.url];
    if (!text || text.startsWith("⚠ ")) {
      setWreading(h.url);
      const r = await readOrRender(h.url);
      setWreading("");
      if (r.error || !r.text?.trim()) { setSaveMsg({ ok: false, text: `读取失败：${r.error || "内容为空"}` }); return; }
      text = r.text;
      setWmode((m) => ({ ...m, [h.url]: r.mode }));
      setWover((o) => ({ ...o, [h.url]: r.text }));
    }
    const res = await saveToWorkspace({ title: h.title, url: h.url, text, source: "search" });
    if (res.error) setSaveMsg({ ok: false, text: res.error });
    else { setSaveMsg({ ok: true, text: `已存入资料库：${res.name}` }); loadFiles(activeId); }
  };

  return (
    <div className="page">
      <div className="workspace-wrap">
        <div className="space-list">
          <b style={{ fontSize: 13.5 }}>工作空间</b>
          <div style={{ marginTop: 12 }}>
            {spaces.map((s) => (
              <div key={s.id} className={`space-item${s.id === activeId ? " on" : ""}`}
                onClick={() => switchSpace(s.id)}>
                <span>▸ {s.name}{s.isActive ? " ·进行中" : ""}</span>
                <span className="cnt">{s.id === activeId ? files?.length ?? 0 : s.files ?? 0}</span>
              </div>
            ))}
            {creating ? (
              <div className="space-new">
                <input autoFocus value={newName}
                  placeholder="空间名称"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doCreate(); if (e.key === "Escape") setCreating(false); }} />
                <div className="space-new-ops">
                  <button className="btn soft sm" onClick={() => setCreating(false)}>取消</button>
                  <button className="btn sm" onClick={doCreate}>创建</button>
                </div>
              </div>
            ) : (
              <div className="space-item add" style={{ color: "var(--brand)" }} onClick={() => setCreating(true)}>
                ＋ 新建工作空间
              </div>
            )}
            {active && active.id !== "default" && (
              <div className="space-item" style={{ color: "var(--warn)", fontSize: 12 }} onClick={doDelete}>
                删除「{active.name}」
              </div>
            )}
          </div>
          <div className="tree" style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 6 }}>
              文件树 · «{active?.name ?? ""}» 目录
            </div>
            {err && <div style={{ fontSize: 12, color: "var(--warn)" }}>后端未启动，无法扫描</div>}
            {!err && (files ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>该空间暂无交付文件</div>
            )}
            {(files ?? []).map((f, i) => (
              <div key={i} className={`tree-row${f.kind === "other" ? "" : " dir"}`}>
                <span style={{ paddingLeft: 0 }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          {/* M48 联网搜索面板：资料库内直接搜真实网络，可一键读正文 */}
          <div className="card" style={{ marginBottom: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <b style={{ fontSize: 13.5 }}>联网搜索</b>
              <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                搜真实网络（默认免 key · DuckDuckGo），可点开读正文、存入资料库
              </span>
              {/* M50：搜索源可控/可显式关停（数据不出机器） */}
              <button className={`btn soft sm${srcEnabled ? "" : ""}`}
                onClick={doToggleSearch}
                title={srcEnabled ? "关闭后联网搜索将停用（数据不再出网）" : "重新开启联网搜索"}
                style={{ marginLeft: "auto", color: srcEnabled ? "var(--brand)" : "var(--warn)" }}>
                {srcEnabled ? "联网 · 开" : "联网 · 关"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="ws-search-input"
                style={{ flex: 1 }}
                placeholder="输入想调研/搜索的内容…"
                value={wq}
                onChange={(e) => setWq(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doWebSearch()}
              />
              <button className="btn sm" onClick={doWebSearch} disabled={wloading || !srcEnabled}>
                {!srcEnabled ? "搜索已关闭" : wloading ? "搜索中…" : "搜索"}
              </button>
            </div>
            {werr && <div style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 10 }}>{werr}</div>}
            {saveMsg && (
              <div style={{ fontSize: 12, marginTop: 8, color: saveMsg.ok ? "var(--brand)" : "var(--warn)" }}>
                {saveMsg.text}
              </div>
            )}
            {whits && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {whits.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>没有搜到结果</div>
                )}
                {whits.map((h, i) => (
                  <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <a href={h.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}>
                        {h.title}
                      </a>
                      {wmode[h.url] === "render" && (
                        <span style={{ fontSize: 10.5, color: "var(--text-3)", border: "1px solid var(--line)", borderRadius: 6, padding: "1px 5px", background: "var(--bg)" }}>
                          浏览器渲染
                        </span>
                      )}
                      <button className="btn soft sm" onClick={() => doSaveHit(h)} title="把正文保存为资料库 markdown 文件">
                        {wreading === h.url ? "读取中…" : "存资料库"}
                      </button>
                      <button className="btn ghost sm" style={{ marginLeft: "auto" }}
                        onClick={() => doRead(h)}>
                        {wreading === h.url ? "读取中…" : wover[h.url] ? "收起" : "读正文"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.url}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{h.snippet}</div>
                    {wover[h.url] && (
                      <pre style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-2)", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflow: "auto" }}>
                        {wover[h.url]}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>成果文件 · {active?.name ?? "默认工作空间"}</b>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>真实落盘 · 可直接在 Office 打开继续编辑</span>
            <div className="ws-search" style={{ marginLeft: "auto" }}>
              <input placeholder="全文搜索文件名…" value={q}
                onChange={(e) => doSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && doSearch("")} />
              {q && <button className="ws-clear" onClick={() => doSearch("")}>×</button>}
            </div>
            <button className="btn ghost sm" onClick={() => loadFiles(activeId)}>刷新</button>
          </div>
          {q.trim() ? (
            /* M20：FTS 搜索结果（跨全部空间） */
            <div className="files-grid">
              {hits && hits.length === 0 && <div className="empty">未找到匹配文件</div>}
              {hits?.map((f, i) => (
                <div key={i} className="file-card card">
                  <div className="ftext" style={{ background: ftColor[f.kind] }}>{ftLabel(f.kind)}</div>
                  <div className="fname" title={f.name}>{f.name}</div>
                  <div className="fmeta">{f.sizeText} · {f.time} · {f.spaceName}</div>
                  <div className="fops">
                    <a className="btn soft sm" href={workspaceUrl(f.name, f.spaceId ?? undefined)} download>下载</a>
                  </div>
                </div>
              ))}
            </div>
          ) : err ? (
            <div className="empty" style={{ color: "var(--warn)" }}>
              无法连接后端（127.0.0.1:4000），请先启动 apps/backend
            </div>
          ) : grid.length === 0 ? (
            <div className="empty">这个空间还没有成果文件，去首页提一个任务吧</div>
          ) : (
            <div className="files-grid">
              {grid.map((f, i) => (
                <div key={i} className="file-card card">
                  <div className="ftext" style={{ background: ftColor[f.kind] }}>{ftLabel(f.kind)}</div>
                  <div className="fname" title={f.name}>{f.name}</div>
                  <div className="fmeta">{f.sizeText} · {f.time}</div>
                  <div className="fops">
                    <a className="btn soft sm" href={workspaceUrl(f.name, activeId)} download>下载</a>
                    <button className="btn soft sm" onClick={() => openVersions(f.name)}>版本</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {verName && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.28)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setVerName(null)}>
          <div className="card" style={{ width: 380, maxWidth: "90vw", maxHeight: 420, overflow: "auto", padding: "16px 18px" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <b style={{ fontSize: 13.5 }}>{verName} · 版本历史</b>
              <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setVerName(null)}>关闭</button>
            </div>
            {vers.length === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 0" }}>该文件暂无历史版本</div>
            )}
            {vers.map((v) => (
              <div key={v.seq} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>v{v.seq} · {v.ts}</span>
                <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => doRollback(v.seq)}>回滚</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
