// ===== Ark 数据模型（前端静态类型 + 示例数据） =====

export type StepStatus = "done" | "run" | "wait";
export interface TaskStep { title: string; status: StepStatus; note?: string }

export type TaskStatus = "queue" | "run" | "done" | "error";
export interface Artifact { name: string; kind: string; note: string }
export interface Task {
  id: string; title: string; status: TaskStatus; prompt: string;
  steps: TaskStep[]; artifacts: Artifact[]; deliverable: Artifact | null;
  model: string; expert: string; skills: string[]; workspace: string;
  checks: { label: string; ok: boolean }[]; timeline: { time: string; label: string }[];
  created: string;
}

export interface Expert {
  id: string; name: string; icon: string; color: string; desc: string;
  skills: string; connectors: string; builtin: boolean;
}
export interface Skill { id: string; name: string; desc: string; enabled: boolean; code: string }
export interface Channel { id: string; name: string; proto: "openai" | "anthropic"; model: string; url: string; defaultOf?: boolean }
export interface Connector { name: string; online: boolean; note: string; dot: string }
export interface Job { id: string; name: string; trigger: string; action: string; push: string; enabled: boolean; next: string }
export interface JobLog { time: string; name: string; result: string; ok: boolean }
export interface AppFile { name: string; kind: string; size: string; time: string; status?: string; statusColor?: string }
export interface SpaceFile { name: string; dir: boolean; color?: string }
export interface RecentTask { id: string; title: string; time: string; space: string | null }

// ---- 场景库（WorkBuddy 式封装：「场景」→「参考提示词」，选中后落到首页输入台） ----
export interface ScenePrompt { text: string; note: string }
export interface Scenario {
  id: string; name: string; icon: string; color: string; desc: string;
  prompts: ScenePrompt[];
}
export const scenarios: Scenario[] = [
  {
    id: "docops", name: "文档处理", icon: "档", color: "var(--ok)",
    desc: "下载、转换、汇总为 PDF / Excel / Word 成品", prompts: [
      { text: "帮我下载腾讯2025中期报告完整财报 PDF，从 PDF 中提取财务数据，创建一个 Excel 财务模型（包含公式和格式），再制作一份演示文稿，最后生成一份包含完整分析的 Word 报告（带目录和页眉页脚）", note: "财报分析全流程" },
      { text: "把这份 Markdown 文档排版转换为 PDF，要求封面、目录与页码齐全", note: "MD转PDF文档" },
      { text: "对比三个竞品的定位、功能与定价，输出一份对比分析报告", note: "竞品对比分析" },
      { text: "把本周多条项目动态汇总成一份项目周报，排版为 Word 文档", note: "项目周报转Word" },
    ],
  },
  {
    id: "writing", name: "文档写作", icon: "文", color: "var(--brand)",
    desc: "周报、邮件、文案等场景化写作", prompts: [
      { text: "写一份本周工作周报，突出进展、风险与下一步计划，分点列出", note: "标准周报" },
      { text: "把下面几项要点改写成一封发给领导的正式工作邮件", note: "邮件版" },
      { text: "润色这段文字，让表达更专业、更有说服力", note: "润色" },
    ],
  },
  {
    id: "data", name: "数据分析", icon: "数", color: "#0e9bac",
    desc: "读数据出图表、报表与异常解释", prompts: [
      { text: "读取这份 Excel，生成可视化图表并说明关键结论", note: "图表+结论" },
      { text: "汇总多个工作表数据，生成一份月度经营报表", note: "月度报表" },
      { text: "找出这批数据中的异常值，并解释可能的原因", note: "异常排查" },
    ],
  },
  {
    id: "slides", name: "演示文稿", icon: "演", color: "#e8853c",
    desc: "把大纲排成结构清晰的 PPT", prompts: [
      { text: "把这份大纲做成 15 页路演 PPT，含市场分析与数据图表", note: "路演版" },
      { text: "把产品介绍排成 8 页极简风格 PPT，每页一个核心卖点", note: "产品介绍" },
    ],
  },
  {
    id: "research", name: "深度调研", icon: "调", color: "var(--warn)",
    desc: "多信息来源的竞品与趋势对比", prompts: [
      { text: "调研主要竞品的最新动态，输出一份对比报告并给建议", note: "竞品对比" },
      { text: "梳理这个行业近期的关键趋势，整理成带引用的要点", note: "行业趋势" },
    ],
  },
  {
    id: "meeting", name: "会议纪要", icon: "会", color: "#7c5cf0",
    desc: "把讨论整理成结构化的纪要", prompts: [
      { text: "把这段会议讨论整理成纪要：议题、结论、待办与责任人", note: "结构化纪要" },
    ],
  },
];

