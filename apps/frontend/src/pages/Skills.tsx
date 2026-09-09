import { useEffect, useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { IconUsers, IconSpark, IconLink, IconPlus, IconTrash } from "../components/icons";
import { listSkills, getSkill, saveSkill, createSkill, deleteSkill, toggleSkill, type SkillDto } from "../api";

const TABS = [
  { to: "/app/experts", label: "专家", icon: <IconUsers size={14} />, desc: "内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。" },
  { to: "/app/skills", label: "技能", icon: <IconSpark size={14} />, desc: "一套 Markdown 即技能 —— 改完下一条任务就生效。" },
  { to: "/app/connectors", label: "连接器", icon: <IconLink size={14} />, desc: "连通外部服务与通道，把成果推送到需要的地方。" },
];

export default function Skills() {
  const loc = useLocation();
  const active = TABS.find((t) => t.to === loc.pathname) ?? TABS[1];

  const [list, setList] = useState<SkillDto[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [sel, setSel] = useState<SkillDto | null>(null); // 编辑中的技能（含 code）
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    listSkills()
      .then((ls) => {
        setList(ls);
        setSelId(ls[0]?.id ?? null);
      })
      .catch(() => setErr(true));
  }, []);

  useEffect(() => {
    if (!selId) return;
    getSkill(selId).then((s) => { setSel(s); setDirty(false); }).catch(() => setErr(true));
  }, [selId]);

  const select = (id: string) => {
    if (dirty && !window.confirm("当前编辑未保存，切换将丢弃更改？")) return;
    setSelId(id);
  };

  const onEdit = (code: string) => { setSel((s) => (s ? { ...s, code } : s)); setDirty(true); };

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const updated = await saveSkill(sel.id, { name: sel.name, desc: sel.desc, enabled: sel.enabled, code: sel.code });
      setSel(updated);
      setDirty(false);
      setList((ls) => ls.map((x) => (x.id === updated.id ? updated : x)));
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const flip = async (s: SkillDto) => {
    const updated = await toggleSkill(s.id, !s.enabled);
    setList((ls) => ls.map((x) => (x.id === updated.id ? updated : x)));
    if (sel?.id === updated.id) setSel(updated);
  };

  const doCreate = async () => {
    const id = newId.trim();
    if (!id) return;
    try {
      const created = await createSkill(id, { name: newName.trim() || id, desc: "", enabled: true, code: "# 技能：" + (newName.trim() || id) + "\n" });
      setNewOpen(false); setNewId(""); setNewName("");
      setList((ls) => [...ls, created]);
      setSelId(id);
    } catch { /* 忽略创建失败 */ }
  };

  const doDelete = async (s: SkillDto) => {
    if (!window.confirm(`删除技能「${s.name}」？改完的 .md 文件将一并删除。`)) return;
    try {
      await deleteSkill(s.id);
      const next = list.filter((x) => x.id !== s.id);
      setList(next);
      if (sel?.id === s.id) setSelId(next[0]?.id ?? null);
    } catch { /* 忽略删除失败 */ }
  };

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
            <button className="btn soft sm" style={{ marginLeft: "auto" }} onClick={() => setNewOpen((v) => !v)}>
              <IconPlus size={13} /> 新建
            </button>
          </div>
          {newOpen && (
            <div className="skill-new">
              <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="技能 id（小写英文，如 resume）" />
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="技能名（如：简历制作）" />
              <button className="btn primary sm" onClick={doCreate}>创建</button>
            </div>
          )}
          {err && <div style={{ fontSize: 12, color: "var(--warn)", padding: 8 }}>后端未启动，技能读不到</div>}
          {list.map((s) => (
            <div key={s.id}
              className={`skill-row${s.id === selId ? " sel" : ""}`}
              onClick={() => select(s.id)}>
              <div>
                <div className="s-name">{s.name}</div>
                <div className="s-desc">{s.desc}</div>
              </div>
              <div className={`switch${s.enabled ? " on" : ""}`}
                onClick={(e) => { e.stopPropagation(); flip(s); }} />
            </div>
          ))}
        </div>

        <div>
          <div className="code-pane">
            <div className="cp-h">
              <b>{sel?.name ?? ""}.md</b>
              {dirty ? <span className="badge run">未保存</span> : <span className="badge done">已保存 ✓</span>}
              {sel && (
                <button className="btn soft sm danger" style={{ marginLeft: "auto", marginRight: 8 }}
                  onClick={() => doDelete(sel)} disabled={saving}>
                  <IconTrash size={13} />
                </button>
              )}
              <button className="btn primary sm" onClick={save} disabled={saving || !dirty || !sel}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
            {sel && (
              <textarea
                className="code-area code-edit"
                spellCheck={false}
                value={sel.code}
                onChange={(e) => onEdit(e.target.value)}
              />
            )}
          </div>

          <div className="card" style={{ padding: "16px 18px", marginTop: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>连接器</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>连接器状态见「连接器」页（模型渠道/搜索/浏览器/IM 桥）。</div>
          </div>
        </div>
      </div>
    </div>
  );
}
