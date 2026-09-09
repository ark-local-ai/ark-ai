import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    // 静默 node:sqlite 的 ExperimentalWarning，保持测试输出干净
    poolOptions: {
      threads: {
        execArgv: ["--no-warnings"],
      },
    },
  },
});
