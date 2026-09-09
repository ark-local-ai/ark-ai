import { useEffect, useState } from "react";
import { useLocation, NavLink } from "react-router-dom";
import { IconUsers, IconSpark, IconLink } from "../components/icons";
import {
  listExperts, createExpert, updateExpert, deleteExpert,
  type ExpertDto,
} from "../api";

const TABS = [
  { to: "/app/experts", label: "专家", icon: <IconUsers size={14} />, desc: "内置专家与技能库 —— 按专业流程拆解任务、逐项执行。交付可验收的成果，而不是聊天记录。" },
  { to: "/app/skills", label: "技能", icon: <IconSpark size={14} />, desc: "一套 Markdown 即技能 —— 改完下一条任务就生效。" },
  { to: "/app/connectors", label: "连接器", icon: <IconLink size={14} />, desc: "连通外部服务与通道，把成果推送到需要的地方。" },
];

interface Editor {
  mode: "create" | "edit";
  id?: string;
  name: string;
  icon: string;
  color: string;
  desc: string;
  skills: string;
  connectors: string;
}

const EMPTY: Editor = { mode: "create", name: "", icon: "专", color: "#8B5E34", desc: "", skills: "0", connectors: "0" };

export default function Experts() {
  const loc = useLocation();
  const active = TABS.find((t) => t.to === loc.pathname) ?? TABS[0];
  const [experts, setExperts] = useState<ExpertDto[]>([]);
  const [err, setErr] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => listExperts().then(setExperts).catch(() => setErr(true));
  useEffect(() => { load(); }, []);

  const openCreate = () => setEditor({ ...EMPTY });
  const openEdit = (e: ExpertDto) => {
    if (e.builtin) return; // 内置只读
    setEditor({ mode: "edit", id: e.id, name: e.name, icon: e.icon, color: e.color, desc: e.desc, skills: e.skills, connectors: e.connectors });
  };

  const save = async () => {
    if (!editor || !editor.name.trim()) return;
    setSaving(true);
    try {
      const input = {
        name: editor.name.trim(),
        icon: editor.icon || "专",
        color: editor.color || "#8B5E34",
        desc: editor.desc,
        skills: editor.skills,
        connectors: editor.connectors,
      };
      if (editor.mode === "create") {
        await createExpert(input);
      } else if (editor.id) {
        await updateExpert(editor.id, input);
      }
      setEditor(null);
      await load();
    } catch { /* 忽略保存失败 */ } finally { setSaving(false); }
  };

  const remove = async (e: ExpertDto) => {
    if (e.builtin || !window.confirm(`删除专家「${e.name}」？`)) return;
    try { await deleteExpert(e.id); await load(); } catch { /* 忽略 */ }
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
      {err && <div style={{ fontSize: 12, color: "var(--warn)", padding: 12 }}>后端未启动，专家列表读不到</div>}

      {editor && (
        <div className="ex-editor">
          <div className="exe-h">
            <b>{editor.mode === "create" ? "创建专属专家" : "编辑专家"}</b>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>名称+简介必填，其余可缺省</span>
            <button className="btn soft sm" style={{ marginLeft: "auto" }} onClick={() => setEditor(null)}>取消</button>
          </div>
          <div className="exe-grid">
            <label>名称 *<input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="如：行业投研专家" /></label>
            <label>图标字<input value={editor.icon} maxLength={2} onChange={(e) => setEditor({ ...editor, icon: e.target.value })} /></label>
            <label>主题色<input value={editor.color} onChange={(e) => setEditor({ ...editor, color: e.target.value })} /></label>
            <label className="exe-wide">简介<textarea rows={2} value={editor.desc} onChange={(e) => setEditor({ ...editor, desc: e.target.value })} placeholder="这个专家擅长什么、产出什么"></textarea></label>
            <label>技能数<input value={editor.skills} onChange={(e) => setEditor({ ...editor, skills: e.target.value })} /></label>
            <label>连接器数<input value={editor.connectors} onChange={(e) => setEditor({ ...editor, connectors: e.target.value })} /></label>
          </div>
          <div className="exe-ft">
            <button className="btn primary sm" onClick={save} disabled={saving || !editor.name.trim()}>
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      <div className="ex-grid">
        {experts.map((e) => (
          <div key={e.id} className="ex-card card" onClick={() => openEdit(e)}>
            <div className="e-top">
              <div className="ex-ava" style={{ background: e.color }}>{e.icon}</div>
              <div>
                <div className="e-name">{e.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{e.builtin ? "内置" : "自定义"}</div>
              </div>
              {!e.builtin && (
                <button className="btn soft sm danger" style={{ marginLeft: "auto" }}
                  onClick={(ev) => { ev.stopPropagation(); remove(e); }}>删除</button>
              )}
            </div>
            <div className="e-desc">{e.desc}</div>
            <div className="ex-meta">
              <span className="pill">技能 {e.skills}</span>
              <span className="pill">连接器 {e.connectors}</span>
            </div>
          </div>
        ))}
        <div className="ex-create" onClick={openCreate}>
          <div style={{ fontSize: 28 }}>＋</div>
          <div style={{ fontWeight: 600 }}>创建专属专家</div>
          <div style={{ fontSize: 12 }}>自定义流程 + 验收清单 + 绑定技能</div>
        </div>
      </div>
    </div>
  );
}
