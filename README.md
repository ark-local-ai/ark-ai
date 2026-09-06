# Ark · 方舟

> 本地优先的 AI Agent 生产力工作台 —— 把一句话需求做成可编辑的成果文件（PPT / Word / Excel / 报告），数据不出本机。

**Ark · 方舟** —— "方舟承载你的工作与数据，安全独立、自主可控、成果归你。"

## 仓库结构
```
apps/
  frontend/        # Web 前端（React+TS+Vite）：官网 + 工作台 ✅ 已实现
  desktop/         # 桌面版前端（Tauri）· 规划中
  backend/         # 后端 API / Agent 编排 · 规划中
docs/              # 内部文档（本地，不提交到仓库）
ARCHITECTURE.md    # 架构文档
CONTRIBUTING.md    # 贡献指南 / 提交规范
```

> 说明：当前已实现 `apps/frontend`。桌面版（Tauri）与后端（Agent 编排）暂未落地，规划中。

## 快速开始（前端）
```bash
cd apps/frontend
npm install
npm run dev        # 开发，http://localhost:5173 （/ 官网 · /app 工作台）
npm run build      # 生产构建 dist/
```

## 当前进度（摘要）
- ✅ 前端：官网落地页 + 客户端 9 个页面，路由全部打通（mock 数据）
- 📍 下一步：接真实后端 + LLM
- 🤝 参与开发：见 [CONTRIBUTING.md]

## 文档索引（仓库内）
| 文档 | 说明 |
|---|---|
| `ARCHITECTURE.md` | 架构总览 |
| `CONTRIBUTING.md` | 贡献指南、提交规范、运行方式 |

> 产品分析 / 规格书 / 开发日志等内部文档保存在本地 `docs/`，随讨论更新，不随仓库分发。

## 许可
见 [LICENSE]。
