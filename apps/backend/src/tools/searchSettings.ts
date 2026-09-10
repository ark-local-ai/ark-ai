// ===== 联网搜索源设置（M50 副线 + M53 搜索源管理面板） =====
// 符合「数据不出机器」原则：联网搜索会把 query 经本机出网，默认启用，但用户可随时显式关停。
// 关停后：web.search 路由 403 + gatherContext/编排不再自动联网（searchWeb 直接返回 error）。
//
// M53：搜索源从「env 配置」升级为「库内可编辑配置 + 节流配额」——
//   · provider：duckduckgo（免 key 默认）| custom（自配 endpoint + key）
//   · 配额：滑动窗口限流（rpm 次/分钟），避免脚本/误触把出网打爆
// 配置存 settings 表（与 websearch_enabled 同处），前端设置页可视化编辑，数据不出本机。

import { getSetting, setSetting } from "../db/store";

const KEY_ENABLED = "websearch_enabled";
const KEY_PROVIDER = "websearch_provider";
const KEY_ENDPOINT = "websearch_endpoint";
const KEY_KEY = "websearch_key";
const KEY_RPM = "websearch_rpm";
// 滑动窗口节流：存上一次计数的分钟起始 epoch（秒）与窗口内计数
const KEY_WINDOW = "websearch_window_ts";
const KEY_COUNT = "websearch_window_count";

const DEFAULT_RPM = 30;
const WINDOW_MS = 60_000;

/** 联网搜索是否启用（默认开启；settings 存 "1"/"0"） */
export function isWebSearchEnabled(): boolean {
  return getSetting(KEY_ENABLED) !== "0"; // 未设或 "1" → 开
}

/** 设置联网搜索启用状态，返回最新状态 */
export function setWebSearchEnabled(enabled: boolean): boolean {
  setSetting(KEY_ENABLED, enabled ? "1" : "0");
  return enabled;
}

// ---------- M53：provider 配置（库内可编辑，优先于 env） ----------

export type SearchProvider = "duckduckgo" | "custom";

/** 配置态：provider + 自配 endpoint/key（custom 才有） */
export interface SearchProviderConfig {
  provider: SearchProvider;
  endpoint: string;
  key: string;
  /** 当前生效的 endpoint（custom 且配了 endpoint → 用库内；否则用 env 兜底） */
  configuredEndpoint: string;
}

