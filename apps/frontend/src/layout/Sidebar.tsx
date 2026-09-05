import { NavLink } from "react-router-dom";
import {
  IconHome, IconChat, IconSpark, IconUsers, IconClock, IconFolder, IconGear, IconSearch, IconPlus, IconDoc,
} from "../components/icons";

function Item({ to, icon, label, end }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sb-item${isActive ? " on" : ""}`}>
      <span className="icw">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="sb">
      <div className="sb-logo">
        <div className="mark">A</div>
        <div className="sb-name">
          <b>Ark</b>
          <span>方舟</span>
        </div>
      </div>
      <button className="sb-new" onClick={() => (location.href = "/app")}>
        <span className="icw"><IconPlus /></span> 新任务
      </button>
      <div className="sb-sec">工作 · 对话</div>
      <Item to="/app" end icon={<IconHome />} label="新会话" />
      <Item to="/app/chat" icon={<IconChat />} label="助理对话" />
      <Item to="/app/experts" icon={<IconUsers />} label="专家广场" />
      <Item to="/app/skills" icon={<IconSpark />} label="技能与连接器" />
      <Item to="/app/prompts" icon={<IconDoc />} label="提示词" />
      <Item to="/app/automation" icon={<IconClock />} label="自动化" />
      <Item to="/app/workspace" icon={<IconFolder />} label="工作空间" />
      <div className="sb-sec">系统</div>
      <Item to="/app/settings" icon={<IconGear />} label="设置" />

      <div className="sb-search">
        <IconSearch />
        <input placeholder="搜索对话、页面、技能…" />
        <kbd>Ctrl K</kbd>
      </div>
      <div className="sb-user">
        <div className="ava">管</div>
        <div className="sb-user-t">
          <b>超级管理员</b>
          <span>本地工作区</span>
        </div>
      </div>
    </aside>
  );
}
