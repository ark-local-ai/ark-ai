import { useState } from "react";
import { IconSearch } from "../components/icons";

const GROUPS: { name: string; items: string[] }[] = [
  { name: "写作", items: ["写一份周报，突出进展、风险与下一步", "把要点改写成正式邮件", "润色这段文字，更有说服力"] },
  { name: "调研", items: ["调研竞品最新动态，输出对比报告", "整理这份资料的要点与引用", "分析某话题的趋势"] },
  { name: "数据", items: ["读 Excel 出可视化图表并说明结论", "汇总多表数据生成月度报表", "找出异常数据并解释"] },
  { name: "设计", items: ["把大纲做成 15 页路演 PPT", "生成小红书的 9 张图", "设计一份招聘海报文案"] },
];

export default function Prompts() {
  const [query, setQuery] = useState("");
  return (
    <div className="page">
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div className="sb-search" style={{ flex: 1, maxWidth: 340, margin: 0 }}>
            <IconSearch />
            <input placeholder="搜索提示词…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn primary" style={{ marginLeft: "auto" }}>＋ 新建提示词</button>
        </div>
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => i.includes(query));
          if (query && items.length === 0) return null;
          return (
            <div key={g.name} className="card" style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10, color: "var(--text-2)" }}>{g.name}</div>
              {items.map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13.5 }}>{i}</span>
                  <button className="btn soft sm" style={{ marginLeft: "auto" }}>使用</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
