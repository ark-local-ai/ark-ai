import { Link } from "react-router-dom";
import "./site.css";
import {
  IconSpark, IconClock, IconFolder, IconDoc, IconSearch, IconCheck, IconLink,
} from "../components/icons";

export default function Site() {
  return (
    <div className="site">
      {/* 顶部导航（官网共用） */}
      <nav className="site-nav">
        <div className="left">
          <div className="site-logo">
            <div className="mark">A</div>
            <div style={{ display: "flex", alignItems: "baseline" }}><b>Ark</b><span>方舟</span></div>
          </div>
          <div className="site-menu">
            <a href="#skills">技能</a>
            <a href="#mobile">移动端</a>
            <a href="#local">本地操作</a>
            <a href="#deliver">持续交付</a>
            <a href="#expert">专家</a>
          </div>
        </div>
        <div className="site-cta">
          <Link className="btn ghost" to="/app">打开应用</Link>
          <Link className="btn primary" to="/app">下载客户端</Link>
        </div>
      </nav>

      {/* Hero（对应整体定位） */}
      <header className="site-hero">
        <h1>工作新习惯，<em>先让 Ark 干</em></h1>
        <p className="sub">
          从汇报 PPT、数据表格，到深度调研、定时任务，统统交给 Ark。它把任务拆成步骤、
          调用技能和工具一步步完成，最后交付能直接打开验收的文件。
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link className="btn primary" to="/app" style={{ padding: "12px 24px", fontSize: 15 }}>免费下载</Link>
          <Link className="btn ghost" to="/app" style={{ padding: "12px 24px", fontSize: 15 }}>打开演示</Link>
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-3)" }}>数据不出本机 · 支持 macOS / Windows · 免费开源</p>
      </header>

      {/* 图3 · 技能 */}
      <section id="skills" className="site-section">
        <h2 className="sec-title">丰富的技能，覆盖多种工作场景</h2>
        <p className="sec-sub">从深度调研、竞品分析，到公众号推文、小红书卡片、数据可视化。一个 Markdown 文件就是一个技能，改完下一条任务就生效。</p>
        <div className="site-grid cols-2">
          {[
            { k: "PPT 设计", d: "这份大纲做成 15 页项目路演 PPT，数据用表格。" },
            { k: "Excel 报表", d: "汇总各门店销售数据，出一份带透视表的月度报表。" },
            { k: "数据可视化", d: "读取这个 Excel，画出上线三个月以来的转化漏斗。" },
            { k: "公众号推文", d: "把这篇周报改写成公众号推文，配好标题和排版。" },
          ].map((s) => (
            <div className="site-card" key={s.k}>
              <div className="k"><span className="kic"><IconSpark /></span>{s.k}</div>
              <p>{s.d}</p>
              <span className="site-tag">复制提示词</span>
            </div>
          ))}
        </div>
      </section>

      {/* 图4 · 移动端远程指挥 */}
      <section id="mobile" className="site-section site-white">
        <div className="site-grid cols-2" style={{ alignItems: "center" }}>
          <div>
            <h2 className="sec-title">不在电脑旁，也能远程派活</h2>
            <p className="sec-sub">接入微信、飞书、QQ 或企业微信，外出时发一条消息就能指挥这台电脑，干完把文件推回聊天里。</p>
            <div style={{ marginBottom: 20 }}>
              {["微信 · 扫码即连 · 无需公网", "飞书 · 应用凭证 · 长连接", "QQ · 填入凭证即用", "企业微信 · 回调接入"].map((t) => (
                <span className="site-tag" key={t}>{t}</span>
              ))}
            </div>
          </div>
          <div className="site-phone">
            <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-3)" }}>Ark 在线 · 本机执行中</div>
            <div className="site-mentions">
              <div className="site-msg u">把刚才那份周报的数据更新下，再发我一份</div>
              <div className="site-msg a">已读取工作空间的周报文件，更新 3 处数据并重新生成图表。
                <div className="att">📄 项目周报-更新版.docx</div>
              </div>
              <div className="site-msg a">另外按昨天的约定，9 点的晨报已经发到群里了。</div>
              <div className="site-msg u">收到，晚上记得把官网落地页也改一版</div>
              <div className="site-msg a">好的，任务已加入队列，完成后会推给你。</div>
            </div>
          </div>
        </div>
      </section>

      {/* 图5 · 操作电脑（本地文件 + 内置浏览器） */}
      <section id="local" className="site-section">
        <h2 className="sec-title">操作电脑，完成复杂任务</h2>
        <p className="sec-sub">Ark 可以读取、创建和修改电脑里的本地文件，自动打开网页、填写信息、完成跨页面操作。你的数据始终留在本机。</p>
        <div className="site-grid cols-2">
          <div className="site-card">
            <div className="k"><span className="kic"><IconFolder /></span>工作空间 · 本机文件夹</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>数据分析及可视化.xlsx · 已落盘</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>项目周报.docx · 任务_月日_标题 归档</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>架构图.png · 本机离线渲染</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>落地页.html · 本机起服务，手机扫码可看</div>
            <p style={{ marginTop: 14 }}><b>数据不出本机</b> · 默认只监听 127.0.0.1，不主动外发。</p>
          </div>
          <div className="site-card">
            <div className="k"><span className="kic"><IconLink /></span>内置浏览器 · 真渲染再读取</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>登录页自动填写表单</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>跨页面操作，动态页真渲染读取</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>能爬取登录后的数据</div>
            <p style={{ marginTop: 14 }}>配合技能脚本，把复杂的网页操作固化、复用。</p>
          </div>
        </div>
      </section>

      {/* 图6 · 持续交付（Office + 调研 + 定时） */}
      <section id="deliver" className="site-section site-white">
        <h2 className="sec-title">从复杂任务，到持续交付</h2>
        <p className="sec-sub">深入研究、生成专业工作成果，并让重复工作自动完成。</p>
        <div className="site-grid cols-2">
          <div className="site-card">
            <div className="k"><span className="kic"><IconDoc /></span>Office 成果 · 交付即打开可编辑</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>PPT · 12 页 · 图表 6 处 · 已排版</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>Excel · 6 个 Sheet · 公式原生可编辑</div>
            <div className="site-check"><span className="ch"><IconCheck size={15} /></span>Word · 图文混排 · 目录可更新</div>
            <p style={{ marginTop: 14 }}>全部真实写入磁盘，可直接在 Word / Excel / PPT 中继续编辑。</p>
          </div>
          <div className="site-card">
            <div className="k"><span className="kic"><IconSearch /></span>深入调研 · 带引用</div>
            <p>检索多方信息来源，产出带引用的研究报告。</p>
            <div className="k" style={{ marginTop: 18 }}><span className="kic"><IconClock /></span>定时任务 · 自动执行</div>
            <p>按预设时间自动执行，把日报晨报推到 IM。</p>
          </div>
        </div>
      </section>

      {/* 图7 · 专家系统 */}
      <section id="expert" className="site-section">
        <h2 className="sec-title">专业技能，让复杂工作更简单</h2>
        <p className="sec-sub">内置 12 位专家与技能库 —— 按专业流程拆解任务、逐项执行，交付的是能直接打开验收的成果，而不是聊天记录。</p>
        <div className="site-grid cols-2">
          <div className="site-card">
            <div className="k">选一个专家，把任务交给它</div>
            {["调研专家", "数据分析师", "写作专家", "设计专家"].map((e) => (
              <div className="site-check" key={e}><span className="ch"><IconCheck size={15} /></span>{e}</div>
            ))}
            <p style={{ marginTop: 12 }}>＋ 创建专属专家（流程 + 验收清单 + 绑定技能）</p>
          </div>
          <div className="site-card">
            <div className="k">调研专家 · 正在执行</div>
            <div className="site-steps">
              {["问题拆解", "多源检索", "原文精读", "引用标注", "报告排版"].map((s, i) => (
                <div className="site-step" key={s}>
                  <span className="n">{i + 1}</span>{s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 结尾 CTA（图9） */}
      <section className="site-cta-end">
        <h2>把 Ark 引入你的日常办公</h2>
        <p>本地运行、多模型自由切换，让每一项工作都更轻松。</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link className="btn primary" to="/app" style={{ padding: "12px 24px", fontSize: 15 }}>立即下载</Link>
          <Link className="btn ghost" to="/app" style={{ padding: "12px 24px", fontSize: 15 }}>打开应用</Link>
        </div>
      </section>

      <footer className="site-foot">
        <span>Ark · 方舟 — 免费开源 · 数据不出本机</span>
        <span>支持 macOS（Apple Silicon / Intel）· Windows</span>
      </footer>
    </div>
  );
}
