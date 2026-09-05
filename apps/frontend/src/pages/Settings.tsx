import { useState } from "react";
import { channels } from "../data/mock";

const GROUPS: { label?: string; items: string[] }[] = [
  { items: ["应用", "通用", "外观", "通知"] },
  { label: "能力", items: ["模型", "联网搜索", "技能", "连接器", "专家", "Agent"] },
  { label: "智能", items: ["长期记忆", "自进化", "回归评测"] },
  { label: "系统", items: ["工作目录", "快捷键", "备份", "安全"] },
];

export default function Settings() {
  const [sec, setSec] = useState("模型");
  return (
    <div className="page">
      <div className="settings-wrap">
        <nav className="settings-nav">
          {GROUPS.map((g, gi) => (
            <div key={gi}>
              {g.label && <div style={{ fontSize: 11, color: "var(--text-3)", padding: "8px 10px 4px", fontWeight: 600 }}>{g.label}</div>}
              {g.items.map((it) => (
                <div key={it} className={`s-nav-item${it === sec ? " on" : ""}`} onClick={() => setSec(it)}>{it}</div>
              ))}
            </div>
          ))}
        </nav>

        <div>
          {sec === "模型" ? (
            <>
              <h2 style={{ fontSize: 20, marginBottom: 6 }}>模型</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>本地模型渠道：增删改、验活、高级参数</p>
              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>填一个服务商的 Key 就能开工。不登录也照样能配、能用。</p>
              <button className="btn primary" style={{ marginBottom: 16 }}>＋ 新增渠道</button>
              {channels.map((c) => (
                <div key={c.id} className="channel">
                  <div>
                    <div className="c-name">{c.name}</div>
                    <div className="c-url">{c.model} · {c.url}</div>
                  </div>
                  <span className={`pill`} style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>{c.proto}</span>
                  {c.defaultOf && <span className="c-def">✓ 当前默认</span>}
                  <div className="c-ops">
                    <button className="btn ghost sm">编辑</button>
                    <button className="btn ghost sm">删除</button>
                    {!c.defaultOf && <button className="btn soft sm">设为默认</button>}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="hint-wrap">
              <span style={{ fontSize: 13.5 }}>「{sec}」设置将在后续接入 —— 这里先占好坑位。</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
