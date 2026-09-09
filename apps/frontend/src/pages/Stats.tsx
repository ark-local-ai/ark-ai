import { useEffect, useState } from "react";
import { getStats, getQueue, type StatsDto, type QueueDto } from "../api";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  done: { label: "已完成", cls: "done" },
  running: { label: "执行中", cls: "run" },
  queue: { label: "排队中", cls: "queue" },
  failed: { label: "失败", cls: "warn" },
};

export default function Stats() {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [queue, setQueue] = useState<QueueDto | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
    // 队列在执行过程中是动态的，定时刷新反映 active/queued 变化
    const loadQueue = () => getQueue().then(setQueue).catch(() => setQueue(null));
    loadQueue();
    const id = setInterval(loadQueue, 2000);
    return () => clearInterval(id);
  }, []);

  if (!stats) {
    return (
      <div className="page">
        <div className="empty" style={{ height: 240 }}>暂无统计数据（后端未启动或无数据）</div>
      </div>
    );
  }

  const { tasks, channels } = stats;
  const statusKeys = ["done", "running", "queue", "failed"] as const;
  const maxTask = Math.max(1, ...statusKeys.map((k) => tasks.byStatus[k] ?? 0));

  return (
    <div className="page">
      <div className="stats-grid">
        {/* 任务吞吐 */}
        <div className="tcard stat-card">
          <div className="t-h"><b>任务吞吐</b><span className="pill ghost">总计 {tasks.total}</span></div>
          <div className="stats-rows">
            {statusKeys.map((k) => {
              const { label, cls } = STATUS_LABEL[k];
              const val = tasks.byStatus[k] ?? 0;
              const pct = Math.round((val / maxTask) * 100);
              return (
                <div className="cfg" key={k}>
                  <span><i className={`st-dot ${cls}`} />{label}</span>
                  <span className="st-val">
                    <b>{val}</b>
                    <span className={`st-bar`}><span className={`st-fill ${cls}`} style={{ width: `${pct}%` }} /></span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 渠道健康 */}
        <div className="tcard stat-card">
          <div className="t-h"><b>渠道健康</b><span className="pill ghost">{channels.total} 个渠道</span></div>
          <div className="stats-rows">
            <div className="cfg"><span>平均成功率</span><span className="st-num">{channels.avgRate}%</span></div>
            <div className="cfg"><span>平均延迟</span><span className="st-num">{channels.avgLatency != null ? `${channels.avgLatency}ms` : "—"}</span></div>
            <div className="cfg"><span>平均综合评分</span><span className="st-num">{channels.avgScore}</span></div>
            <div className="cfg">
              <span>最优渠道</span>
              <span className="st-num">{channels.best ? `${channels.best.name}（${channels.best.score}）` : "—"}</span>
            </div>
          </div>
        </div>

        {/* 任务队列（M30） */}
        <div className="tcard stat-card">
          <div className="t-h"><b>任务队列</b><span className="pill ghost">并发上限 {queue?.concurrency ?? "—"}</span></div>
          <div className="stats-rows">
            <div className="cfg"><span>正在执行</span><span className="st-num"><b>{queue?.active ?? "—"}</b> / {queue?.concurrency ?? "—"}</span></div>
            <div className="cfg"><span>排队等待</span><span className="st-num">{queue?.queued ?? "—"}</span></div>
            <div className="cfg"><span>说明</span><span className="st-num" style={{ fontSize: 12, color: "var(--ink3)" }}>超出并发上限的任务排队依次执行</span></div>
          </div>
        </div>
      </div>

      {/* 最近任务动态 */}
      <div className="tcard stat-recent">
        <div className="t-h"><b>最近任务</b></div>
        {tasks.recent.length === 0 ? (
          <div className="empty" style={{ height: 80, justifyContent: "center" }}>暂无任务</div>
        ) : (
          <ul className="stat-tl">
            {tasks.recent.map((t) => {
              const { label, cls } = STATUS_LABEL[t.status] ?? STATUS_LABEL.queue;
              return (
                <li key={t.id}>
                  <span className={`st-dot ${cls}`} />
                  <span className="stt-title">{t.title}</span>
                  <span className="stt-time">{t.created}</span>
                  <span className={`badge ${cls}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
