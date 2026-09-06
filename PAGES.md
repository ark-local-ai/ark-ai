# Ark · 方舟 — 页面清单（Pages）

> 记录前端所有已生成页面（URL + 用途）与待开发项。随开发持续维护。
> 实现状态标记：✅ 已实现（mock 数据）｜🚧 已实现但待接真实后端｜🔲 未开发（规划中）

## 一、已实现的页面

### 官网落地页

| URL | 页面 | 组件 | 用途 | 状态 |
|---|---|---|---|---|
| `/` | 官网落地页 | `Site.tsx` | 营销落地页：Hero / 技能 / 移动端远程 / 本地操作 / 持续交付 / 专家 / CTA | ✅ |

### 客户端工作台（`/app` 壳内）

| URL | 页面 | 组件 | 用途 | 状态 |
|---|---|---|---|---|
| `/app` | 新会话首页 | `Home.tsx` | 场景卡（数据分析/文档写作/演示文稿/深度调研）+ 输入下达任务，提交跳转任务页 | 🚧（创建任务为 mock，待接 `POST /api/tasks`）|
| `/app/task` | 任务执行页 | `TaskPage.tsx` | 任务步骤推进 / 中间产物 / 交付 / 验收清单 | 🚧（步骤为 mock 动画，待接编排 + SSE + 真文件）|
| `/app/chat` | 助理对话 | `Chat.tsx` | 多轮对话（当前本地回显） | 🚧（待接 `POST /api/chat` 流式）|
| `/app/experts` | 专家广场 | `Experts.tsx` | 专家卡展示 + 创建专属专家 | ✅（mock）|
| `/app/skills` | 技能库 | `Skills.tsx` | Markdown 技能编辑器 + 技能列表 | ✅（mock）|
| `/app/connectors` | 连接器 | `Connectors.tsx` | 连接器列表 / 在线状态 / 接入说明 | ✅（mock）|
| `/app/prompts` | 提示词库 | `Prompts.tsx` | 分类提示词 + 搜索 + 新建 | ✅（mock）|
| `/app/automation` | 自动化 | `Automation.tsx` | 定时任务列表 + 开关 + 执行历史 | ✅（mock）|
| `/app/settings` | 设置 | `Settings.tsx` | 分区设置（应用/能力/智能/系统）+ 模型渠道管理 | ✅（mock）|
| `/app/workspace` | 工作空间 | `Workspace.tsx` | 空间切换 + 文件树 + 成果文件 | 🚧（待接真目录扫描 + 下载）|

> 3 个功能页共用一个「专家 · 技能 · 连接器」页内 tab 导航：`/app/experts`、`/app/skills`、`/app/connectors`。

## 二、待开发项登记（需要但未完成）

前端壳已完整，以下为**规划中 / 待落地**的功能页面与模块：

| 项 | 类型 | 说明 | 状态 |
|---|---|---|---|
| 模型渠道 CRUD + 验活 + 模型路由 | /app/settings 内能力 | 设置页已有渠道列表展示，待接真 CRUD 与路由 | 🔲 |
| 任务真实闭环 | /app/task | 首页 → 创建任务 → 执行进度 → 交付真文件 | 🔲 |
| 对话真接入 | /app/chat | 接 LLM 流式输出（当前 mock 回显） | 🔲 |
| 专家 / 技能 CRUD + 热加载 | /app/experts, /app/skills | 当前仅展示 mock，待接真增删改编辑 | 🔲 |
| 自动化 Cron 调度 + 执行 | /app/automation | 当前 mock 列表，待接定时调度 | 🔲 |
| 工作空间真目录扫描 + 下载 | /app/workspace | 当前 mock 文件树，待接本机磁盘 | 🔲 |
| 登录 / 账号页 | 客户端工作台 | 侧栏现为本地用户「超级管理员 · 本地工作区」，多用户/登录体系未做 | 🔲 |
| 桌面版前端（Tauri 2） | 桌面应用 | 复用现有界面，打包为本机应用 | 🔲 |
| 后端 API / Agent 编排 | `apps/backend` | Agent 编排、任务调度、模型路由 | 🔲 |
| 移动端远程 / IM 桥 | 能力 | 微信 / 飞书 / QQ / 企业微信接入（官网已宣传，落地未做） | 🔲 |

## 三、说明

- 当前所有页面数据来自 `src/data/mock.ts`，未接真实 API。
- 接口与模块坑位见 `ARCHITECTURE.md` 第五节「核心模块」。
- 目录结构：Web 前端 `apps/frontend`；桌面版与后端规划中，分别占 `apps/desktop`、`apps/backend`。
