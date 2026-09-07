import { useEffect, useState } from "react";
import {
  listJobs, createJob, updateJob, deleteJob, runJobNow, listJobLogs,
  type JobDto, type JobLogDto,
} from "../api";

export default function Automation() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [logs, setLogs] = useState<JobLogDto[]>([]);
  const [err, setErr] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", schedule: "09:00", action: "", push: "" });

  const load = () => {
    setErr(false);
    Promise.all([listJobs(), listJobLogs()])
      .then(([js, ls]) => { setJobs(js); setLogs(ls); })
      .catch(() => setErr(true));
  };
  useEffect(load, []);

  const toggle = async (j: JobDto) => {
    const u = await updateJob(j.id, { enabled: !j.enabled });
    setJobs((js) => js.map((x) => (x.id === u.id ? u : x)));
  };
  const run = async (j: JobDto) => {
    await runJobNow(j.id);
    setTimeout(load, 2000); // 等任务跑完再刷新日志
  };
  const remove = async (j: JobDto) => {
    if (!window.confirm(`删除定时任务「${j.name}」？`)) return;
    await deleteJob(j.id);
    load();
  };
  const submit = async () => {
    if (!form.name.trim() || !form.action.trim()) return;
    await createJob({ ...form, name: form.name.trim(), action: form.action.trim(), schedule: form.schedule.trim() || "09:00" });
    setForm({ name: "", schedule: "09:00", action: "", push: "" });
    setCreating(false);
    load();
  };

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setCreating((c) => !c)}>
          {creating ? "取消" : "＋ 新建定时任务"}
        </button>
      </div>

      {creating && (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>新建定时任务</div>
          <div style={{ display: "grid", gap: 10 }}>
            <input className="inp" placeholder="任务名称，如：每日晨报" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="inp" placeholder="触发：每天 09:00 或 every:30（每30分钟）" value={form.schedule}
              onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} />
            <input className="inp" placeholder="执行动作（一句话需求），如：汇总昨日任务生成晨报" value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} />
            <input className="inp" placeholder="推送到（可选），如：企业微信群" value={form.push}
              onChange={(e) => setForm((f) => ({ ...f, push: e.target.value }))} />
            <div>
              <button className="btn primary sm" onClick={submit} disabled={!form.name.trim() || !form.action.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: "var(--warn)", marginBottom: 10 }}>后端未启动，任务列表读不到</div>}

      <table className="job-table">
        <thead>
          <tr><th>任务</th><th>触发</th><th>执行动作</th><th>推送到</th><th>状态</th><th>下次执行</th><th></th></tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="job-name">{j.name}</td>
              <td>{j.schedule}</td>
              <td className="job-act">{j.action}</td>
              <td>{j.push || "—"}</td>
              <td><div className={`switch${j.enabled ? " on" : ""}`} onClick={() => toggle(j)} /></td>
              <td>{j.next}</td>
              <td>
                <button className="btn ghost sm" onClick={() => run(j)}>执行</button>
                <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={() => remove(j)}>删除</button>
              </td>
            </tr>
          ))}
          {jobs.length === 0 && !err && (
            <tr><td colSpan={7} style={{ color: "var(--text-3)", textAlign: "center", padding: 20 }}>还没有定时任务，点右上角新建</td></tr>
          )}
        </tbody>
      </table>

      <div className="tcard" style={{ marginTop: 20 }}>
        <div className="t-h"><b>最近执行</b></div>
        {logs.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
            <span className="cdot" style={{ width: 8, height: 8, borderRadius: "50%", background: l.ok ? "var(--ok)" : "var(--warn)", flex: "none" }} />
            <span style={{ fontSize: 13.5, color: "var(--text-2)" }}>{l.time} · {l.name} · {l.result}</span>
          </div>
        ))}
        {logs.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 0" }}>暂无执行记录</div>}
      </div>
    </div>
  );
}
