# Ark · 方舟 — 桌面版（apps/desktop）

Tauri 2 桌面应用，复用 `apps/frontend` 的整套界面与布局，打包为本机 Windows 应用（也可跨平台）。

## 技术栈
- **Tauri 2**（Rust 壳）：无边框窗口 + 自绘标题栏，轻量（安装包几 MB 量级）
- **React 19 + TypeScript + Vite**，跨包相对导入 `../frontend/src/*` 复用 Web 界面
- 前端零代码重复、不改动 `apps/frontend`

## 目录
```
apps/desktop/
  src/
    main.tsx        # 桌面入口，引入 frontend 所有 CSS + 本目录 desktop.css
    App.tsx         # HashRouter + 路由表（默认落 /app 工作台）
    TitleBar.tsx    # 自绘标题栏：拖拽 / 最小化 / 最大化 / 关闭
    desktop.css     # 标题栏样式 + 工作台高度降出标题栏
  src-tauri/
    src/            # Rust 壳（main.rs / lib.rs / build.rs）
    tauri.conf.json # 窗口、打包、标识配置
    capabilities/   # 窗口控制权限
    icons/          # 应用图标（由 appicon.svg 生成）
```

## 运行（开发）
```bash
cd apps/desktop
npm install
npm run desktop:dev
```
会拉起 vite dev server（:5174）并打开桌面窗口（复用 frontend 界面热更新）。

## 打包
```bash
npm run desktop:build
```
产物在 `src-tauri/target/release/`：可执行文件 `ark-desktop.exe` + NSIS 安装包。

## 环境要求
- Node 18+、npm
- Rust 工具链（GNU 或 MSVC）+ 链接器（Windows 下 MinGW-w64 或 VS Build Tools）
- WebView2 运行时（Win10/11 已内置，Win7/8 需手动装）

## 说明
- 前端目前全部为 mock 数据（`apps/frontend/src/data/mock.ts`），后端接入后桌面版自动复用同一套真实数据层。
- 路由用 `HashRouter`：桌面环境无服务器，`BrowserRouter` 的 History API 在 Tauri 自定义协议下不可用。
