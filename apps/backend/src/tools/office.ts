// ===== Office 文件生成工具（纯 JS：pptxgenjs / exceljs / docx） =====
// 输入：需求 + 规划步骤 → 产出可编辑的真实 Office 文件（PPT/Excel/Word）。
// 选择依据：需求里的关键词命中哪个类型就生成哪个，默认 Word。

import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export type OfficeKind = "ppt" | "xls" | "doc";

const PPT_KEYS = ["ppt", "演示", "幻灯片", "slides", "宣讲", "路演"];
const XLS_KEYS = ["excel", "报表", "表格", "数据", "财务", "销售", "xlsx", "汇总", "图表"];
// 其余不加关键词，默认走 doc（Word 最通用）

export function detectKind(prompt: string): OfficeKind {
  const lower = prompt.toLowerCase();
  if (PPT_KEYS.some((k) => lower.includes(k))) return "ppt";
  if (XLS_KEYS.some((k) => lower.includes(k))) return "xls";
  return "doc";
}

function fileExt(kind: OfficeKind): string {
  return kind === "ppt" ? "pptx" : kind === "xls" ? "xlsx" : "docx";
}

/** 生成 Office 文件，写入 outDir，返回 {name, kind, path, size} */
export async function genOffice(
  prompt: string,
  steps: string[],
  outDir: string,
): Promise<{ name: string; kind: OfficeKind; path: string }> {
  const kind = detectKind(prompt);
  const fileName = `成果-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt(kind)}`;
  const path = `${outDir}/${fileName}`;

  if (kind === "ppt") await genPpt(prompt, steps, path);
  else if (kind === "xls") await genXls(prompt, steps, path);
  else await genDocx(prompt, steps, path);

  return { name: fileName, kind, path };
}

// ---- PPT：简版模板（封面 + 每个步骤一页 + 结尾）----
async function genPpt(prompt: string, steps: string[], path: string): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };

  // 封面
  pptx.addSlide().addText(prompt, {
    x: 0.6, y: 1.4, w: 9, h: 2, fontSize: 26, bold: true, align: "center",
  });
  pptx.addSlide().addText(`本地 AI 工作台 · Ark`, {
    x: 3, y: 4, w: 4, h: 0.6, fontSize: 14, align: "center", color: "888888",
  });

  // 每步骤一页，配一句说明
  steps.forEach((title, i) => {
    const s = pptx.addSlide();
    s.addText(`步骤 ${i + 1}`, { x: 0.6, y: 0.4, w: 4, h: 0.5, fontSize: 12, color: "B98B4E" });
    s.addText(title, { x: 0.6, y: 1.2, w: 8.8, h: 1.2, fontSize: 24, bold: true });
    s.addText(`这是第 ${i + 1} 步的执行内容，由 Ark 编排层自动生成占位说明。`, {
      x: 0.6, y: 2.6, w: 8.8, h: 1, fontSize: 14, color: "666666",
    });
  });

  // 结尾
  pptx.addSlide().addText("交付 · 谢谢你", {
    x: 2.5, y: 2.5, w: 5, h: 1, fontSize: 28, bold: true, align: "center",
  });

  await pptx.writeFile({ fileName: path });
}

// ---- Excel：表头 + 步骤逐行列 + 简单汇总 ---- 
async function genXls(prompt: string, steps: string[], path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("执行清单");

  ws.columns = [
    { header: "序号", key: "no", width: 8 },
    { header: "执行步骤", key: "title", width: 32 },
    { header: "状态", key: "status", width: 12 },
    { header: "说明", key: "note", width: 30 },
  ];
  steps.forEach((title, i) => {
    ws.addRow({ no: i + 1, title, status: "待执行", note: `由一步骤：${title}` });
  });

  // 汇总区（演示"公式原生可编辑"：=COUNTA 统计步骤数）
  const summaryRow = steps.length + 3;
  ws.addRow([]);
  ws.addRow({ no: "总步骤数", title: "（使用 Excel 公式统计）", status: "汇总" });
  ws.getCell(`A${summaryRow}`).value = "总步骤数：";
  ws.getCell(`B${summaryRow}`).value = { formula: `COUNTA(A2:A${steps.length + 1})`, result: steps.length };

  ws.getRow(1).font = { bold: true };

  await wb.xlsx.writeFile(path);
}

// ---- Word：标题 + 需求 + 分步列表 ----
async function genDocx(prompt: string, steps: string[], path: string): Promise<void> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: prompt, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Ark · 本地 AI 工作台 自动生成", spacing: { after: 300 } }),
        new Paragraph({ text: "一、执行计划", heading: HeadingLevel.HEADING_2 }),
        ...steps.map((t, i) => new Paragraph({
          children: [new TextRun({ text: `${i + 1}. `, bold: true }), new TextRun(t)],
          spacing: { after: 120 },
        })),
        new Paragraph({ text: "二、说明", heading: HeadingLevel.HEADING_2 }),
        new Paragraph("本文件由 Ark 编排层根据你的需求自动生成，正文可直接编辑。"),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, buffer);
}
