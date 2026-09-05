import { useState } from "react";
import { jobs, jobLogs } from "../data/mock";

export default function Automation() {
  const [list, setList] = useState(jobs);
  const toggle = (id: string) => setList((ls) => ls.map((j) => j.id === id ? { ...j, enabled: !j.enabled } : j));
  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <button className="btn primary" style={{ marginLeft: "auto" }}>＋ 新建定时任务</button>
      </div>
      <table className="job-table">
        <thead>
          <tr>
            <th>任务</th><th>触发</th><th>执行动作</th><th>推送到</th><th>状态</th><th>下次执行</th>
          </tr>
        </thead>
        <tbody>
          {list.map((j) => (
            <tr key={j.id}>
              <td className="job-name">{j.name}</td>
              <td>{j.trigger}</td>
              <td className="job-act">{j.action}</td>
              <td>{j.push}</td>
              <td><div className={`switch${j.enabled ? " on" : ""}`} onClick={() => toggle(j.id)} /></td>
              <td>{j.next}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tcard" style={{ marginTop: 20 }}>
        <div className="t-h"><b>最近执行</b></div>
        {jobLogs.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
            <span className="cdot" style={{ width: 8, height: 8, borderRadius: "50%", background: l.ok ? "var(--ok)" : "var(--warn)", flex: "none" }} />
            <span style={{ fontSize: 13.5, color: "var(--text-2)" }}>{l.time} · {l.name} · {l.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