// ---- 侧栏 · 最近任务（space = null 表示未归入任何工作空间） ----
export const recentTasks: RecentTask[] = [
  { id: "r1", title: "C盘清理建议与文件确认", time: "14小时", space: null },
  { id: "r2", title: "ds harness 和 glm harness 对接联调", time: "2天前", space: null },
  { id: "r3", title: "分析简历与面试项目准备", time: "25天前", space: null },
  { id: "r4", title: "Q3 竞品分析报告 PPT", time: "2天前", space: "默认工作空间" },
  { id: "r5", title: "销售数据清洗与可视化", time: "3天前", space: "默认工作空间" },
  { id: "r6", title: "项目周报汇总（第 36 周）", time: "5天前", space: "项目集 · 数字人" },
  { id: "r7", title: "数字人形象方案比选", time: "6天前", space: "项目集 · 数字人" },
  { id: "r8", title: "运维巡检月报生成", time: "7天前", space: "运维 · 2026" },
];

// ---- 示例：任务 ----
export const sampleTask: Task = {
  id: "t-1001", title: "竞品分析报告", status: "run",
  prompt: "帮我出一份 Q3 复盘 PPT，数据用这份 Excel",
  model: "DeepSeek", expert: "数据分析师", skills: ["PPT 设计", "数据可视化"], workspace: "默认",
  steps: [
    { title: "读取销售数据.xlsx，清洗并汇总", status: "done" },
    { title: "生成对比图表与叙事线", status: "run" },
    { title: "排版成 12 页 PPT 并终审", status: "wait" },
    { title: "交付 Q3复盘.pptx（12 页）", status: "wait" },
  ],
  artifacts: [{ name: "销售汇总.xlsx", kind: "xls", note: "已另存到工作空间 · 6 Sheet" }],
  deliverable: { name: "Q3复盘.pptx", kind: "ppt", note: "12 页 · 图表 6 处 · 可编辑" },
  checks: [
    { label: "覆盖 5 家主要竞品", ok: true },
    { label: "包含数据对比图表", ok: true },
    { label: "PPT 排版终审", ok: false },
  ],
  timeline: [
    { time: "09:00", label: "创建任务" },
    { time: "09:01", label: "读取 Excel" },
    { time: "09:03", label: "生成图表" },
    { time: "09:08", label: "排版 PPT" },
  ],
  created: "09-05 09:00",
};

// ---- 专家 ----
export const experts: Expert[] = [
  { id: "e1", name: "调研专家", icon: "调", color: "#4F46E5", desc: "检索多方信息来源，产出带引用的研究报告", skills: "2", connectors: "1", builtin: true },
  { id: "e2", name: "数据分析师", icon: "数", color: "#0E9BAC", desc: "读取数据做清洗、统计与可视化结论", skills: "3", connectors: "1", builtin: true },
  { id: "e3", name: "写作专家", icon: "写", color: "#7C5CF0", desc: "周报/推文/文档，按场景组织语言与排版", skills: "2", connectors: "0", builtin: true },
  { id: "e4", name: "设计专家", icon: "设", color: "#E8853C", desc: "排版配色与图表审美，产出 PPT/图片", skills: "2", connectors: "2", builtin: true },
  { id: "e5", name: "策略顾问", icon: "策", color: "#0E9BAC", desc: "拆解业务问题，给出可执行的行动建议", skills: "1", connectors: "1", builtin: true },
];

// ---- 技能 ----
export const skills: Skill[] = [
  { id: "s1", name: "PPT 设计", desc: "把大纲排成 15 页路演 PPT，含数据图表", enabled: true, code: "# 技能：PPT 设计\n## 触发：用户要求制作 PPT\n- 步骤1：确认大纲与页数（默认 15 页）\n- 步骤2：数据图表 → 调用「数据可视化」\n- 步骤3：模板：商务蓝 / 极简白\n- 步骤4：终审：页码 / 目录 / 图表编号\n\n## 输出：workspace/任务_月日_标题/" },
  { id: "s2", name: "数据可视化", desc: "读 Excel 画转化漏斗、趋势图", enabled: true, code: "# 技能：数据可视化\n- 读取 Excel/CSV\n- 生成图表并导出 PNG" },
  { id: "s3", name: "Excel 报表", desc: "汇总数据出带透视表的月报", enabled: true, code: "# 技能：Excel 报表\n- 汇总各门店数据\n- 生成带透视表的月度报表" },
  { id: "s4", name: "公众号推文", desc: "周报改写成推文，配标题排版", enabled: false, code: "# 技能：公众号推文\n- 把周报改写为推文\n- 配好标题与排版" },
  { id: "s5", name: "小红书卡片", desc: "产品卖点做成 9 张图片", enabled: true, code: "# 技能：小红书卡片\n- 拆卖点\n- 生成 9 张图" },
];

