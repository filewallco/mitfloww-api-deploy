export const AsyncStatus = {
  Error: "error",
  Idle: "idle",
  Loading: "loading",
  Ready: "ready",
} as const;

export type AsyncStatus = (typeof AsyncStatus)[keyof typeof AsyncStatus];

export const ResourceLoadStatus = {
  Error: "error",
  Idle: "idle",
  Loaded: "loaded",
  Loading: "loading",
} as const;

export type ResourceLoadStatus =
  (typeof ResourceLoadStatus)[keyof typeof ResourceLoadStatus];
