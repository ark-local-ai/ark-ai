# Ark · 方舟

> 本地优先的 AI Agent 生产力工作台 —— 把一句话需求做成可编辑的成果文件（PPT / Word / Excel / 报告），数据不出本机。

**Ark · 方舟** —— "方舟承载你的工作与数据，安全独立、自主可控、成果归你。"

## 仓库结构
```
apps/frontend/   # 前端工程（Vite + React + TS）：官网 + 客户端工作台
docs/            # 产品/规格/计划/日志文档
prototype/       # 早期静态原型（历史）
ARCHITECTURE.md  # 架构文档
```

## 快速开始（前端）
```bash
cd apps/frontend
npm install
npm run dev        # 开发，http://localhost:5173 （/ 官网 · /app 工作台）
npm run build      # 生产构建 dist/
```

## 当前进度（摘要）
- ✅ 前端：官网落地页 + 客户端 9 个页面，路由全部打通（mock 数据）
- 📍 下一步：接真实后端 + LLM（坑位 A 任务闭环）
- 📌 更详细：见 [docs/开发日志_CHANGELOG.md] 与 [docs/模块坑位清单_ROADMAP.md]

## 文档索引
| 文档 | 说明 |
|---|---|
| `ARCHITECTURE.md` | 架构总览 |
| `docs/设计令牌_TOKEN.md` | 配色/样式规范 |
| `docs/功能模块规格书_MODULES.md` | 模块工单 |
| `docs/建造计划_PLAN.md` | 积木式建造计划 |
| `docs/模块坑位清单_ROADMAP.md` | 一个萝卜一个坑 |
| `docs/开发日志_CHANGELOG.md` | 逐轮开发记录 |

## 许可
见 [LICENSE]。
