
import type { TranslationStatus } from "@/lib/dto/translated-text";

export type TranslationCacheRecord = {
  translatedText: string | null;
  translationStatus: Extract<TranslationStatus, "translated" | "unavailable">;
};

export interface TranslationCache {
  getMany(keys: string[]): Promise<Map<string, TranslationCacheRecord>>;
  set(
    key: string,
    value: TranslationCacheRecord,
    ttlSeconds: number,
  ): Promise<void>;
}

type MemoryTranslationCacheEntry = {
  expiresAt: number;
  value: TranslationCacheRecord;
};

class MemoryTranslationCache implements TranslationCache {
  private readonly store = new Map<string, MemoryTranslationCacheEntry>();

  async getMany(keys: string[]) {
    const now = Date.now();
    const results = new Map<string, TranslationCacheRecord>();

    for (const key of keys) {
      const entry = this.store.get(key);

      if (!entry) {
        continue;
      }

      if (entry.expiresAt <= now) {
        this.store.delete(key);
        continue;
      }

      results.set(key, entry.value);
    }

    return results;
  }

  async set(key: string, value: TranslationCacheRecord, ttlSeconds: number) {
    this.store.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value,
    });
  }
}

export const translationCache: TranslationCache = new MemoryTranslationCache();
