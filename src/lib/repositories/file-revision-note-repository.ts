import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  FileRevisionCommentStatus,
  RevisionCommentMarkerType,
  fileVersions,
  revisionCommentItems,
  revisionCommentMarkers,
  revisionCommentReplies,
  revisionComments,
  type RevisionCommentItemRecord,
  type RevisionCommentMarkerRecord,
  type RevisionCommentRecord,
  type RevisionCommentReplyRecord,
} from "@/lib/db/schema";

export type FileRevisionNoteWithReplyRecord = {
  comment: RevisionCommentRecord;
  items: RevisionCommentItemRecord[];
  markers: RevisionCommentMarkerRecord[];
  reply: RevisionCommentReplyRecord | null;
  revisionNumber: number | null;
};

export type CreateFileRevisionCommentMarkerRecordInput = {
  heightBp: number;
  pageNumber: number | null;
  widthBp: number;
  xBp: number;
  yBp: number;
};

export type CreateFileRevisionCommentItemRecordInput = {
  body: string;
  markerIndex: number;
  sourceLocale: string;
};

export type CreateFileRevisionCommentRecordInput = {
  body: string;
  createdBy: string | null;
  fileId: string;
  fileVersionId: string;
  items?: CreateFileRevisionCommentItemRecordInput[];
  markers?: CreateFileRevisionCommentMarkerRecordInput[];
  projectId: string;
  sourceLocale: string;
  status?: RevisionCommentRecord["status"];
  updatedAt: Date;
  updatedBy: string | null;
};

export type UpdateFileRevisionCommentRecordInput = Partial<{
  body: string;
  deletedAt: Date | null;
  sourceLocale: string;
  status: RevisionCommentRecord["status"];
  updatedAt: Date;
  updatedBy: string | null;
}>;

export type UpdateFileRevisionCommentItemRecordInput = {
  body: string;
  id: string;
  sourceLocale: string;
};

export type UpdateFileRevisionCommentWithItemsRecordInput = {
  body: string;
  items?: UpdateFileRevisionCommentItemRecordInput[];
  sourceLocale: string;
  updatedAt: Date;
  updatedBy: string | null;
};

export type CreateFileRevisionCommentReplyRecordInput = {
  body: string;
  commentId: string;
  createdAt?: Date;
  sourceLocale: string;
  updatedAt: Date;
};

export type UpdateFileRevisionCommentReplyRecordInput = Partial<{
  body: string;
  sourceLocale: string;
  updatedAt: Date;
}>;

