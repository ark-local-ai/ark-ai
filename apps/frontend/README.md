# Ark · 方舟 （前端）

本地优先的 AI Agent 生产力工作台 —— 前端工程（React + TypeScript + Vite）。

> 品牌名：**Ark · 方舟** —— "方舟承载你的工作与数据，安全独立、自主可控、成果归你。"

## 技术栈
- React 19 + TypeScript + Vite
- React Router（路由）
- 纯手写 CSS 设计令牌（暖灰 + 靛蓝，无 UI 框架依赖）

## 快速开始
```bash
cd ark-app
npm install
npm run dev        # 开发，http://localhost:5173
npm run build      # 生产构建 dist/
npm run preview    # 预览构建产物
```

## 页面与路由
| 路由 | 页面 |
|---|---|
| `/` | **官网落地页**（逃销：Hero / 技能 / 移动端远程 / 本地操作 / 持续交付 / 专家 / CTA）|
| `/app` | 新会话首页（场景卡 + 输入 -> 提交跳任务页）|
| `/app/task` | 任务执行页（步骤推进 / 产物 / 交付 / 验收清单）|
| `/app/chat` | 助理对话 |
| `/app/experts` | 专家广场 |
| `/app/skills` | 技能与连接器 |
| `/app/prompts` | 提示词库 |
| `/app/automation` | 自动化（定时任务）|
| `/app/settings` | 设置（模型渠道）|
| `/app/workspace` | 工作空间与成果 |

## 目录结构
```
src/
  data/mock.ts       # 静态类型 + 示例数据（专家/技能/渠道/任务/文件…）
  components/icons.tsx # SVG 图标集
  layout/            # 应用壳：Sidebar + Layout + shell.css
  pages/             # 页面组件 + pages.css（含 Site.tsx 官网落地页 + site.css）
  index.css          # 设计令牌（CSS 变量）
  App.tsx            # 路由表（/ 官网；/app/* 客户端工作台）
```

## 设计系统
单一品牌色靛蓝 `#4F46E5` + 暖灰中性色。令牌定义见 `src/index.css`。
配套规格文档见 `../docs/`：设计令牌、功能模块规格书、模块坑位清单、建造计划。

## 现状 & 下一步
- 前端 8 个页面全部实现、路由对接、任务执行闭环（mock 数据）已实测通过
- 下一步：接真实后端 / LLM（见 `docs/模块坑位清单_ROADMAP.md` 的"坑位 A 任务闭环"）
- 最终打包为桌面应用（Tauri 2，见 `docs/建造计划_PLAN.md`）
