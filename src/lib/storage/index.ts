import { R2Storage } from "./r2";
import { LocalStorage } from "./local";
import type { FileStorage } from "./types";


let storageInstance: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!storageInstance) {
    if (process.env.STORAGE_PROVIDER === "local") {
      storageInstance = new LocalStorage();
    } else {
      storageInstance = new R2Storage();
    }
  }
  return storageInstance;
}

export const storage = new Proxy({} as FileStorage, {
  get(target, prop) {
    const instance = getStorage();
    const value = instance[prop as keyof FileStorage];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  }
});
export type { FileStorage } from "./types";
