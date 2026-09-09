// ===== 结构化日志工具（M26） =====
// 统一 pino 结构化 JSON 输出，带 service 常数字段。
// 任务执行阶段没有请求对象，因此额外提供 taskLogger(id)——用任务 ID 作为贯穿键，
// 让编排全过程的日志可被一个 ID 串起来。
//
// 注意：Fastify 5 的 logger 选项只接受「配置对象」，不接受 pino 实例，
// 因此这里导出 loggerOptions 供 Fastify 用；任务执行用独立的 rootLogger。
import pino from "pino";

const isTest = process.env.ARK_TEST === "1";

/** 供 Fastify 使用的 logger 配置对象（Fastify 5 只接受 configuration object） */
export const loggerOptions: pino.LoggerOptions = {
  name: "ark-backend",
  level: process.env.LOG_LEVEL || "info",
  base: { service: "ark-backend" },
  enabled: !isTest, // 测试时静默，避免测试输出噪声
};

/** 独立 pino 实例：给任务执行等脱离 HTTP 请求上下文的地方用 */
const rootLogger = pino(loggerOptions);

/** 按任务 ID 绑定的 child logger：异步任务执行时把日志挂到这个贯穿键下 */
export function taskLogger(taskId: string) {
  return rootLogger.child({ taskId });
}
