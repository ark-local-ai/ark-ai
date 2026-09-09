import type { SseEvent } from "../types";

/**
 * 每个任务一个事件扇出队列：SSE 连接订阅，编排层发布。
 * 简单实现：Map<taskId, Set<send>>，编排时把所有订阅者都推一遍。
 */
type Sender = (event: SseEvent) => void;

const subs = new Map<string, Set<Sender>>();
const replay: Record<string, SseEvent[]> = {}; // 迟订阅者回放缓存

// 全局监听：所有任务的事件都广播到这里（M21，供「任意任务完成/失败」通知 + 侧栏刷新）
const allSubs = new Set<Sender>();

export function subscribe(taskId: string, send: Sender): () => void {
  if (!subs.has(taskId)) subs.set(taskId, new Set());
  subs.get(taskId)!.add(send);
  // 回放已发生的事件，让后接入的 SSE 也能立即拿到当前进度
  (replay[taskId] ?? []).forEach(send);
  return () => {
    subs.get(taskId)?.delete(send);
    if (subs.get(taskId)?.size === 0) subs.delete(taskId);
  };
}

/** 订阅所有任务的事件流（全局 SSE 用）。返回取消函数。 */
export function subscribeAll(send: Sender): () => void {
  allSubs.add(send);
  return () => { allSubs.delete(send); };
}

export function publish(event: SseEvent): void {
  (replay[event.taskId] ??= []).push(event);
  subs.get(event.taskId)?.forEach((send) => send(event));
  allSubs.forEach((send) => send(event));
}