export interface FileRevisionNoteRepository {
  createComment(
    input: CreateFileRevisionCommentRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord>;
  createReply(
    input: CreateFileRevisionCommentReplyRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null>;
  deleteMarker(input: {
    commentId: string;
    markerId: string;
    updatedAt: Date;
  }): Promise<FileRevisionNoteWithReplyRecord | null>;
  deleteReply(commentId: string): Promise<FileRevisionNoteWithReplyRecord | null>;
  findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRevisionNoteWithReplyRecord | null>;
  findManyByFileVersionId(input: {
    fileId: string;
    fileVersionId: string;
  }): Promise<FileRevisionNoteWithReplyRecord[]>;
  resolvePendingByFileVersionId(fileVersionId: string, updatedAt: Date): Promise<void>;
  updateComment(
    id: string,
    input: UpdateFileRevisionCommentRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null>;
  updateCommentWithItems(
    id: string,
    input: UpdateFileRevisionCommentWithItemsRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null>;
  updateItemCompletion(input: {
    commentId: string;
    completed: boolean;
    completedAt: Date | null;
    completedBy: string | null;
    itemId: string;
    updatedAt: Date;
  }): Promise<FileRevisionNoteWithReplyRecord | null>;
  updateReply(
    commentId: string,
    input: UpdateFileRevisionCommentReplyRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null>;
}

type RevisionNoteBaseRow = {
  comment: RevisionCommentRecord;
  reply: RevisionCommentReplyRecord | null;
  revisionNumber: number | null;
};

async function getMarkersByCommentIds(commentIds: string[]) {
  if (commentIds.length === 0) {
    return new Map<string, RevisionCommentMarkerRecord[]>();
  }

  const rows = await db
    .select()
    .from(revisionCommentMarkers)
    .where(
      and(
        inArray(revisionCommentMarkers.commentId, commentIds),
        isNull(revisionCommentMarkers.deletedAt),
      ),
    )
    .orderBy(revisionCommentMarkers.labelNumber, revisionCommentMarkers.createdAt);

  const markersByCommentId = new Map<string, RevisionCommentMarkerRecord[]>();

  for (const marker of rows) {
    const existing = markersByCommentId.get(marker.commentId) ?? [];
    existing.push(marker);
    markersByCommentId.set(marker.commentId, existing);
  }

  return markersByCommentId;
}

async function getItemsByCommentIds(commentIds: string[]) {
  if (commentIds.length === 0) {
    return new Map<string, RevisionCommentItemRecord[]>();
  }

  const rows = await db
    .select()
    .from(revisionCommentItems)
    .where(
      and(
        inArray(revisionCommentItems.commentId, commentIds),
        isNull(revisionCommentItems.deletedAt),
      ),
    )
    .orderBy(revisionCommentItems.labelNumber, revisionCommentItems.createdAt);

  const itemsByCommentId = new Map<string, RevisionCommentItemRecord[]>();

  for (const item of rows) {
    const existing = itemsByCommentId.get(item.commentId) ?? [];
    existing.push(item);
    itemsByCommentId.set(item.commentId, existing);
  }

  return itemsByCommentId;
}

async function withChildren(rows: RevisionNoteBaseRow[]) {
  const commentIds = rows.map((row) => row.comment.id);
  const [markersByCommentId, itemsByCommentId] = await Promise.all([
    getMarkersByCommentIds(commentIds),
    getItemsByCommentIds(commentIds),
  ]);

  return rows.map((row) => ({
    comment: row.comment,
    items: itemsByCommentId.get(row.comment.id) ?? [],
    markers: markersByCommentId.get(row.comment.id) ?? [],
    reply: row.reply,
    revisionNumber: row.revisionNumber,
  })) satisfies FileRevisionNoteWithReplyRecord[];
}

async function mapRevisionNoteRecord(row: RevisionNoteBaseRow | undefined) {
  if (!row) {
    return null;
  }

  const [record] = await withChildren([row]);

  return record ?? null;
}

export class DrizzleFileRevisionNoteRepository
  implements FileRevisionNoteRepository
{
  async findById(
    id: string,
    options?: { includeDeleted?: boolean },
  ): Promise<FileRevisionNoteWithReplyRecord | null> {
    const [row] = await db
      .select({
        comment: revisionComments,
        reply: revisionCommentReplies,
        revisionNumber: fileVersions.revisionNumber,
      })
      .from(revisionComments)
      .innerJoin(
        fileVersions,
        eq(revisionComments.fileVersionId, fileVersions.id),
      )
      .leftJoin(
        revisionCommentReplies,
        eq(revisionCommentReplies.commentId, revisionComments.id),
      )
      .where(
        options?.includeDeleted
          ? eq(revisionComments.id, id)
          : and(eq(revisionComments.id, id), isNull(revisionComments.deletedAt)),
      )
      .limit(1);

    return mapRevisionNoteRecord(row);
  }

  async findManyByFileVersionId(input: {
    fileId: string;
    fileVersionId: string;
  }): Promise<FileRevisionNoteWithReplyRecord[]> {
    const rows = await db
      .select({
        comment: revisionComments,
        reply: revisionCommentReplies,
        revisionNumber: fileVersions.revisionNumber,
      })
      .from(revisionComments)
      .innerJoin(
        fileVersions,
        eq(revisionComments.fileVersionId, fileVersions.id),
      )
      .leftJoin(
        revisionCommentReplies,
        eq(revisionCommentReplies.commentId, revisionComments.id),
      )
      .where(
        and(
          eq(revisionComments.fileId, input.fileId),
          eq(revisionComments.fileVersionId, input.fileVersionId),
          isNull(revisionComments.deletedAt),
        ),
      )
      .orderBy(desc(revisionComments.createdAt), desc(revisionComments.id));

    return withChildren(rows);
  }

  async createComment(
    input: CreateFileRevisionCommentRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord> {
    const record = await db.transaction(async (tx) => {
      const [comment] = await tx
        .insert(revisionComments)
        .values({
          body: input.body,
          createdBy: input.createdBy,
          fileId: input.fileId,
          fileVersionId: input.fileVersionId,
          projectId: input.projectId,
          sourceLocale: input.sourceLocale,
          status: input.status ?? FileRevisionCommentStatus.Pending,
          updatedAt: input.updatedAt,
          updatedBy: input.updatedBy,
        })
        .returning();

      if (!comment) {
        throw new Error("Failed to create revision comment.");
      }

      const markers = input.markers ?? [];
      let insertedMarkers: RevisionCommentMarkerRecord[] = [];

      if (markers.length > 0) {
        const [maxRow] = await tx
          .select({
            maxLabelNumber: sql<number>`cast(coalesce(max(${revisionCommentMarkers.labelNumber}), 0) as int)`,
          })
          .from(revisionCommentMarkers)
          .where(
            and(
              eq(revisionCommentMarkers.fileVersionId, input.fileVersionId),
              isNull(revisionCommentMarkers.deletedAt),
            ),
          );
        const startLabelNumber = Number(maxRow?.maxLabelNumber ?? 0) + 1;

        insertedMarkers = await tx
          .insert(revisionCommentMarkers)
          .values(
            markers.map((marker, index) => ({
              commentId: comment.id,
              fileId: input.fileId,
              fileVersionId: input.fileVersionId,
              heightBp: marker.heightBp,
              labelNumber: startLabelNumber + index,
              pageNumber: marker.pageNumber,
              projectId: input.projectId,
              type: RevisionCommentMarkerType.Region,
              updatedAt: input.updatedAt,
              widthBp: marker.widthBp,
              xBp: marker.xBp,
              yBp: marker.yBp,
            })),
          )
          .returning();
      }

      const items = input.items ?? [];

      if (items.length > 0) {
        const itemValues = items
          .map((item) => {
            const marker = insertedMarkers[item.markerIndex];

            if (!marker) {
              return null;
            }

            return {
              body: item.body,
              commentId: comment.id,
              fileId: input.fileId,
              fileVersionId: input.fileVersionId,
              labelNumber: marker.labelNumber,
              markerId: marker.id,
              projectId: input.projectId,
              sourceLocale: item.sourceLocale,
              updatedAt: input.updatedAt,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (itemValues.length > 0) {
          await tx.insert(revisionCommentItems).values(itemValues);
        }
      }

      return comment;
    });

    const nextRecord = await this.findById(record.id);

    if (!nextRecord) {
      throw new Error("Failed to load created revision comment.");
    }

    return nextRecord;
  }

  async updateComment(
    id: string,
    input: UpdateFileRevisionCommentRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null> {
    const [record] = await db
      .update(revisionComments)
      .set(input)
      .where(and(eq(revisionComments.id, id), isNull(revisionComments.deletedAt)))
      .returning();

    if (!record) {
      return null;
    }

    return this.findById(record.id, {
      includeDeleted: record.deletedAt != null,
    });
  }

  async updateCommentWithItems(
    id: string,
    input: UpdateFileRevisionCommentWithItemsRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null> {
    const updatedAt = input.updatedAt;
    const recordId = await db.transaction(async (tx) => {
      const [comment] = await tx
        .update(revisionComments)
        .set({
          body: input.body,
          sourceLocale: input.sourceLocale,
          updatedAt,
          updatedBy: input.updatedBy,
        })
        .where(and(eq(revisionComments.id, id), isNull(revisionComments.deletedAt)))
        .returning();

      if (!comment) {
        return null;
      }

      if (input.items) {
        const activeItems = await tx
          .select({
            id: revisionCommentItems.id,
            markerId: revisionCommentItems.markerId,
          })
          .from(revisionCommentItems)
          .where(
            and(
              eq(revisionCommentItems.commentId, id),
              isNull(revisionCommentItems.deletedAt),
            ),
          );
        const activeItemIds = new Set(activeItems.map((item) => item.id));
        const keptItemIds = new Set(
          input.items
            .filter((item) => activeItemIds.has(item.id))
            .map((item) => item.id),
        );
        const removedItems = activeItems.filter((item) => !keptItemIds.has(item.id));
        const removedItemIds = removedItems.map((item) => item.id);
        const removedMarkerIds = removedItems.map((item) => item.markerId);

        if (removedItemIds.length > 0) {
          await tx
            .update(revisionCommentItems)
            .set({
              deletedAt: updatedAt,
              updatedAt,
            })
            .where(
              and(
                eq(revisionCommentItems.commentId, id),
                inArray(revisionCommentItems.id, removedItemIds),
                isNull(revisionCommentItems.deletedAt),
              ),
            );
        }

        if (removedMarkerIds.length > 0) {
          await tx
            .update(revisionCommentMarkers)
            .set({
              deletedAt: updatedAt,
              updatedAt,
            })
            .where(
              and(
                eq(revisionCommentMarkers.commentId, id),
                inArray(revisionCommentMarkers.id, removedMarkerIds),
                isNull(revisionCommentMarkers.deletedAt),
              ),
            );
        }

        if (input.items.length > 0) {
          const updatePromises = input.items.map(async (item) => {
            if (!activeItemIds.has(item.id)) {
              return null;
            }

            return tx
              .update(revisionCommentItems)
              .set({
                body: item.body,
                sourceLocale: item.sourceLocale,
                updatedAt,
              })
              .where(
                and(
                  eq(revisionCommentItems.id, item.id),
                  eq(revisionCommentItems.commentId, id),
                  isNull(revisionCommentItems.deletedAt),
                ),
              )
              .returning();
          });
          
          await Promise.all(updatePromises);
        }

        if ((input.body ?? comment.body).trim().length === 0) {
          const [remainingItem] = await tx
            .select({ id: revisionCommentItems.id })
            .from(revisionCommentItems)
            .where(
              and(
                eq(revisionCommentItems.commentId, id),
                isNull(revisionCommentItems.deletedAt),
              ),
            )
            .limit(1);

          if (!remainingItem) {
            await tx
              .update(revisionComments)
              .set({
                deletedAt: updatedAt,
                updatedAt,
              })
              .where(eq(revisionComments.id, id));
          }
        }
      }

      return comment.id;
    });

    if (!recordId) {
      return null;
    }

    return this.findById(recordId, { includeDeleted: true });
  }

  async deleteMarker(input: {
    commentId: string;
    markerId: string;
    updatedAt: Date;
  }): Promise<FileRevisionNoteWithReplyRecord | null> {
    await db.transaction(async (tx) => {
      await tx
        .update(revisionCommentMarkers)
        .set({
          deletedAt: input.updatedAt,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(revisionCommentMarkers.id, input.markerId),
            eq(revisionCommentMarkers.commentId, input.commentId),
            isNull(revisionCommentMarkers.deletedAt),
          ),
        );

      await tx
        .update(revisionCommentItems)
        .set({
          deletedAt: input.updatedAt,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(revisionCommentItems.markerId, input.markerId),
            eq(revisionCommentItems.commentId, input.commentId),
            isNull(revisionCommentItems.deletedAt),
          ),
        );

      const [comment] = await tx
        .select()
        .from(revisionComments)
        .where(eq(revisionComments.id, input.commentId))
        .limit(1);

      if (!comment || comment.body.trim().length > 0) {
        return;
      }

      const [remainingMarker] = await tx
        .select({ id: revisionCommentMarkers.id })
        .from(revisionCommentMarkers)
        .where(
          and(
            eq(revisionCommentMarkers.commentId, input.commentId),
            isNull(revisionCommentMarkers.deletedAt),
          ),
        )
        .limit(1);

      const [remainingItem] = await tx
        .select({ id: revisionCommentItems.id })
        .from(revisionCommentItems)
        .where(
          and(
            eq(revisionCommentItems.commentId, input.commentId),
            isNull(revisionCommentItems.deletedAt),
          ),
        )
        .limit(1);

      if (!remainingMarker && !remainingItem) {
        await tx
          .update(revisionComments)
          .set({
            deletedAt: input.updatedAt,
            updatedAt: input.updatedAt,
          })
          .where(eq(revisionComments.id, input.commentId));
      }
    });

    return this.findById(input.commentId, { includeDeleted: true });
  }

  async updateItemCompletion(input: {
    commentId: string;
    completed: boolean;
    completedAt: Date | null;
    completedBy: string | null;
    itemId: string;
    updatedAt: Date;
  }): Promise<FileRevisionNoteWithReplyRecord | null> {
    const [record] = await db
      .update(revisionCommentItems)
      .set({
        completed: input.completed,
        completedAt: input.completedAt,
        completedBy: input.completedBy,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(revisionCommentItems.id, input.itemId),
          eq(revisionCommentItems.commentId, input.commentId),
          isNull(revisionCommentItems.deletedAt),
        ),
      )
      .returning();

    if (!record) {
      return null;
    }

    return this.findById(input.commentId);
  }

  async createReply(
    input: CreateFileRevisionCommentReplyRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null> {
    const [record] = await db
      .insert(revisionCommentReplies)
      .values({
        body: input.body,
        commentId: input.commentId,
        createdAt: input.createdAt ?? input.updatedAt,
        sourceLocale: input.sourceLocale,
        updatedAt: input.updatedAt,
      })
      .returning();

    if (!record) {
      return null;
    }

    return this.findById(input.commentId);
  }

  async updateReply(
    commentId: string,
    input: UpdateFileRevisionCommentReplyRecordInput,
  ): Promise<FileRevisionNoteWithReplyRecord | null> {
    const [record] = await db
      .update(revisionCommentReplies)
      .set(input)
      .where(eq(revisionCommentReplies.commentId, commentId))
      .returning();

    if (!record) {
      return null;
    }

    return this.findById(commentId);
  }

  async deleteReply(commentId: string): Promise<FileRevisionNoteWithReplyRecord | null> {
    await db
      .delete(revisionCommentReplies)
      .where(eq(revisionCommentReplies.commentId, commentId));

    return this.findById(commentId);
  }

  async resolvePendingByFileVersionId(
    fileVersionId: string,
    updatedAt: Date,
  ): Promise<void> {
    await db
      .update(revisionComments)
      .set({
        status: FileRevisionCommentStatus.Resolved,
        updatedAt,
      })
      .where(
        and(
          eq(revisionComments.fileVersionId, fileVersionId),
          eq(revisionComments.status, FileRevisionCommentStatus.Pending),
          isNull(revisionComments.deletedAt),
        ),
      );
  }
}