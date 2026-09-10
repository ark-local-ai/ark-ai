import { afterEach, describe, expect, it, vi } from "vitest";

// 在 import refine 之前 mock 掉 chatWithFailover，控制「走/不走模型」
vi.mock("../models/router", () => ({
  chatWithFailover: vi.fn(),
}));

import { chatWithFailover } from "../models/router";
import { summarizeText, translateText, refineText } from "./refine";

const mockChat = chatWithFailover as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("文本加工工具（M54 refine）", () => {
  it("summarizeText 走 LLM 返回要点，viaLLM=true", async () => {
    mockChat.mockResolvedValue({ text: "要点一\n要点二", channel: "c", model: "m" });
    const r = await summarizeText("这是一段需要总结的资料正文，内容比较长。", { title: "调研", lang: "中文" });
    expect(r.viaLLM).toBe(true);
    expect(r.kind).toBe("summarize");
    expect(r.text).toContain("要点一");
  });

  it("summarizeText 空正文返回 error 不调模型", async () => {
    const r = await summarizeText("   ");
    expect(r.error).toBeTruthy();
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("summarizeText LLM 失败降级：返回截取正文，viaLLM=false", async () => {
    mockChat.mockRejectedValue(new Error("网络不通"));
    const r = await summarizeText("失败也要有兜底的一段正文内容。", { maxLen: 20 });
    expect(r.viaLLM).toBe(false);
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("translateText 走 LLM 返回译文", async () => {
    mockChat.mockResolvedValue({ text: "Translated text.", channel: "c", model: "m" });
    const r = await translateText("一段中文资料", { to: "英文" });
    expect(r.viaLLM).toBe(true);
    expect(r.text).toBe("Translated text.");
  });

  it("translateText LLM 失败降级：原样返回并提示 error", async () => {
    mockChat.mockRejectedValue(new Error("boo"));
    const r = await translateText("原文内容");
    expect(r.viaLLM).toBe(false);
    expect(r.text).toBe("原文内容");
    expect(r.error).toContain("翻译");
  });

  it("refineText 统一入口按 kind 分派", async () => {
    mockChat.mockResolvedValue({ text: "x", channel: "c", model: "m" });
    expect((await refineText("summarize", "abc")).kind).toBe("summarize");
    expect((await refineText("translate", "abc")).kind).toBe("translate");
  });
});
