import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { notifications, type NewNotificationRecord, type NotificationRecord } from "@/lib/db/schema";
import type { PaginationParams } from "@/lib/query/pagination";

export type CreateNotificationRecordInput = Omit<
  NewNotificationRecord,
  "createdAt" | "id" | "updatedAt"
>;

export type FindManyNotificationsParams = PaginationParams & {
  includeTotal?: boolean;
  unreadOnly?: boolean;
};

export type FindManyNotificationsResult = {
  records: NotificationRecord[];
  total: number | null;
};

export interface NotificationRepository {
  create(input: CreateNotificationRecordInput): Promise<NotificationRecord | null>;
  count(options?: { unreadOnly?: boolean }): Promise<number>;
  findManyPaginated(
    params: FindManyNotificationsParams,
  ): Promise<FindManyNotificationsResult>;
  markAllRead(readAt: Date): Promise<number>;
  markRead(id: string, readAt: Date): Promise<NotificationRecord | null>;
}

export class DrizzleNotificationRepository implements NotificationRepository {
  async create(
    input: CreateNotificationRecordInput,
  ): Promise<NotificationRecord | null> {
    const [record] = await db
      .insert(notifications)
      .values(input)
      .onConflictDoNothing({
        target: notifications.eventKey,
      })
      .returning();

    return record ?? null;
  }

  async count(options?: { unreadOnly?: boolean }): Promise<number> {
    const conditions: SQL[] = [];

    if (options?.unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    const query = db
      .select({ count: count() })
      .from(notifications);

    const [result] =
      conditions.length > 0 ? await query.where(and(...conditions)) : await query;

    return Number(result?.count ?? 0);
  }

  async findManyPaginated(
    params: FindManyNotificationsParams,
  ): Promise<FindManyNotificationsResult> {
    const conditions: SQL[] = [];

    if (params.unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const recordsQuery = db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(params.limit)
      .offset(params.offset);

    const recordsPromise = whereClause
      ? recordsQuery.where(whereClause)
      : recordsQuery;

    if (params.includeTotal === false) {
      const records = await recordsPromise;

      return {
        records,
        total: null,
      };
    }

    const totalQuery = db
      .select({ count: count() })
      .from(notifications);

    const [records, totalResult] = await Promise.all([
      recordsPromise,
      whereClause ? totalQuery.where(whereClause) : totalQuery,
    ]);

    return {
      records,
      total: Number(totalResult[0]?.count ?? 0),
    };
  }

  async markAllRead(readAt: Date): Promise<number> {
    const records = await db
      .update(notifications)
      .set({
        readAt,
        updatedAt: readAt,
      })
      .where(isNull(notifications.readAt))
      .returning({ id: notifications.id });

    return records.length;
  }

  async markRead(id: string, readAt: Date): Promise<NotificationRecord | null> {
    const [record] = await db
      .update(notifications)
      .set({
        readAt,
        updatedAt: readAt,
      })
      .where(and(eq(notifications.id, id), isNull(notifications.readAt)))
      .returning();

    if (record) {
      return record;
    }

    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);

    return existing ?? null;
  }
}
