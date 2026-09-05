import { useState } from "react";
import { sampleTask } from "../data/mock";
import { IconCheck } from "../components/icons";
import { ftColor, ftLabel, type Task } from "../data/mock";

export default function TaskPage() {
  const [task, setTask] = useState<Task>(sampleTask);
  const [running, setRunning] = useState(false);

  const start = () => {
    if (running) return;
    setRunning(true);
    const tick = () => {
      setTask((t) => {
        const idx = t.steps.findIndex((s) => s.status === "run");
        if (idx < 0) { setRunning(false); return t; }
        const steps = t.steps.map((s, i) =>
          i === idx ? { ...s, status: "done" as const }
          : i === idx + 1 ? { ...s, status: "run" as const } : s);
        const done = idx + 1 >= t.steps.length;
        return {
          ...t,
          steps,
          status: done ? "done" : "run",
          checks: t.checks.map((c, i) => (i === 2 ? { ...c, ok: done } : c)),
        };
      });
    };
    tick();
    const int = setInterval(() => {
      setTask((t) => {
        const stillRun = t.steps.some((s) => s.status === "run");
        if (!stillRun) { clearInterval(int); setRunning(false); return t; }
        return t;
      });
      setTimeout(tick, 0);
    }, 800);
  };

  const badge = task.status === "done" ? <span className="badge done">已完成</span>
    : task.status === "run" ? <span className="badge run">执行中</span>
    : <span className="badge queue">排队中</span>;

  return (
    <div className="page">
      <div className="taskwrap">
        <div className="task-col">
          <div className="tcard">
            <div className="t-h"><b>{task.title}</b>{badge}</div>
            <div className="prompt-bar"><span>{task.prompt}</span></div>
            <ul className="steps">
              {task.steps.map((s, i) => {
                const cls = s.status;
                const dot = cls === "done" ? "✓" : cls === "run" ? "" : String(i + 1);
                return (
                  <li key={i} className={`step ${cls === "run" ? "cur" : ""}`}>
                    <span className={`dot ${cls}`}>{dot}</span>
                    <span className="txt">{s.title}</span>
                    <span className="sub">{cls === "done" ? "已完成" : cls === "run" ? "执行中" : "待执行"}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {task.artifacts.length > 0 && (
            <div className="tcard">
              <div className="t-h"><b>中间产物</b></div>
              {task.artifacts.map((a, i) => (
                <div className="file" key={i}>
                  <div className="ftext" style={{ background: ftColor[a.kind] }}>{ftLabel(a.kind)}</div>
                  <div><div className="fn">{a.name}</div><div className="fm">{a.note}</div></div>
                  <button className="btn ghost sm">打开</button>
                </div>
              ))}
            </div>
          )}

          <div className="tcard">
            <div className="t-h"><b>交付成果</b></div>
            {task.deliverable && (
              <div className="file deliver">
                <div className="ftext" style={{ background: ftColor[task.deliverable.kind] }}>{ftLabel(task.deliverable.kind)}</div>
                <div><div className="fn">{task.deliverable.name}</div><div className="fm">{task.deliverable.note}</div></div>
                <button className="btn primary sm" onClick={start} disabled={running}>
                  {running ? "执行中…" : "下载"}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rail">
          <div className="rbox">
            <h3>目标验收清单</h3><div className="rsub">每轮执行后自动核对</div>
            {task.checks.map((c, i) => (
              <div key={i} className={`ck${c.ok ? " on" : ""}`}>
                <span className="bx">{c.ok && <IconCheck size={11} />}</span>{c.label}
              </div>
            ))}
          </div>
          <div className="rbox">
            <h3>本次执行配置</h3><div className="rsub">仅对本次任务生效</div>
            <div className="cfg">模型 <span>{task.model}</span></div>
            <div className="cfg">专家 <span>{task.expert}</span></div>
            <div className="cfg">技能 <span>{task.skills.join("、")}</span></div>
            <div className="cfg">工作空间 <span>{task.workspace}</span></div>
          </div>
          <div className="rbox">
            <h3>执行时间线</h3>
            <ul className="tl">
              {task.timeline.map((t, i) => (
                <li key={i}><span className="tdot"></span><span className="tm">{t.time}</span>{t.label}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
