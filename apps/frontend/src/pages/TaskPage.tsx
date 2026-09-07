import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { IconCheck } from "../components/icons";
import { ftColor, ftLabel } from "../data/mock";
import { getTask, subscribeTask, workspaceUrl, type TaskDto } from "../api";

export default function TaskPage() {
  const [params] = useSearchParams();
  const taskId = params.get("taskId");
  const [task, setTask] = useState<TaskDto | null>(null);
  const [missing, setMissing] = useState(false);
  const taskRef = useRef(task);
  taskRef.current = task;

  // 拉取任务快照
  useEffect(() => {
    if (!taskId) return;
    setMissing(false);
    getTask(taskId)
      .then(setTask)
      .catch(() => setMissing(true));
  }, [taskId]);

  // 订阅 SSE 实时进度
  useEffect(() => {
    if (!taskId) return;
    const unsub = subscribeTask(taskId, (ev) => {
      const cur = taskRef.current;
      if (!cur) return;
      const next = { ...cur, steps: [...cur.steps] };
      if (ev.type === "plan") {
        next.steps = (ev.data as TaskDto["steps"]).map((s, i) => ({
          ...(cur.steps[i] ?? { id: 0 }), ...s,
        }));
      } else if (ev.type === "step") {
        const d = ev.data as { stepId: number; status: string };
        const st = next.steps.find((s) => s.id === d.stepId)
          ?? next.steps.find((s) => s.status === "running");
        if (st) st.status = d.status as TaskDto["steps"][0]["status"];
      } else if (ev.type === "deliver") {
        next.deliverable = ev.data as TaskDto["deliverable"];
      } else if (ev.type === "check") {
        const checks = ev.data as TaskDto["checks"];
        next.checks = checks;
        if (checks.every((c) => c.ok)) next.status = "done";
      } else if (ev.type === "done") {
        next.status = "done";
      }
      setTask(next);
    });
    return unsub;
  }, [taskId]);

  if (missing) {
    return (
      <div className="page">
        <div className="empty" style={{ height: 300 }}>
          任务不存在或后端未启动
        </div>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="page">
        <div className="empty" style={{ height: 300 }}>加载中…</div>
      </div>
    );
  }

  const badge =
    task.status === "done" ? <span className="badge done">已完成</span>
    : task.status === "running" ? <span className="badge run">执行中</span>
    : task.status === "failed" ? <span className="badge warn">失败</span>
    : <span className="badge queue">排队中</span>;

  return (
    <div className="page">
      <div className="taskwrap">
        <div className="task-col">
          <div className="tcard">
            <div className="t-h"><b>{task.title}</b>{badge}</div>
            <div className="prompt-bar"><span>{task.prompt}</span></div>
            <ul className="steps">
              {task.steps.map((s) => {
                const cls = s.status;
                const dot = cls === "done" ? "✓" : cls === "running" ? "" : "";
                return (
                  <li key={s.id} className={`step ${cls === "running" ? "cur" : ""}`}>
                    <span className={`dot ${cls === "done" ? "done" : cls === "running" ? "run" : "wait"}`}>
                      {cls === "running" ? "●" : dot}
                    </span>
                    <span className="txt">{s.title}</span>
                    <span className="sub">
                      {cls === "done" ? "已完成" : cls === "running" ? "执行中" : "待执行"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {task.deliverable && (
            <div className="tcard">
              <div className="t-h"><b>交付成果</b></div>
              <div className="file deliver">
                <div className="ftext" style={{ background: ftColor[task.deliverable.kind] }}>
                  {ftLabel(task.deliverable.kind)}
                </div>
                <div>
                  <div className="fn">{task.deliverable.name}</div>
                  <div className="fm">{task.deliverable.note}</div>
                </div>
                <a className="btn primary sm" href={workspaceUrl(task.deliverable.name)} download>
                  下载
                </a>
              </div>
            </div>
          )}
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
