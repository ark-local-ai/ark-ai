import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArkLogo, IconArrowUp, IconChart, IconDoc, IconFolder, IconSearch,
  IconShield, IconSlides, IconSpark, IconPlus,
} from "../components/icons";

const SCENES = [
  { icon: <IconChart size={13} />, title: "数据分析", prompt: "帮我分析这份数据，做可视化图表并说明结论" },
  { icon: <IconDoc size={13} />, title: "文档写作", prompt: "写一份本周工作周报，重点突出进展和风险" },
  { icon: <IconSlides size={13} />, title: "演示文稿", prompt: "做一份产品介绍 PPT，含市场分析和数据图表" },
  { icon: <IconSearch size={13} />, title: "深度调研", prompt: "调研一下主要竞品的最新动态，输出对比报告" },
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
        {/* ARK 线条水印（替代原 A 图标） */}
        <div className="home-mark"><ArkLogo h={86} thin /></div>
        <h2>今天帮你做些什么？</h2>
        <p className="sub">说出需求，专家团队自主规划，在本地工作空间交付可验收的成果</p>

        {/* 场景胶囊行 */}
        <div className="chips">
          {SCENES.map((s) => (
            <button key={s.title} className="chip" onClick={() => setV(s.prompt)}>
              {s.icon}{s.title}
            </button>
          ))}
        </div>

        {/* 输入卡 */}
        <div className="inputbar">
          <textarea rows={2} placeholder="今天帮你做些什么？ @ 引用工作区文件，/ 调用技能与指令"
            value={v} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="row">
            <button className="ic-btn" aria-label="添加附件"><IconPlus size={15} /></button>
            <button className="send" onClick={submit} aria-label="发送"><IconArrowUp size={14} /></button>
          </div>
          <div className="foot">
            <button className="foot-chip"><IconFolder size={13} />选择工作空间 ▾</button>
            <button className="foot-chip"><IconShield size={13} />默认权限 ▾</button>
            <span className="pill ghost auto-pill"><IconSpark size={12} />Auto ▾</span>
          </div>
        </div>
      </div>
    </div>
  );
}
