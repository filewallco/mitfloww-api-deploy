import type { CreditPlanKey } from "@/lib/credits";
import type { StorageScopeType } from "@/lib/storage/types";

export type StorageBalanceDTO = {
  actorUserId: string;
  availableStorageBytes: number;
  planKey: CreditPlanKey;
  reservedStorageBytes: number;
  scopeId: string;
  scopeType: StorageScopeType;
  storageLimitBytes: number;
  usedStorageBytes: number;
};