// ---- 模型渠道 ----
export const channels: Channel[] = [
  { id: "c1", name: "DeepSeek", proto: "openai", model: "deepseek-v4-flash", url: "https://api.deepseek.com/v1", defaultOf: true },
  { id: "c2", name: "通义 Qwen", proto: "openai", model: "qwen-max", url: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "c3", name: "智谱 GLM", proto: "openai", model: "glm-4-plus", url: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "c4", name: "Kimi", proto: "openai", model: "moonshot-v1-32k", url: "https://api.moonshot.cn/v1" },
  { id: "c5", name: "Ollama 本地", proto: "openai", model: "qwen3:14b", url: "http://localhost:11434/v1" },
  { id: "c6", name: "Anthropic Claude", proto: "anthropic", model: "claude-sonnet-5", url: "https://api.anthropic.com/v1" },
];

// ---- 连接器 ----
export const connectors: Connector[] = [
  { name: "模型渠道", online: true, note: "9 个 · 默认 DeepSeek", dot: "#16A34A" },
  { name: "联网搜索", online: true, note: "已开启", dot: "#16A34A" },
  { name: "内置浏览器", online: true, note: "已开启", dot: "#16A34A" },
  { name: "IM 桥", online: true, note: "企业微信 已连接", dot: "#16A34A" },
  { name: "Ollama 本地", online: false, note: "未启用", dot: "#B6B7C4" },
];

// ---- 自动化 ----
export const jobs: Job[] = [
  { id: "j1", name: "每日晨报", trigger: "每天 09:00", action: "汇总昨日任务与成果，生成晨报", push: "企业微信群", enabled: true, next: "明天 09:00" },
  { id: "j2", name: "竞品动态监控", trigger: "每 6 小时", action: "抓取竞品官网/公众号更新，输出差异简报", push: "企业微信 · 飞书", enabled: true, next: "今天 18:00" },
  { id: "j3", name: "周报汇总", trigger: "每周五 18:00", action: "汇总本周任务，生成周报初稿", push: "邮件", enabled: false, next: "已暂停" },
];
export const jobLogs: JobLog[] = [
  { time: "09-05 09:00", name: "每日晨报", result: "成功 · 耗时 42s", ok: true },
  { time: "09-05 12:00", name: "竞品监控", result: "成功 · 新增 3 条动态", ok: true },
  { time: "09-04 18:00", name: "周报汇总", result: "失败 → 自动重试成功", ok: false },
];

// ---- 工作空间 ----
export const spaces = [
  { name: "默认工作空间", count: 6, on: true },
  { name: "项目集 · 数字人", count: 3, on: false },
  { name: "运维 · 2026", count: 12, on: false },
];
export const spaceFiles: SpaceFile[] = [
  { name: "2026-09-05_竞品分析报告", dir: true },
  { name: "销售数据.xlsx", dir: false, color: "xls" },
  { name: "Q3复盘.pptx", dir: false, color: "ppt" },
  { name: "汇总表.xlsx", dir: false, color: "xls" },
  { name: "2026-09-04_项目周报", dir: true },
  { name: "项目周报.docx", dir: false, color: "doc" },
  { name: "项目周报-更新版.docx", dir: false, color: "doc" },
  { name: "2026-09-01_深度调研", dir: true },
];
export const appFiles: AppFile[] = [
  { name: "Q3复盘.pptx", kind: "ppt", size: "12 页 · 图表 6 处", time: "09-05" },
  { name: "销售汇总.xlsx", kind: "xls", size: "6 Sheet · 公式原生可编辑", time: "09-05" },
  { name: "项目周报-更新版.docx", kind: "doc", size: "图文混排 · 目录可更新", time: "09-04" },
  { name: "架构图.png", kind: "png", size: "本机离线渲染", time: "09-04" },
  { name: "落地页.html", kind: "html", size: "已上线 · 扫码可看", time: "09-04" },
  { name: "数据分析及可视化.xlsx", kind: "xls", size: "含转化漏斗图", time: "09-03" },
];

export const ftColor: Record<string, string> = {
  ppt: "var(--ft-ppt)", xls: "var(--ft-xls)", doc: "var(--ft-doc)",
  png: "var(--ft-png)", html: "var(--ft-html)", pdf: "var(--ft-pdf)", md: "var(--ft-doc)",
};
export function ftLabel(k: string) { return k.toUpperCase(); }
