import { useEffect, useState } from "react";
import { IconSearch, IconPlus, IconTrash, IconNote } from "../components/icons";
import {
  listMemories, searchMemories, createMemory, updateMemory, deleteMemory,
  type MemoryDto,
} from "../api";

const KINDS = ["note", "fact", "preference"] as const;
const KIND_LABEL: Record<string, string> = { note: "笔记", fact: "事实", preference: "偏好" };
const KIND_COMMON: Record<string, boolean> = { note: true, fact: true, preference: true };

interface Editor { id?: string; kind: string; content: string; tags: string }

export default function Memories() {
  const [list, setList] = useState<MemoryDto[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

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
      load();
    } catch { /* 忽略 */ } finally { setSaving(false); }
  };

  const remove = async (m: MemoryDto) => {
    if (!window.confirm("删除这条记忆？")) return;
    try { await deleteMemory(m.id); load(); } catch { /* 忽略 */ }
  };

  const showAll = q.trim() !== "";

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
        <button className="btn primary sm" style={{ marginLeft: "auto" }} onClick={openNew}>
          <IconPlus size={13} /> 记一条
        </button>
      </div>

      {err && <div style={{ fontSize: 12, color: "var(--warn)", padding: 8 }}>后端未启动，记忆读不到</div>}

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

      <div className="mem-grid">
        {list.length === 0 && !err && (
          <div className="empty" style={{ height: 120, justifyContent: "center" }}>还没有记忆。点击「记一条」让方舟记住偏好或事实。</div>
        )}
        {list.map((m) => (
          <div key={m.id} className="mem-card card">
            <div className="mem-card-h">
              <span className={`pill${KIND_COMMON[m.kind] ? ` ${m.kind}` : ""}`}>
                <IconNote size={11} /> {KIND_LABEL[m.kind] ?? m.kind}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{m.created}</span>
              <button className="icon-btn" title="删除" onClick={() => remove(m)}><IconTrash size={13} /></button>
            </div>
            <div className="mem-content">{m.content}</div>
            {m.tags && <div className="mem-tags">{m.tags.split(",").map((t, i) => <span key={i} className="pill ghost">#{t}</span>)}</div>}
            <button className="btn soft sm" style={{ marginTop: 10 }} onClick={() => openEdit(m)}>编辑</button>
          </div>
        ))}
      </div>
    </div>
  );
}
