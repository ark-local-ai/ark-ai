// ===== C5 交付版本历史：工作空间版本快照 + 回滚 =====
// 每次任务产出交付文件后，把当前文件快照进工作空间内隐藏目录 `_ark_versions/<fileName>/seq-<fileName>`，
// 在 `file_versions` 表记录一条（含存档相对路径）。可列出历史、回滚到任一旧版本
// （把存档复制回当前路径覆盖）。用隐藏目录而非与用户文件混在一起；scanWorkspace 会跳过 `_ark_versions`。

import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { addFileVersion, listFileVersions, getFileVersion, deleteFileVersions, type FileVersion } from "../db/store";

export const VERSION_DIR = "_ark_versions";

/**
 * 快照当前交付文件（若存在）进版本历史，返回归档的 nextSeq。
 * 生成逻辑：先查表内该文件名的最大 seq，+1 为本次归档序号，写入存档路径再复制文件。
 */
export function snapshotDeliverable(workDir: string, fileName: string, taskId?: string): number | null {
  const src = join(workDir, fileName);
  if (!existsSync(src)) return null;
  const versions = listFileVersions(fileName);
  const maxSeq = versions.length ? versions[0].seq : 0; // 表按 seq DESC
  const seq = maxSeq + 1;
  addFileVersion(fileName, taskId, `${VERSION_DIR}/${fileName}/${seq}-${fileName}`);
  const dir = join(workDir, VERSION_DIR, fileName);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, `${seq}-${fileName}`));
  return seq;
}

/** 列出某文件的版本历史（含相对存档路径）；每条可回滚 */
export function listVersions(fileName: string): FileVersion[] {
  return listFileVersions(fileName);
}

/** 回滚到某历史版本：把存档复制回工作空间当前路径覆盖；返回回滚到的版本信息 */
export function rollbackVersion(workDir: string, fileName: string, seq: number): FileVersion {
  const v = getFileVersion(fileName, seq);
  if (!v) throw new Error("版本不存在");
  const archived = join(workDir, v.archived);
  if (!existsSync(archived)) throw new Error("版本存档文件缺失");
  copyFileSync(archived, join(workDir, fileName));
  return v;
}

/** 删除某文件名的版本存档目录与记录（配合工作目录清理） */
export function clearVersions(workDir: string, fileName: string): void {
  deleteFileVersions(fileName);
  try {
    rmSync(join(workDir, VERSION_DIR, fileName), { recursive: true, force: true });
  } catch { /* 忽略 */ }
}
