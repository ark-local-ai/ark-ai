import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { detectKind, genOffice, type StepContent } from "../tools/office";
import { verifyDeliverable, verifyWithRetry } from "../agent/verifier";
import { defaultTool } from "../tools/registry";

// ===== 验收回归评测集（M28） =====
// 把「一句话 → 拆步 → 交付可编辑真实 Office 文件」这条核心卖点的验收标准，固化成可
// 回归运行的断言套件。历史成功任务的关键场景（PPT/Excel/Word）在此逐一验证：
// 交付文件真实生成、是合法 zip、能用库读回（Excel 内容可读）。任何改动若让这些
// 曾经跑通的场景退化，本套件立刻变红。
//
// 刻意只用临时目录（mkdtemp），不碰真实 workspace / 真实 DB、不发起真实 LLM ——
// 快且隔离；校验点在 deliverables 层面的"可编辑、可读回、合法"。

let outDir: string;

const stepContent = (n: number): StepContent[] =>
  Array.from({ length: n }, (_, i) => ({
    title: `步骤${i + 1}：内容整编`,
    paragraphs: [`第${i + 1}步产出的正文内容，用于验证交付文件包含该段。`],
  }));

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "ark-accept-"));
});

afterAll(() => {
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

describe("交付类型映射回归（历史成功任务 → 正确类型）", () => {
  const cases: [string, "ppt" | "xls" | "doc"][] = [
    ["做一份市场路演 PPT", "ppt"],
    ["做一份销售数据 Excel 报表", "xls"],
    ["生成路演用的演示文稿", "ppt"],
    ["整理一份财务数据表格", "xls"],
    ["写一份项目周报 Word 文档", "doc"],
    ["生成一份会议纪要文档", "doc"],
  ];
  it.each(cases)("%s → %s", async (prompt, kind) => {
    expect(detectKind(prompt)).toBe(kind);
  });
});

describe("交付文件真实生成且合法（可编辑卖点回归）", () => {
  it("PPT：生成合法 pptx（zip 头）且最终产物通过验收", async () => {
    const out = await genOffice("做一份市场路演 PPT", ["封面", "市场分析", "展望"], outDir, stepContent(3));
    expect(out.kind).toBe("ppt");
    expect(out.name.endsWith(".pptx")).toBe(true);
    expect(statSync(out.path).size).toBeGreaterThan(0);
    expect(verifyDeliverable(out.path, "ppt")).toBe(true); // 合法 zip（PK 头）
  });

  it("Word：生成合法 docx", async () => {
    const out = await genOffice("写一份项目周报 Word 文档", ["概述", "进展"], outDir, stepContent(2));
    expect(out.kind).toBe("doc");
    expect(out.name.endsWith(".docx")).toBe(true);
    expect(verifyDeliverable(out.path, "doc")).toBe(true);
  });

  it("Excel：生成 xlsx 且能用 ExcelJS 读回内容（数据真的可编辑可读）", async () => {
    const out = await genOffice("整理一份销售数据 Excel 表格", ["数据", "汇总"], outDir, stepContent(2));
    expect(out.kind).toBe("xls");
    expect(out.name.endsWith(".xlsx")).toBe(true);
    // 关键验收：不是空壳，能读回工作表与单元格
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(out.path);
    expect(wb.worksheets.length).toBeGreaterThan(0);
    const ws = wb.worksheets[0];
    expect(ws.actualRowCount).toBeGreaterThan(0);
  });
});

describe("验收/重试验证（verifier 回归）", () => {
  it("合法文件通过 verifyDeliverable，不存在的文件不过", () => {
    const good = join(outDir, "nonexistent-for-test"); // 占位
    // 用一个真实产生的文件验证通过
    return genOffice("测试 Word", ["x"], outDir).then((out) => {
      expect(verifyDeliverable(out.path, out.kind)).toBe(true);
      expect(verifyDeliverable(join(outDir, "no-such-file.pptx"), "ppt")).toBe(false);
      void good;
    });
  });

  it("verifyWithRetry 对始终失败的生成重试后抛错", async () => {
    let calls = 0;
    await expect(
      verifyWithRetry(
        () => {
          calls++;
          // 制造一个非法（空）文件路径 → verifyDeliverable 失败
          return Promise.resolve({ path: join(outDir, `empty-${calls}.txt`), kind: "doc" });
        },
        2,
      ),
    ).rejects.toThrow();
    expect(calls).toBe(2); // 恰好重试到 maxTimes
  });
});

describe("工具注册表 defaultTool（内容整编）回归", () => {
  it("产出非空标题 + 正文段落", () => {
    const r = defaultTool.run({ prompt: "做一份市场分析", plan: ["分析"], step: "市场分析", kind: "ppt" });
    expect(r.title).toBeTruthy();
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
  });
});