function numSetting(key: string, dflt: number): number {
  const v = Number(getSetting(key));
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

/** 读当前 provider 配置。库内设置优先，env（ARK_WEBSEARCH_ENDPOINT/KEY）作未配置时的兜底。 */
export function getConfiguredSearch(): SearchProviderConfig {
  const storedProvider = getSetting(KEY_PROVIDER);
  const storedEndpoint = (getSetting(KEY_ENDPOINT) ?? "").trim();
  const storedKey = (getSetting(KEY_KEY) ?? "").trim();
  const envEndpoint = (process.env.ARK_WEBSEARCH_ENDPOINT ?? "").trim();
  const envKey = (process.env.ARK_WEBSEARCH_KEY ?? "").trim();

  const provider: SearchProvider = storedProvider === "custom"
    || (storedEndpoint && storedProvider !== "duckduckgo") ? "custom" : "duckduckgo";
  // custom 时：库内 endpoint 优先，其次 env；key 同
  const configuredEndpoint = (provider === "custom")
    ? (storedEndpoint || envEndpoint)
    : "";
  const key = (provider === "custom") ? (storedKey || envKey) : "";
  return { provider, endpoint: configuredEndpoint, key, configuredEndpoint };
}

/** 切换 provider 并（可选）写 endpoint/key。custom 必须给 endpoint，否则回落 duckduckgo。 */
export function updateSearchProvider(
  provider: SearchProvider,
  endpoint?: string,
  key?: string,
): SearchProviderConfig {
  setSetting(KEY_PROVIDER, provider);
  if (provider === "custom") {
    const ep = (endpoint ?? "").trim();
    if (!ep) {
      // 空 endpoint → 视为没配好，回落 duckduckgo（自定义未生效）
      setSetting(KEY_PROVIDER, "duckduckgo");
      return getConfiguredSearch();
    }
    setSetting(KEY_ENDPOINT, ep);
    if (key !== undefined) setSetting(KEY_KEY, (key ?? "").trim());
  } else {
    // 回到 duckduckgo：清掉库内自定义配置（env 兜底仍可被 ARK_WEBSEARCH_ENDPOINT 触发）
    setSetting(KEY_ENDPOINT, "");
    setSetting(KEY_KEY, "");
  }
  return getConfiguredSearch();
}

// ---------- M53：节流配额（滑动窗口） ----------

export interface SearchQuotaStatus {
  rpm: number;
  used: number;
  remaining: number;
  /** 是否达到配额（remaining <= 0） */
  limited: boolean;
}

/** 读当前配额配置与窗口内已用计数。 */
export function getQuotaStatus(): SearchQuotaStatus {
  const rpm = numSetting(KEY_RPM, DEFAULT_RPM);
  const now = Date.now();
  const winTs = Number(getSetting(KEY_WINDOW)) || 0;
  const count = Number(getSetting(KEY_COUNT)) || 0;
  // 窗口滚动：上一计数窗口若已过期，从 0 重新计
  const fresh = (now - winTs) < WINDOW_MS ? count : 0;
  return { rpm, used: fresh, remaining: Math.max(0, rpm - fresh), limited: fresh >= rpm };
}

/** 尝试消耗一次配额。未达上限 → 计入并返回 true；已达上限 → 返回 false。 */
export function tryConsumeQuota(): boolean {
  const rpm = numSetting(KEY_RPM, DEFAULT_RPM);
  const now = Date.now();
  const winTs = Number(getSetting(KEY_WINDOW)) || 0;
  let count = Number(getSetting(KEY_COUNT)) || 0;
  if ((now - winTs) >= WINDOW_MS) count = 0; // 新窗口
  if (count >= rpm) return false;
  setSetting(KEY_WINDOW, String(winTs === 0 || (now - winTs) >= WINDOW_MS ? now : winTs));
  setSetting(KEY_COUNT, String(count + 1));
  return true;
}

/** 设置每分钟配额（1~6000），并重置计量窗口。返回新配额状态。非法输入回退默认。 */
export function setQuota(rpm: number): SearchQuotaStatus {
  const n = Math.floor(rpm);
  const clamped = Number.isFinite(n) ? Math.max(1, Math.min(6000, n)) : DEFAULT_RPM;
  setSetting(KEY_RPM, String(clamped));
  // 改配额即重新开始计量：清掉当前窗口起点与计数
  setSetting(KEY_WINDOW, String(Date.now()));
  setSetting(KEY_COUNT, "0");
  return getQuotaStatus();
}

/** 当前搜索源完整状态（供前端设置页如实展示） */
export interface SearchSourceStatus {
  enabled: boolean;
  provider: SearchProvider;
  /** 是否已配好自定义 endpoint（provider 为 custom 且 endpointConfigured=true） */
  endpointConfigured: boolean;
  /** provider 为 custom 时的 endpoint（脱敏展示用；duckduckgo 时为空串） */
  endpoint?: string;
  /** provider 为 custom 时是否配了 key（只告诉有/无，不泄 key） */
  hasKey?: boolean;
  quote: SearchQuotaStatus;
}

export function getSearchSourceStatus(): SearchSourceStatus {
  const enabled = isWebSearchEnabled();
  const cfg = getConfiguredSearch();
  const isCustom = cfg.provider === "custom";
  return {
    enabled,
    provider: cfg.provider,
    endpointConfigured: isCustom && !!cfg.configuredEndpoint,
    ...(isCustom ? {
      endpoint: cfg.configuredEndpoint,
      // 已记库的 key 是否存在于配置（env 的 key 不在此状态暴露）
      hasKey: !!getSetting(KEY_KEY),
    } : {}),
    quote: getQuotaStatus(),
  };
}
