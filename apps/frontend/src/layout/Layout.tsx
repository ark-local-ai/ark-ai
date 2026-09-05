import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const TITLES: Record<string, string> = {
  "/app": "新会话",
  "/app/chat": "助理对话",
  "/app/experts": "专家广场",
  "/app/skills": "技能与连接器",
  "/app/prompts": "提示词",
  "/app/automation": "自动化",
  "/app/workspace": "工作空间",
  "/app/settings": "设置",
  "/app/task": "任务",
};

export default function Layout() {
  const loc = useLocation();
  const title = TITLES[loc.pathname] ?? "任务";
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <header className="top">
          <h1>{title}</h1>
          <div className="top-right"></div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
