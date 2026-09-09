import { useEffect, useState } from "react";
import { getImSettings, updateImSettings, type ImSettingsDto } from "../api";

export default function ImBridge() {
  const [cfg, setCfg] = useState<ImSettingsDto | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => {
    getImSettings().then((c) => { setCfg(c); setName(c.name); }).catch(() => setErr(true));
  };
  useEffect(load, []);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      const c = await updateImSettings({ enabled });
      setCfg(c);
      if (enabled && name !== c.name) { const c2 = await updateImSettings({ name }); setCfg(c2); }
    } catch { setErr(true); }
    setSaving(false);
  };

  const saveName = async () => {
    if (!cfg || name.trim() === cfg.name) return;
    setSaving(true);
    try { setCfg(await updateImSettings({ name })); } catch { setErr(true); }
    setSaving(false);
  };

  const rotate = async () => {
    if (!cfg) return;
    setSaving(true);
    try { setCfg(await updateImSettings({ rotateSecret: true })); setCopied(false); } catch { setErr(true); }
    setSaving(false);
  };

  const copy = async () => {
    if (!cfg) return;
    try { await navigator.clipboard.writeText(cfg.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const endpoint = cfg ? `${window.location.origin}${cfg.endpoint}` : "";

  return (
    <div className="page">
      <div className="page-h1">IM 消息桥</div>
      {err && <div className="empty">配置读取失败</div>}
      {!cfg && !err && <div className="empty">加载中…</div>}
      {cfg && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <button
              className={`pill${cfg.enabled ? " im-on" : ""}`}
              onClick={() => toggle(!cfg.enabled)}
              disabled={saving}
              title={cfg.enabled ? "当前开启，点击关闭" : "当前关闭，点击开启"}
            >
              {cfg.enabled ? "已开启" : "未开启（默认关闭）"}
            </button>
            <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              数据不出机器：消息只在本地处理
            </span>
          </div>

          <div className="im-field">
            <label>Webhook 地址</label>
            <code>{endpoint}</code>
            <p className="im-hint">把此地址填到你外部 IM/自建机器人的回调里，对本机 POST 消息即可。</p>
          </div>

          <div className="im-field">
            <label>接入方名称</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 企业微信 / 钉钉" style={{ flex: 1 }} />
              <button className="btn ghost sm" onClick={saveName} disabled={saving}>保存名称</button>
            </div>
          </div>

          <div className="im-field">
            <label>鉴权 Secret（POST 消息时携带，防外部乱入）</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code className="im-secret">{cfg.secret}</code>
              <button className="btn ghost sm" onClick={copy}>{copied ? "已复制" : "复制"}</button>
              <button className="btn ghost sm" onClick={rotate} disabled={saving}>重新生成</button>
            </div>
          </div>

          <p className="im-hint" style={{ marginTop: 14 }}>
            开启后，外部消息 POST 到 <code>{endpoint}</code>（JSON <code>{"{ message, secret }"}</code>）。
            消息命中工作意图（做/生成…PPT/报告等）会自动入队成真实 Agent 任务。
          </p>
        </div>
      )}
    </div>
  );
}
