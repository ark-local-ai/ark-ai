// ===== 验收/校验 verifier =====
// 对交付文件做真实校验（存在 / 非空 / 是合法 Office zip），不达标限次重试。
// Office 文件是 zip 容器，首字节应为 "PK"；导出为通用校验点，后续可加内容级校验。

import { statSync, readFileSync } from "node:fs";

export interface VerifyFailed extends Error {}

/** 校验一个交付文件是否合法。抛错 / false 表示不通过。 */
export function verifyDeliverable(path: string, kind: string): boolean {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size === 0) return false;
    // Office (pptx/xlsx/docx) 都是 zip 容器，头两个字节为 PK
    if (["ppt", "xls", "doc"].includes(kind)) {
      const buf = Buffer.alloc(2);
      const fd = readFileSync(path);
      buf.write(fd.subarray(0, 2).toString("latin1"));
      if (fd[0] !== 0x50 || fd[1] !== 0x4b) return false; // 'P' 'K'
    }
    return true;
  } catch {
    return false;
  }
}

/** 带重试的校验：执行 gen 直到产出合法文件或达到 maxTimes。返回最终产物或抛错。 */
export async function verifyWithRetry<T extends { path: string; kind: string }>(
  gen: () => Promise<T>,
  maxTimes: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxTimes; i++) {
    try {
      const out = await gen();
      if (verifyDeliverable(out.path, out.kind)) return out;
      throw new Error("交付文件校验未通过");
    } catch (e) {
      lastErr = e;
      if (i < maxTimes - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("生成交付文件失败");
}
