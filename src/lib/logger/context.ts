import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  correlationId?: string;
  userId?: string;
  method?: string;
  path?: string;
  ip?: string;
  startTime?: number;
  extra?: Record<string, unknown>;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function getUserId(): string | undefined {
  return requestContextStorage.getStore()?.userId;
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}
