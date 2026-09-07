// ===== 技能管理（Markdown 即技能，落盘热加载） =====
// 每个技能一个 `<id>.md` 文件，元信息（name/desc/enabled）写在开头 HTML 注释 front-matter。
// 改文件即生效（下一条任务热加载）。目录不存在时按内置种子初始化。

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface Skill {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  code: string;
}

const FRONT = "<!--\n"; // front-matter 起始
const FRONT_END = "-->";

function parseMeta(body: string, id: string): { name: string; desc: string; enabled: boolean; code: string } {
  let name = id, desc = "", enabled = true;
  let code = body;
  if (body.startsWith(FRONT)) {
    const end = body.indexOf(FRONT_END);
    if (end > 0) {
      const meta = body.slice(FRONT.length, end);
      for (const line of meta.split("\n")) {
        const m = /^(name|desc|enabled):\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        const [, k, v] = m;
        if (k === "name") name = v.trim();
        else if (k === "desc") desc = v.trim();
        else if (k === "enabled") enabled = v.trim() !== "false";
      }
      code = body.slice(end + FRONT_END.length).trim();
    }
  }
  return { name, desc, enabled, code };
}

function withMeta(s: { name: string; desc: string; enabled: boolean; code: string }): string {
  return `${FRONT}name: ${s.name}\ndesc: ${s.desc}\nenabled: ${s.enabled ? "true" : "false"}\n${FRONT_END}\n${s.code.trim()}\n`;
}

/** 初始化种子技能（仅当目录为空时写内置示例） */
const SEED: { id: string; name: string; desc: string; code: string }[] = [
  {
    id: "s1", name: "PPT 设计",
    desc: "把大纲排成 15 页路演 PPT，含数据图表",
    code: "# 技能：PPT 设计\n## 触发：用户要求制作 PPT\n- 步骤1：确认大纲与页数（默认 15 页）\n- 步骤2：数据图表 → 调用「数据可视化」\n- 步骤3：模板：商务蓝 / 极简白\n- 步骤4：终审：页码 / 目录 / 图表编号\n\n## 输出：workspace/任务_月日_标题/",
  },
  {
    id: "s2", name: "数据可视化",
    desc: "读 Excel 画转化漏斗、趋势图",
    code: "# 技能：数据可视化\n- 读取 Excel/CSV\n- 生成图表并导出 PNG",
  },
  {
    id: "s3", name: "Excel 报表",
    desc: "汇总数据出带透视表的月报",
    code: "# 技能：Excel 报表\n- 汇总各门店数据\n- 生成带透视表的月度报表",
  },
  {
    id: "s4", name: "公众号推文",
    desc: "周报改写成推文，配标题排版",
    code: "# 技能：公众号推文\n- 把周报改写为推文\n- 配好标题与排版",
  },
  {
    id: "s5", name: "小红书卡片",
    desc: "产品卖点做成 9 张图片",
    code: "# 技能：小红书卡片\n- 拆卖点\n- 生成 9 张图",
  },
];

function pathFor(dir: string, id: string): string {
  return join(dir, `${id}.md`);
}

export function ensureSeed(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const anyExists = readdirSync(dir).some((f) => f.endsWith(".md"));
  if (anyExists) return;
  for (const s of SEED) {
    writeFileSync(pathFor(dir, s.id), withMeta({ ...s, enabled: true }), "utf8");
  }
}

export function listSkills(dir: string): Skill[] {
  ensureSeed(dir);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map((f) => {
      const id = f.slice(0, -3);
      const body = readFileSync(pathFor(dir, id), "utf8");
      return { id, ...parseMeta(body, id) };
    });
}

export function getSkill(dir: string, id: string): Skill | null {
  const p = pathFor(dir, id);
  if (!existsSync(p)) return null;
  const body = readFileSync(p, "utf8");
  return { id, ...parseMeta(body, id) };
}

export function saveSkill(dir: string, id: string, body: string): Skill {
  mkdirSync(dir, { recursive: true });
  // 若没有 front-matter，补一个默认
  const full = body.startsWith(FRONT) ? body : withMeta({ name: id, desc: "", enabled: true, code: body });
  writeFileSync(pathFor(dir, id), full, "utf8");
  return { id, ...parseMeta(full, id) };
}

export function toggleSkill(dir: string, id: string, enabled: boolean): Skill | null {
  const s = getSkill(dir, id);
  if (!s) return null;
  const next = { ...s, enabled };
  writeFileSync(pathFor(dir, id), withMeta(next), "utf8");
  return next;
}

/** 按元信息 + 正文整体写回（PUT 用） */
export function writeSkillMeta(
  dir: string,
  id: string,
  meta: { name: string; desc: string; enabled: boolean; code: string },
): Skill {
  mkdirSync(dir, { recursive: true });
  writeFileSync(pathFor(dir, id), withMeta(meta), "utf8");
  return { id, ...meta };
}

export function deleteSkill(dir: string, id: string): boolean {
  const p = pathFor(dir, id);
  if (!existsSync(p)) return false;
  unlinkSync(p);
  return true;
}
