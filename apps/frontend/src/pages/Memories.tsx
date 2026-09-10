import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconSearch, IconPlus, IconTrash, IconNote, IconCheck, IconX, IconBubble, IconLink } from "../components/icons";
import {
  listMemories, searchMemories, createMemory, updateMemory, deleteMemory,
  batchDeleteMemories, findDuplicateMemories, mergeMemories,
  type MemoryDto, type DuplicateGroupDto,
} from "../api";

const KINDS = ["note", "fact", "preference"] as const;
const KIND_LABEL: Record<string, string> = { note: "笔记", fact: "事实", preference: "偏好" };

interface Editor { id?: string; kind: string; content: string; tags: string }
interface Sel { [id: string]: boolean }

export default function Memories() {
  const nav = useNavigate();
  const [list, setList] = useState<MemoryDto[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  // M57：批量整理
  const [sel, setSel] = useState<Sel>({});
  const [dupInv, setDupInv] = useState(false); // 查重面板是否展开
  const [dups, setDups] = useState<DuplicateGroupDto[]>([]);
  const [dupLoading, setDupLoading] = useState(false);

  const load = () => {
    listMemories(kind ?? undefined).then(setList).catch(() => setErr(true));
  };
  useEffect(load, [kind]);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      searchMemories(q).then(setList).catch(() => setErr(true));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const selectedIds = useMemo(
    () => list.map((m) => m.id).filter((id) => sel[id]),
    [list, sel],
  );

  const toggle = (id: string) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const clearSel = () => setSel({});
  const selAll = () => {
    setSel(Object.fromEntries(list.map((m) => [m.id, true])));
  };

  const removeOne = async (m: MemoryDto) => {
    if (!window.confirm("删除这条记忆？")) return;
    try { await deleteMemory(m.id); load(); } catch { /* 忽略 */ }
  };

  const delSelected = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`删除选中的 ${selectedIds.length} 条记忆？此操作不可撤销。`)) return;
    try { await batchDeleteMemories(selectedIds); clearSel(); load(); } catch { /* 忽略 */ }
  };

  const openNew = () => setEditing({ kind: "note", content: "", tags: "" });
  const openEdit = (m: MemoryDto) => setEditing({ kind: m.kind, content: m.content, tags: m.tags ?? "" });

  const save = async () => {
    if (!editing || !editing.content.trim()) return;
    setSaving(true);
    try {
      const body = { kind: editing.kind, content: editing.content.trim(), tags: editing.tags.trim() || undefined };
      if (editing.id) await updateMemory(editing.id, body);
      else await createMemory(body);
      setEditing(null);
      setQ("");
      setKind(null);
      load();
    } catch { /* 忽略 */ } finally { setSaving(false); }
  };

  // M57 查重：归一化后相同内容归组，duplicates 一键全选
  const loadDups = () => {
    setDupLoading(true);
    findDuplicateMemories(kind ?? undefined)
      .then((g) => { setDups(g); setDupInv(true); })
      .catch(() => { setDups([]); setDupInv(true); })
      .finally(() => setDupLoading(false));
  };
  const selectAllDups = (onlyOwn = true) => {
    const picks: Sel = {};
    for (const g of dups) {
      const targets = onlyOwn ? g.duplicates : [g.canonical, ...g.duplicates];
      for (const m of targets) picks[m.id] = true;
    }
    setSel((s) => ({ ...s, ...picks }));
  };
  const dupTotalDuplicate = dups.reduce((n, g) => n + g.duplicates.length, 0);

  // M59：一键合并重复记忆——把一组重复的并入 canonical（tags 合并后删掉其余），或一键合并全部组
  const [merging, setMerging] = useState<Record<string, boolean>>({});
  const doMerge = async (keepId: string, removeIds: string[]) => {
    setMerging((m) => ({ ...m, [keepId]: true }));
    try {
      await mergeMemories(keepId, removeIds);
      // 合并后重查，去重复查面板
      const g = await findDuplicateMemories(kind ?? undefined);
      setDups(g);
      clearSel();
      load();
    } catch { /* 忽略 */ } finally {
      setMerging((m) => ({ ...m, [keepId]: false }));
    }
  };
  const mergeGroup = (g: DuplicateGroupDto) => doMerge(g.canonical.id, g.duplicates.map((d) => d.id));
  const mergeAllDups = () => {
    for (const g of dups) void doMerge(g.canonical.id, g.duplicates.map((d) => d.id));
  };

  const showAll = q.trim() !== "";

  // M60：解析记忆来源，渲染「查看来源会话」回链（点开该会话）
  const renderSource = (m: MemoryDto) => {
    if (!m.source) return null;
    if (m.source.startsWith("chat-distill:")) {
      const sid = m.source.slice("chat-distill:".length);
      return (
        <button className="link-btn" onClick={() => nav(`/app/chat?sess=${sid}`)} title="打开来源会话">
          <IconLink size={11} /> 来自对话提炼
        </button>
      );
    }
    if (m.source.startsWith("chat:")) {
      const sid = m.source.slice("chat:".length);
      return (
        <button className="link-btn" onClick={() => nav(`/app/chat?sess=${sid}`)} title="打开来源会话">
          <IconLink size={11} /> 来自对话
        </button>
      );
    }
    if (m.source === "manual") {
      return <span className="source-tag" title="手动添加">手动</span>;
    }
    return <span className="source-tag">{m.source}</span>;
  };

  return (
    <div className="page">
      <div className="page-h1">记忆</div>
      <div className="mem-toolbar">
        <div className="mem-search">
          <IconSearch size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索记忆（全文）…" />
          {q && <button className="mem-clear" onClick={() => setQ("")}>✕</button>}
        </div>
        <div className="mem-kinds">
          <button className={`pill${!kind ? " blue" : ""}`} onClick={() => setKind(null)}>全部</button>
          {KINDS.map((k) => (
            <button key={k} className={`pill${kind === k ? " blue" : ""}`} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <button className="btn soft sm" onClick={loadDups} disabled={dupLoading} title="找出内容重复的记忆">
          <IconBubble size={13} /> 查重{dupInv && dupTotalDuplicate ? ` (${dupTotalDuplicate})` : ""}
        </button>
        <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={openNew}>
          <IconPlus size={13} /> 记一条
        </button>
      </div>

      {err && <div style={{ fontSize: 12, color: "var(--warn)", padding: 8 }}>后端未启动，记忆读不到</div>}

      {dupInv && (
        <div className="mem-dup card">
          <div className="mem-dup-h">
            <b>重复记忆</b>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {dups.length ? `${dups.length} 组 · 可合并 ${dupTotalDuplicate} 条重复` : "没有发现重复记忆"}
            </span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
              {dups.length > 0 && (
                <>
                  <button className="btn soft sm" onClick={() => selectAllDups(true)}>全选重复</button>
                  <button className="btn soft sm" onClick={() => selectAllDups(false)}>全选整组</button>
                  <button className="btn primary sm" onClick={mergeAllDups} disabled={Object.values(merging).some(Boolean)}>
                    {Object.values(merging).some(Boolean) ? "合并中…" : "合并全部"}
                  </button>
                </>
              )}
              <button className="icon-btn" title="关闭" onClick={() => setDupInv(false)}><IconX size={14} /></button>
            </span>
          </div>
          {dups.map((g) => (
            <div key={g.canonical.id} className="mem-dup-group">
              <div className="mem-dup-main">
                <span className="pill note"><IconCheck size={11} /> 保留</span>
                <span className="mem-dup-content">{g.canonical.content}</span>
                <button className="btn primary sm" onClick={() => mergeGroup(g)} disabled={merging[g.canonical.id]}
                  title="把重复的并进这一条（合并标签后删除其余）">
                  {merging[g.canonical.id] ? "合并中…" : "合并此组"}
                </button>
                <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{g.canonical.created}</span>
              </div>
              {g.duplicates.map((d) => (
                <div key={d.id} className="mem-dup-sub" onClick={() => toggle(d.id)}>
                  <span className={`chk${sel[d.id] ? " on" : ""}`}>
                    {sel[d.id] && <IconCheck size={11} />}
                  </span>
                  <span className="mem-dup-content">{d.content}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>{d.created}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="mem-editor card">
          <div className="mem-editor-h">
            <b>{editing.id ? "编辑记忆" : "记一条记忆"}</b>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>事实/偏好会被对话与任务引用（M42）</span>
            <button className="btn soft sm" style={{ marginLeft: "auto" }} onClick={() => setEditing(null)}>取消</button>
          </div>
          <div className="mem-editor-body">
            <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
              placeholder="标签，逗号分隔（可选）" />
            <textarea rows={3} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              placeholder="记点什么… 例如：用户偏好用简洁的深色 PPT 风格" />
            <button className="btn primary sm" onClick={save} disabled={saving || !editing.content.trim()}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      {showAll && <div className="mem-note">搜索结果：{list.length} 条</div>}

      {selectedIds.length > 0 && (
        <div className="mem-batch">
          <span className="chk on" style={{ border: "none" }}><IconCheck size={11} /></span>
          <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>已选 {selectedIds.length} 条</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
            <button className="btn soft sm" onClick={selAll}>全选当前</button>
            <button className="btn soft sm" onClick={clearSel}>取消</button>
            <button className="btn danger sm" onClick={delSelected}><IconTrash size={12} /> 批量删除</button>
          </span>
        </div>
      )}

      <div className="mem-grid">
        {list.length === 0 && !err && (
          <div className="empty" style={{ height: 120, justifyContent: "center" }}>还没有记忆。点击「记一条」让方舟记住偏好或事实。</div>
        )}
        {list.map((m) => (
          <div key={m.id} className={`mem-card card${sel[m.id] ? " picking" : ""}`}>
            <div className="mem-card-h">
              <button className="chk" onClick={() => toggle(m.id)}>
                {sel[m.id] && <IconCheck size={11} />}
              </button>
              <span className={`pill ${m.kind}`}><IconNote size={11} /> {KIND_LABEL[m.kind] ?? m.kind}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{m.created}</span>
              <button className="icon-btn" title="删除" onClick={() => removeOne(m)}><IconTrash size={13} /></button>
            </div>
            <div className="mem-content">{m.content}</div>
            {m.tags && <div className="mem-tags">{m.tags.split(",").map((t, i) => <span key={i} className="pill ghost">#{t.trim()}</span>)}</div>}
            <div className="mem-src">{renderSource(m)}</div>
            <button className="btn soft sm" style={{ marginTop: 10, alignSelf: "flex-start" }} onClick={() => openEdit(m)}>编辑</button>
          </div>
        ))}
      </div>
    </div>
  );
}
