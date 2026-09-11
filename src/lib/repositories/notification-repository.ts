import { and, asc, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { notifications, projects, type NewNotificationRecord, type NotificationRecord } from "@/lib/db/schema";
import type { PaginationParams } from "@/lib/query/pagination";

export type CreateNotificationRecordInput = Omit<
  NewNotificationRecord,
  "createdAt" | "id" | "updatedAt"
>;

export type FindManyNotificationsParams = PaginationParams & {
  includeTotal?: boolean;
  unreadOnly?: boolean;
  userId?: string;
};

export type FindManyNotificationsResult = {
  records: NotificationRecord[];
  total: number | null;
};

export interface NotificationRepository {
  create(input: CreateNotificationRecordInput): Promise<NotificationRecord | null>;
  count(options?: { unreadOnly?: boolean; userId?: string }): Promise<number>;
  findManyPaginated(
    params: FindManyNotificationsParams,
  ): Promise<FindManyNotificationsResult>;
  markAllRead(readAt: Date, userId?: string): Promise<number>;
  markRead(id: string, readAt: Date, userId?: string): Promise<NotificationRecord | null>;
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

  async count(options?: { unreadOnly?: boolean; userId?: string }): Promise<number> {
    const conditions: SQL[] = [];

    if (options?.unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    if (options?.userId) {
      conditions.push(eq(projects.userId, options.userId));
      const query = db
        .select({ count: count() })
        .from(notifications)
        .innerJoin(projects, eq(projects.id, notifications.projectId));

      const [result] = await query.where(and(...conditions));
      return Number(result?.count ?? 0);
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

    if (params.userId) {
      conditions.push(eq(projects.userId, params.userId));
      const whereClause = and(...conditions);

      const recordsQuery = db
        .select({
          category: notifications.category,
          createdAt: notifications.createdAt,
          description: notifications.description,
          descriptionKey: notifications.descriptionKey,
          eventKey: notifications.eventKey,
          fileId: notifications.fileId,
          id: notifications.id,
          metadata: notifications.metadata,
          projectId: notifications.projectId,
          readAt: notifications.readAt,
          title: notifications.title,
          titleKey: notifications.titleKey,
          updatedAt: notifications.updatedAt,
        })
        .from(notifications)
        .innerJoin(projects, eq(projects.id, notifications.projectId))
        .where(whereClause)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(params.limit)
        .offset(params.offset);

      if (params.includeTotal === false) {
        const records = await recordsQuery;
        return { records, total: null };
      }

      const totalQuery = db
        .select({ count: count() })
        .from(notifications)
        .innerJoin(projects, eq(projects.id, notifications.projectId))
        .where(whereClause);

      const [records, totalResult] = await Promise.all([
        recordsQuery,
        totalQuery,
      ]);

      return {
        records,
        total: Number(totalResult[0]?.count ?? 0),
      };
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

  async markAllRead(readAt: Date, userId?: string): Promise<number> {
    if (userId) {
      const userProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.userId, userId));

      const projectIds = userProjects.map((p) => p.id);
      if (projectIds.length === 0) {
        return 0;
      }

      const records = await db
        .update(notifications)
        .set({
          readAt,
          updatedAt: readAt,
        })
        .where(
          and(
            isNull(notifications.readAt),
            inArray(notifications.projectId, projectIds),
          ),
        )
        .returning({ id: notifications.id });

      return records.length;
    }

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

  async markRead(id: string, readAt: Date, userId?: string): Promise<NotificationRecord | null> {
    if (userId) {
      const [existing] = await db
        .select({
          notification: notifications,
          projectUserId: projects.userId,
        })
        .from(notifications)
        .leftJoin(projects, eq(projects.id, notifications.projectId))
        .where(eq(notifications.id, id))
        .limit(1);

      if (!existing || (existing.notification.projectId && existing.projectUserId !== userId)) {
        return null;
      }
    }

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
