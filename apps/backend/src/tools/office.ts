// ===== Office 文件生成工具（纯 JS：pptxgenjs / exceljs / docx） =====
// 输入：需求 + 规划步骤 → 产出可编辑的真实 Office 文件（PPT/Excel/Word）。
// 选择依据：需求里的关键词命中哪个类型就生成哪个，默认 Word。

import PptxGenJS from "pptxgenjs";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export type OfficeKind = "ppt" | "xls" | "doc";

/** 每个执行步骤产出的内容段：标题 + 若干段落（由 Tool Registry 生成，注入交付文件）*/
export interface StepContent {
  title: string;
  paragraphs: string[];
}

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
  sections?: StepContent[],
): Promise<{ name: string; kind: OfficeKind; path: string }> {
  const kind = detectKind(prompt);
  const fileName = `成果-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt(kind)}`;
  const path = `${outDir}/${fileName}`;

  if (kind === "ppt") await genPpt(prompt, steps, path, sections);
  else if (kind === "xls") await genXls(prompt, steps, path, sections);
  else await genDocx(prompt, steps, path, sections);

  return { name: fileName, kind, path };
}

// ---- PPT：简版模板（封面 + 每个步骤一页 + 结尾）----
async function genPpt(prompt: string, steps: string[], path: string, sections?: StepContent[]): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };

  // 封面
  pptx.addSlide().addText(prompt, {
    x: 0.6, y: 1.4, w: 9, h: 2, fontSize: 26, bold: true, align: "center",
  });
  pptx.addSlide().addText(`本地 AI 工作台 · Ark`, {
    x: 3, y: 4, w: 4, h: 0.6, fontSize: 14, align: "center", color: "888888",
  });

  // 每步骤一页：有真实内容则全量写入（步骤标题 + 各段），否则沿用占位说明
  steps.forEach((title, i) => {
    const s = pptx.addSlide();
    s.addText(`步骤 ${i + 1}`, { x: 0.6, y: 0.4, w: 4, h: 0.5, fontSize: 12, color: "B98B4E" });
    // 标题：优先用该步的专属内容标题（更贴近产出），否则用步骤标题
    const sec = sections?.[i];
    s.addText(sec?.title ?? title, { x: 0.6, y: 1.2, w: 8.8, h: 1.2, fontSize: 24, bold: true });
    const paras = sec?.paragraphs?.length
      ? sec.paragraphs
      : [`这是第 ${i + 1} 步的执行内容，由 Ark 编排层自动生成占位说明。`];
    let y = 2.6;
    paras.forEach((p) => {
      s.addText(p, { x: 0.6, y, w: 8.8, h: 1, fontSize: 14, color: "666666" });
      y += 0.55;
    });
  });

  // 结尾
  pptx.addSlide().addText("交付 · 谢谢你", {
    x: 2.5, y: 2.5, w: 5, h: 1, fontSize: 28, bold: true, align: "center",
  });

  await pptx.writeFile({ fileName: path });
}

// ---- Excel：表头 + 步骤逐行列（含真实内容）+ 简单汇总公式 ----
async function genXls(prompt: string, steps: string[], path: string, sections?: StepContent[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("执行清单");

  ws.columns = [
    { header: "序号", key: "no", width: 8 },
    { header: "执行步骤", key: "title", width: 32 },
    { header: "状态", key: "status", width: 12 },
    { header: "内容", key: "content", width: 50 },
  ];
  steps.forEach((title, i) => {
    const sec = sections?.[i];
    const content = sec?.paragraphs?.join("\n") ?? sec?.title ?? `由一步骤：${title}`;
    ws.addRow({ no: i + 1, title: sec?.title ?? title, status: "完成", content });
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

// ---- Word：标题 + 需求 + 分步内容（有真实内容则展开）----
async function genDocx(prompt: string, steps: string[], path: string, sections?: StepContent[]): Promise<void> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: prompt, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Ark · 本地 AI 工作台 自动生成", spacing: { after: 300 } }),
        new Paragraph({ text: "一、执行计划", heading: HeadingLevel.HEADING_2 }),
        ...steps.map((t, i) => {
          const sec = sections?.[i];
          const paras: Paragraph[] = [new Paragraph({
            children: [new TextRun({ text: `${i + 1}. `, bold: true }), new TextRun(sec?.title ?? t)],
            spacing: { after: 120 },
          })];
          // 有真实产出则把该步正文逐行追加，否则保留占位说明
          if (sec?.paragraphs?.length) {
            sec.paragraphs.forEach((p) => paras.push(new Paragraph({ text: p, spacing: { after: 120 } })));
          } else {
            paras.push(new Paragraph({ text: `执行说明：第 ${i + 1} 步已由 Ark 编排层完成。`, spacing: { after: 120 } }));
          }
          return paras;
        }).flat(),
        new Paragraph({ text: "二、说明", heading: HeadingLevel.HEADING_2 }),
        new Paragraph("本文件由 Ark 编排层根据你的需求自动生成，正文可直接编辑。"),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, buffer);
}
