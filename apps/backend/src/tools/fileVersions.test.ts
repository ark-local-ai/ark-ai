import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadIsolatedStore, cleanup } from "../test/helpers";
import type * as StoreModule from "../db/store";

let store: typeof StoreModule;
let dbDir: string; // store 临时库目录
let workDir: string; // 模拟工作空间根

beforeAll(async () => {
  const loaded = await loadIsolatedStore();
  store = loaded.store;
  dbDir = loaded.dir;
  workDir = join(tmpdir(), `ark-fv-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
});
afterAll(() => {
  cleanup(dbDir);
  rmSync(workDir, { recursive: true, force: true });
});

describe("C5 交付版本工具 snapshotDeliverable / rollbackVersion", () => {
  it("快照产生递增 seq 与存档文件，改内容后可回滚到旧版本", async () => {
    const { snapshotDeliverable, rollbackVersion, listVersions } = await import("./fileVersions.js");

    // 首版内容
    writeFileSync(join(workDir, "成果.pptx"), "v1");
    const s1 = snapshotDeliverable(workDir, "成果.pptx", "t1");
    expect(s1).toBe(1);

    // 覆盖为 v2 再快照
    writeFileSync(join(workDir, "成果.pptx"), "v2content");
    const s2 = snapshotDeliverable(workDir, "成果.pptx", "t2");
    expect(s2).toBe(2);

    // 两版存档都在
    const versions = listVersions("成果.pptx");
    expect(versions).toHaveLength(2);
    expect(readFileSync(join(workDir, "_ark_versions/成果.pptx/1-成果.pptx"), "utf8")).toBe("v1");
    expect(readFileSync(join(workDir, "_ark_versions/成果.pptx/2-成果.pptx"), "utf8")).toBe("v2content");

    // 回滚到 seq=1 → 当前文件内容恢复为 v1
    rollbackVersion(workDir, "成果.pptx", 1);
    expect(readFileSync(join(workDir, "成果.pptx"), "utf8")).toBe("v1");
  });

  it("文件不存在时返回 null（不产生空版本）", async () => {
    store.db.exec(`DELETE FROM file_versions;`); // 隔离
    const { snapshotDeliverable } = await import("./fileVersions.js");
    const r = snapshotDeliverable(workDir, "不存在.pdf", "t9");
    expect(r).toBeNull();
  });

  it("回滚不存在的版本抛错", async () => {
    const { rollbackVersion } = await import("./fileVersions.js");
    expect(() => rollbackVersion(workDir, "成果.pptx", 999)).toThrow("版本不存在");
  });
});
