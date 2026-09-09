// ===== 联网搜索源设置（M50 副线：搜索源可控、可显式关停） =====
// 符合「数据不出机器」原则：联网搜索会把 query 经本机出网，默认启用，但用户可随时显式关停。
// 关停后：web.search 路由 403 + gatherContext/编排不再自动联网（searchWeb 直接返回 error）。

import { getSetting, setSetting } from "../db/store";

const KEY_ENABLED = "websearch_enabled";

/** 联网搜索是否启用（默认开启；settings 存 "1"/"0"） */
export function isWebSearchEnabled(): boolean {
  return getSetting(KEY_ENABLED) !== "0"; // 未设或 "1" → 开
}

/** 设置联网搜索启用状态，返回最新状态 */
export function setWebSearchEnabled(enabled: boolean): boolean {
  setSetting(KEY_ENABLED, enabled ? "1" : "0");
  return enabled;
}

/** 当前搜索源描述（供前端如实展示配置情况） */
export interface SearchSourceStatus {
  enabled: boolean;
  provider: "duckduckgo" | "custom";
  endpointConfigured: boolean;
}

export function getSearchSourceStatus(): SearchSourceStatus {
  const endpoint = (process.env.ARK_WEBSEARCH_ENDPOINT ?? "").trim();
  return {
    enabled: isWebSearchEnabled(),
    provider: endpoint ? "custom" : "duckduckgo",
    endpointConfigured: !!endpoint,
  };
}
