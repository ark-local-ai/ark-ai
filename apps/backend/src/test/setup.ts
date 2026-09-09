// 测试全局环境准备：每个测试 worker 用独立的临时 DB，绝不让静态 import 触到真实 data/ark.db。
// 必须在测试文件顶层 import 之前运行（vitest setupFiles），否则 ESM 缓存会把 `db` 绑死到真实路径。
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ARK_TEST = "1";
if (!process.env.ARK_DB_PATH) {
  process.env.ARK_DB_PATH = join(mkdtempSync(join(tmpdir(), "ark-vitest-")), "test.db");
}
