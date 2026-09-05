import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowUp } from "../components/icons";

const SCENES = [
  { icon: "◍", title: "数据分析", prompt: "帮我分析这份数据，做可视化图表并说明结论" },
  { icon: "📄", title: "文档写作", prompt: "写一份本周工作周报，重点突出进展和风险" },
  { icon: "▣", title: "演示文稿", prompt: "做一份产品介绍 PPT，含市场分析和数据图表" },
  { icon: "◎", title: "深度调研", prompt: "调研一下主要竞品的最新动态，输出对比报告" },
];

export default function Home() {
  const nav = useNavigate();
  const [v, setV] = useState("");
  const submit = () => {
    if (!v.trim()) return;
    nav("/app/task"); // mock：跳转任务页（后续接入真实创建）
  };
  return (
    <div className="page">
      <div className="home">
        <div className="mark-lg">A</div>
        <h2>今天帮你做些什么？</h2>
        <p className="sub">说出需求，专家团队自主规划，在本地工作空间交付可验收的成果</p>
        <div className="cards">
          {SCENES.map((s) => (
            <button key={s.title} className="card" onClick={() => setV(s.prompt)}>
              <div className="c-top">
                <span className="c-ic" style={{ fontSize: 15, color: "var(--brand)" }}>{s.icon}</span>
                <b>{s.title}</b>
              </div>
              <p>{s.prompt}</p>
            </button>
          ))}
        </div>
        <div className="inputbar">
          <textarea rows={1} placeholder="今天帮你做些什么？  @引用文件  ·  /调用技能"
            value={v} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="row">
            <span className="pill">＋</span>
            <span className="pill blue">DeepSeek ▾</span>
            <span className="pill">连接器 ▾</span>
            <span className="pill">专家 ▾</span>
            <span className="pill">技能 ▾</span>
            <button className="send" onClick={submit}><IconArrowUp /></button>
          </div>
        </div>
        <p className="hint">@ 引用工作区文件 · / 调用技能 · 微信扫码即可远程指挥</p>
      </div>
    </div>
  );
}
