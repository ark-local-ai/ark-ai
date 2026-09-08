import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconSearch } from "../components/icons";
import { scenarios as mockScenarios } from "../data/mock";
import { listScenarios, type ScenarioDto } from "../api";

export default function Prompts() {
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ScenarioDto | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDto[]>(mockScenarios);
  useEffect(() => { listScenarios().then(setScenarios).catch(() => {}); }, []);

  const kw = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!kw) return scenarios;
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        s.desc.toLowerCase().includes(kw) ||
        s.prompts.some((p) => p.text.toLowerCase().includes(kw)),
    );
  }, [kw]);

  // 「使用」：带上场景名与提示词，回填到首页输入台（生成场景标签 + 正文）
  const usePrompt = (sc: ScenarioDto, prompt: string) => {
    nav("/app", { state: { scene: sc.name, prompt } });
  };

  /* ---------- 场景详情视图 ---------- */
  if (open) {
    return (
      <div className="page">
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="scene-detail-head">
            <button className="btn ghost sm" onClick={() => setOpen(null)}>
              ‹ 全部场景
            </button>
            <div className="scene-detail-title">
              <span className="scene-ava" style={{ background: open.color }}>{open.icon}</span>
              <div>
                <b>{open.name}</b>
                <span className="scene-detail-desc">{open.desc}</span>
              </div>
            </div>
          </div>

          <div className="scene-prompt-list">
            {open.prompts.map((p, i) => (
              <div key={i} className="card scene-prompt">
                <div className="sp-text">{p.text}</div>
                <div className="sp-foot">
                  <span className="pill ghost">{p.note}</span>
                  <button className="btn primary sm" onClick={() => usePrompt(open, p.text)}>
                    使用
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------- 场景列表视图 ---------- */
  return (
    <div className="page">
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div className="sb-search" style={{ flex: 1, maxWidth: 340, margin: 0 }}>
            <IconSearch />
            <input placeholder="搜索场景或提示词…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => nav("/app")}>
            ＋ 新建任务
          </button>
        </div>

        <div className="scene-grid">
          {shown.map((s) => (
            <button key={s.id} className="card scene-card" onClick={() => setOpen(s)}>
              <div className="sc-top">
                <span className="scene-ava" style={{ background: s.color }}>{s.icon}</span>
                <span className="sc-count">{s.prompts.length} 条提示词</span>
              </div>
              <div className="sc-name">{s.name}</div>
              <div className="sc-desc">{s.desc}</div>
            </button>
          ))}
        </div>
        {shown.length === 0 && <div className="empty" style={{ height: 160 }}>没有找到相关场景</div>}
      </div>
    </div>
  );
}
