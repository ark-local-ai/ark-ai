import type { SseEvent } from "../types";

/**
 * 每个任务一个事件扇出队列：SSE 连接订阅，编排层发布。
 * 简单实现：Map<taskId, Set<send>>，编排时把所有订阅者都推一遍。
 */
type Sender = (event: SseEvent) => void;

const subs = new Map<string, Set<Sender>>();
const replay: Record<string, SseEvent[]> = {}; // 迟订阅者回放缓存

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

export function publish(event: SseEvent): void {
  (replay[event.taskId] ??= []).push(event);
  subs.get(event.taskId)?.forEach((send) => send(event));
}
