import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconFiles, IconTrash } from "../components/icons";
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, runTemplate,
  type TaskTemplateDto,
} from "../api";

const emptyForm = { name: "", desc: "", prompt: "", expert: "", skills: "", model: "" };

export default function Templates() {
  const nav = useNavigate();
  const [list, setList] = useState<TaskTemplateDto[]>([]);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<TaskTemplateDto | null>(null); // 编辑中的模板
  const [form, setForm] = useState(emptyForm);
  const [running, setRunning] = useState(false);

  const refresh = () => listTemplates().then(setList).catch(() => setErr(true));

  useEffect(() => { refresh(); }, []);

  const openEdit = (t: TaskTemplateDto) => {
    setEditing(t);
    setForm({
      name: t.name, desc: t.desc ?? "", prompt: t.prompt, expert: t.expert ?? "",
      skills: (t.skills ?? []).join("，"), model: t.model ?? "",
    });
  };

  const save = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    const input = {
      name: form.name.trim(),
      desc: form.desc.trim() || undefined,
      prompt: form.prompt.trim(),
      expert: form.expert.trim() || undefined,
      skills: form.skills.split(/[，,\s]+/).filter(Boolean),
      model: form.model.trim() || undefined,
    };
    if (editing) {
      await updateTemplate(editing.id, input);
    } else {
      await createTemplate(input);
    }
    setEditing(null); setForm(emptyForm);
    refresh();
  };

  const remove = async (t: TaskTemplateDto) => {
    if (!window.confirm(`删除模板「${t.name}」？`)) return;
    await deleteTemplate(t.id);
    if (editing?.id === t.id) { setEditing(null); setForm(emptyForm); }
    refresh();
  };

  const run = async (t: TaskTemplateDto) => {
    setRunning(true);
    try {
      const taskId = await runTemplate(t.id);
      nav(`/app/task?taskId=${taskId}`);
    } catch (e) {
      console.error(e);
      alert("应用模板失败，请确认后端已启动");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="page">
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <header className="pn-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconFiles size={16} />
            <b>任务模板</b>
          </div>
          <p className="pn-desc">把常用任务固化为模板，一键应用即开始执行 —— 省去重复输入提示词。</p>
        </header>

        {err && <div style={{ fontSize: 12, color: "var(--warn)", padding: "8px 2px" }}>后端未启动，模板读不到</div>}

        {/* 表单：新建 / 编辑 */}
        <div className="card" style={{ padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <b style={{ fontSize: 13.5 }}>{editing ? "编辑模板" : "新建模板"}</b>
            <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={save}
              disabled={!form.name.trim() || !form.prompt.trim()}>
              保存
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
            <label style={lbl}>
              名称
              <input style={inp} value={form.name} placeholder="如：周报生成"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label style={lbl}>
              模型（可选）
              <input style={inp} value={form.model} placeholder="自动 / 指定渠道·模型"
                onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </label>
            <label style={{ ...lbl, gridColumn: "1 / -1" }}>
              简短说明
              <input style={inp} value={form.desc} placeholder="这个模板做什么？"
                onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </label>
            <label style={{ ...lbl, gridColumn: "1 / -1" }}>
              提示词（必填）
              <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={form.prompt}
                placeholder="完整描述需求，如：基于本周聊天记录生成一份销售周报，含数据表格与结论"
                onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            </label>
          </div>
        </div>

        {/* 模板列表 */}
        {list.length === 0 && !err && (
          <div className="empty" style={{ height: 140 }}>
            还没有模板。点上方「保存」新建第一个，或用任务页把已完成任务固化为模板。
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {list.map((t) => (
            <div key={t.id} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <b style={{ fontSize: 13.5 }}>{t.name}</b>
                {t.model && <span className="pill ghost">{t.model}</span>}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => openEdit(t)}>编辑</button>
                  <button className="btn ghost sm" aria-label="删除" onClick={() => remove(t)}>
                    <IconTrash size={13} />
                  </button>
                </span>
              </div>
              {t.desc && <div style={{ fontSize: 12, color: "var(--text-2)" }}>{t.desc}</div>}
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {t.prompt}
              </div>
              {(t.expert || (t.skills ?? []).length > 0) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {t.expert && <span className="pill ghost">{t.expert}</span>}
                  {(t.skills ?? []).map((s, i) => <span key={i} className="pill ghost">{s}</span>)}
                </div>
              )}
              <button className="btn primary sm" style={{ marginTop: "auto" }} onClick={() => run(t)} disabled={running}>
                应用并执行
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--text-2)" };
const inp: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13, color: "var(--text)",
};
