import { storageService } from "@/lib/services/storage-service";
import crypto from "node:crypto";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  assetShares,
  assetSharePreviewFiles,
  assetShareFiles,
  assetSharePurchases,
  transactions,
  users,
  type AssetShareRecord,
  type AssetSharePreviewFileRecord,
  type AssetShareFileRecord,
  type AssetSharePurchaseRecord,
} from "@/lib/db/schema";
import { creditService } from "@/lib/services/credit-service";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";
import { AppError, NotFoundAppError, ValidationAppError, ForbiddenAppError } from "@/lib/errors/app-error";
import { r2Storage } from "@/lib/storage/r2";


function computeAssetMediaUrl(storageKey?: string | null, storedUrl?: string | null): string | null {
  if (storedUrl) return storedUrl;
  if (!storageKey) return null;
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  return publicBase
    ? `${publicBase.replace(/\/+$/, "")}/${storageKey}`
    : `/api/profile/media?key=${encodeURIComponent(storageKey)}`;
}

export interface CreateAssetShareInput {
  title: string;
  description?: string | null;
  amountCents: number;
  currency: string;
  templateKey?: "minimal-modern" | "neon-cyber" | "clean-studio" | "bold-editorial";
  previewFiles?: Array<{
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    previewUrl?: string | null;
  }>;
}

export interface UpdateAssetShareInput {
  title?: string;
  description?: string | null;
  amountCents?: number;
  templateKey?: "minimal-modern" | "neon-cyber" | "clean-studio" | "bold-editorial";
  status?: "active" | "deactivated";
  previewFiles?: Array<{
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    previewUrl?: string | null;
  }>;
}

export interface ListAssetSharesQuery {
  status?: "all" | "active" | "deactivated";
  search?: string;
  sort?: "newest" | "oldest" | "title-asc" | "amount-desc";
}

export class AssetShareService {
  async listUserAssetShares(userId: string, query?: ListAssetSharesQuery) {
    const conditions = [
      eq(assetShares.userId, userId),
      isNull(assetShares.deletedAt),
    ];

    if (query?.status && query.status !== "all") {
      conditions.push(eq(assetShares.status, query.status));
    }

    if (query?.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(assetShares.title, term),
          ilike(assetShares.description, term)
        )!
      );
    }

    let orderBy = desc(assetShares.createdAt);
    if (query?.sort === "oldest") {
      orderBy = asc(assetShares.createdAt);
    } else if (query?.sort === "title-asc") {
      orderBy = asc(assetShares.title);
    } else if (query?.sort === "amount-desc") {
      orderBy = desc(assetShares.amountCents);
    }

    const items = await db
      .select()
      .from(assetShares)
      .where(and(...conditions))
      .orderBy(orderBy);

    if (items.length === 0) {
      return [];
    }

    const itemIds = items.map((i) => i.id);

    // Fetch previews
    const previews = await db
      .select()
      .from(assetSharePreviewFiles)
      .where(
        and(
          sql`${assetSharePreviewFiles.assetShareId} IN ${itemIds}`,
          isNull(assetSharePreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetSharePreviewFiles.sortOrder));

    // Fetch file counts & total storage
    const fileStats = await db
      .select({
        assetShareId: assetShareFiles.assetShareId,
        count: sql<number>`count(*)::int`,
        totalBytes: sql<number>`coalesce(sum(${assetShareFiles.sizeBytes}), 0)::bigint`,
      })
      .from(assetShareFiles)
      .where(
        and(
          sql`${assetShareFiles.assetShareId} IN ${itemIds}`,
          isNull(assetShareFiles.deletedAt)
        )
      )
      .groupBy(assetShareFiles.assetShareId);

    // Fetch purchases count & total revenue
    const purchaseStats = await db
      .select({
        assetShareId: assetSharePurchases.assetShareId,
        count: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(${assetSharePurchases.amountCents}), 0)::int`,
        latestPaidAt: sql<Date | null>`max(${assetSharePurchases.paidAt})`,
      })
      .from(assetSharePurchases)
      .where(sql`${assetSharePurchases.assetShareId} IN ${itemIds}`)
      .groupBy(assetSharePurchases.assetShareId);

    const previewsByShareId = new Map<string, AssetSharePreviewFileRecord[]>();
    for (const preview of previews) {
      const list = previewsByShareId.get(preview.assetShareId) || [];
      list.push(preview);
      previewsByShareId.set(preview.assetShareId, list);
    }

    const fileStatsMap = new Map<string, { count: number; totalBytes: number }>();
    for (const row of fileStats) {
      fileStatsMap.set(row.assetShareId, { count: row.count, totalBytes: Number(row.totalBytes || 0) });
    }

    const purchaseStatsMap = new Map<string, { count: number; totalRevenue: number; latestPaidAt: Date | null }>();
    for (const row of purchaseStats) {
      purchaseStatsMap.set(row.assetShareId, { count: row.count, totalRevenue: Number(row.totalRevenue || 0), latestPaidAt: row.latestPaidAt });
    }

    return items.map((item) => ({
      ...item,
      previewFiles: (previewsByShareId.get(item.id) || []).map((p) => ({
        ...p,
        previewUrl: computeAssetMediaUrl(p.storageKey, p.previewUrl),
      })),
      filesCount: fileStatsMap.get(item.id)?.count || 0,
      totalSizeBytes: fileStatsMap.get(item.id)?.totalBytes || 0,
      purchasesCount: purchaseStatsMap.get(item.id)?.count || 0,
      totalRevenueCents: purchaseStatsMap.get(item.id)?.totalRevenue || 0,
      latestPaymentDate: purchaseStatsMap.get(item.id)?.latestPaidAt || null,
    }));
  }

  async getAssetShareById(id: string, userId: string) {
    const [record] = await db
      .select()
      .from(assetShares)
      .where(
        and(
          eq(assetShares.id, id),
          eq(assetShares.userId, userId),
          isNull(assetShares.deletedAt)
        )
      )
      .limit(1);

    if (!record) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const previews = await db
      .select()
      .from(assetSharePreviewFiles)
      .where(
        and(
          eq(assetSharePreviewFiles.assetShareId, id),
          isNull(assetSharePreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetSharePreviewFiles.sortOrder));

    const files = await db
      .select()
      .from(assetShareFiles)
      .where(
        and(
          eq(assetShareFiles.assetShareId, id),
          isNull(assetShareFiles.deletedAt)
        )
      )
      .orderBy(desc(assetShareFiles.createdAt));

    const enrichedPreviews = previews.map((p) => ({
      ...p,
      previewUrl: computeAssetMediaUrl(p.storageKey, p.previewUrl),
    }));

    const enrichedFiles = files.map((f) => ({
      ...f,
      previewUrl: computeAssetMediaUrl(f.storageKey),
    }));

    const totalSizeBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

    const [purchaseStat] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(${assetSharePurchases.amountCents}), 0)::int`,
        latestPaidAt: sql<Date | null>`max(${assetSharePurchases.paidAt})`,
      })
      .from(assetSharePurchases)
      .where(eq(assetSharePurchases.assetShareId, id));

    return {
      ...record,
      previewFiles: enrichedPreviews,
      files: enrichedFiles,
      filesCount: files.length,
      totalSizeBytes,
      purchasesCount: purchaseStat?.count || 0,
      totalRevenueCents: Number(purchaseStat?.totalRevenue || 0),
      latestPaymentDate: purchaseStat?.latestPaidAt || null,
    };
  }

  async createAssetShare(userId: string, input: CreateAssetShareInput) {
    const templateKey = input.templateKey || "minimal-modern";
    const isPremiumTemplate = templateKey !== "minimal-modern";

    // If premium template, check and deduct 1 credit
    if (isPremiumTemplate) {
      const { scope } = await creditService.getOrCreateCreditAccountForScope();
      await creditService.calculateAndDeductFeatureCredits({
        idempotencyKey: `asset-share-create-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        featureParams: {
          currency: DEFAULT_PROJECT_CURRENCY,
          featureKey: "testimonial_create",
          templateId: templateKey,
        },
        scope,
        metadata: {
          templateKey,
          title: input.title,
        },
      });
    }

    const shareToken = crypto.randomUUID().replace(/-/g, "");
    const shareExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    const [created] = await db
      .insert(assetShares)
      .values({
        userId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        amountCents: input.amountCents,
        currency: (input.currency || DEFAULT_PROJECT_CURRENCY).toUpperCase(),
        templateKey,
        status: "active",
        shareToken,
        shareExpiresAt,
      })
      .returning();

    if (input.previewFiles && input.previewFiles.length > 0) {
      const previewRows = input.previewFiles.slice(0, 3).map((f, idx) => ({
        assetShareId: created.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageKey: f.storageKey,
        previewUrl: f.previewUrl || null,
        sortOrder: idx,
      }));

      await db.insert(assetSharePreviewFiles).values(previewRows);
    }

    return this.getAssetShareById(created.id, userId);
  }

  async updateAssetShare(id: string, userId: string, input: UpdateAssetShareInput) {
    const existing = await this.getAssetShareById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const updates: Partial<typeof assetShares.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      updates.title = input.title.trim();
    }
    if (input.description !== undefined) {
      updates.description = input.description?.trim() || null;
    }
    if (input.amountCents !== undefined) {
      updates.amountCents = input.amountCents;
    }
    if (input.templateKey !== undefined) {
      updates.templateKey = input.templateKey;
    }
    if (input.status !== undefined) {
      updates.status = input.status;
    }

    const [updated] = await db
      .update(assetShares)
      .set(updates)
      .where(and(eq(assetShares.id, id), eq(assetShares.userId, userId)))
      .returning();

    if (input.previewFiles !== undefined) {
      // Soft-delete removed preview files
      await db
        .update(assetSharePreviewFiles)
        .set({ deletedAt: new Date() })
        .where(eq(assetSharePreviewFiles.assetShareId, id));

      if (input.previewFiles.length > 0) {
        const previewRows = input.previewFiles.slice(0, 3).map((f, idx) => ({
          assetShareId: id,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          storageKey: f.storageKey,
          previewUrl: f.previewUrl || null,
          sortOrder: idx,
        }));
        await db.insert(assetSharePreviewFiles).values(previewRows);
      }
    }

    return this.getAssetShareById(updated.id, userId);
  }

  async deleteAssetShare(id: string, userId: string) {
    const existing = await this.getAssetShareById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const now = new Date();

    await db
      .update(assetShares)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(assetShares.id, id), eq(assetShares.userId, userId)));

    await db
      .update(assetShareFiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(assetShareFiles.assetShareId, id));

    await db
      .update(assetSharePreviewFiles)
      .set({ deletedAt: now })
      .where(eq(assetSharePreviewFiles.assetShareId, id));

    return { success: true, id };
  }

  async uploadStagedDownloadableFile(
    id: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string
  ) {
    const existing = await this.getAssetShareById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "exe") {
      throw new ValidationAppError("Executable (.exe) files are disallowed.");
    }

    const fileId = crypto.randomUUID();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${userId}/asset-shares/${id}/files/${fileId}-${sanitizedName}`;
    const contentType = (mimeType || "application/octet-stream").toLowerCase();

    await r2Storage.uploadFile({
      key: storageKey,
      body: buffer,
      contentType,
    });

    return {
      id: fileId,
      storageKey,
      name: filename.trim(),
      originalName: filename,
      mimeType: contentType,
      extension: ext,
      sizeBytes: buffer.length,
    };
  }

  async cleanupStagedDownloadableFile(id: string, userId: string, storageKey: string) {
    await this.getAssetShareById(id, userId);

    const prefix = `users/${userId}/asset-shares/${id}/files/`;
    if (!storageKey || !storageKey.startsWith(prefix)) {
      throw new ValidationAppError("Invalid storage key for staged file cleanup.");
    }

    try {
      await r2Storage.deleteFile({ key: storageKey });
    } catch (err) {
      console.warn("Error deleting staged R2 file:", err);
    }

    return { success: true };
  }

  async uploadSingleDownloadableFile(
    id: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string
  ) {
    const existing = await this.getAssetShareById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "exe") {
      throw new ValidationAppError("Executable (.exe) files are disallowed.");
    }

    const fileId = crypto.randomUUID();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${userId}/asset-shares/${id}/files/${fileId}-${sanitizedName}`;
    const contentType = (mimeType || "application/octet-stream").toLowerCase();

    await r2Storage.uploadFile({
      key: storageKey,
      body: buffer,
      contentType,
    });

    const [inserted] = await db
      .insert(assetShareFiles)
      .values({
        id: fileId,
        assetShareId: id,
        name: filename.trim(),
        originalName: filename,
        mimeType: contentType,
        extension: ext,
        sizeBytes: buffer.length,
        storageKey,
      })
      .returning();

    return inserted;
  }

  async addDownloadableFiles(
    id: string,
    userId: string,
    filesList: Array<{
      name: string;
      originalName: string;
      mimeType: string;
      extension: string;
      sizeBytes: number;
      storageKey: string;
    }>
  ) {
    const existing = await this.getAssetShareById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset Share not found.");
    }

    const totalBytes = filesList.reduce((sum, f) => sum + f.sizeBytes, 0);

    if (totalBytes > 0) {
      await storageService.assertCanAllocateStorage({
        requiredBytes: totalBytes,
        scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
      });
    }

    const rows = filesList.map((f) => ({
      assetShareId: id,
      name: f.name.trim(),
      originalName: f.originalName,
      mimeType: f.mimeType,
      extension: f.extension.toLowerCase().replace(/^\./, ""),
      sizeBytes: f.sizeBytes,
      storageKey: f.storageKey,
    }));

    const inserted = await db.insert(assetShareFiles).values(rows).returning();

    // Commit storage accounting for each file
    for (const file of inserted) {
      if (file.sizeBytes > 0) {
        try {
          await storageService.commitStorageUsage({
            bytes: file.sizeBytes,
            fileId: file.id,
            idempotencyKey: `asset-share-file:${id}:${file.id}:commit`,
            scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
            metadata: {
              featureReason: "asset_share_file_upload",
            },
          });
        } catch (err) {
          console.warn("Failed to commit storage for asset share file:", err);
        }
      }
    }

    return inserted;
  }

  async deleteDownloadableFile(id: string, fileId: string, userId: string) {
    await this.getAssetShareById(id, userId);

    const [file] = await db
      .select()
      .from(assetShareFiles)
      .where(and(eq(assetShareFiles.id, fileId), eq(assetShareFiles.assetShareId, id)))
      .limit(1);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    const now = new Date();
    await db
      .update(assetShareFiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(assetShareFiles.id, fileId));

    // Release storage accounting
    if (file.sizeBytes > 0) {
      try {
        await storageService.releaseStorageUsage({
          bytes: file.sizeBytes,
          fileId: file.id,
          idempotencyKey: `asset-share-file:${id}:${file.id}:release`,
          scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
          metadata: {
            featureReason: "asset_share_file_delete",
          },
        });
      } catch (err) {
        console.warn("Failed to release storage for asset share file:", err);
      }
    }

    if (file.storageKey) {
      try {
        await r2Storage.deleteFile({ key: file.storageKey });
      } catch (err) {
        console.warn("Error deleting R2 file:", err);
      }
    }

    return { success: true, fileId };
  }

  async getPublicAssetShareState(shareToken: string, buyerEmail?: string | null) {
    const [asset] = await db
      .select()
      .from(assetShares)
      .where(eq(assetShares.shareToken, shareToken))
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset Share link not found.");
    }

    // Check creator info
    const [creator] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, asset.userId))
      .limit(1);

    const creatorName =
      creator?.displayName ||
      (creator?.firstName ? `${creator.firstName} ${creator?.lastName || ""}`.trim() : creator?.email) ||
      "MitFloww Creator";

    // Check if buyer has an active purchase within 24h
    let activePurchase: AssetSharePurchaseRecord | null = null;
    if (buyerEmail && buyerEmail.trim()) {
      const normalizedEmail = buyerEmail.trim().toLowerCase();
      const [purchase] = await db
        .select()
        .from(assetSharePurchases)
        .where(
          and(
            eq(assetSharePurchases.assetShareId, asset.id),
            eq(assetSharePurchases.buyerEmail, normalizedEmail),
            sql`${assetSharePurchases.expiresAt} > NOW()`
          )
        )
        .orderBy(desc(assetSharePurchases.paidAt))
        .limit(1);

      if (purchase) {
        activePurchase = purchase;
      }
    }

    // If active purchase exists, return purchased file delivery state regardless of public link status!
    if (activePurchase) {
      const files = await db
        .select()
        .from(assetShareFiles)
        .where(
          and(
            eq(assetShareFiles.assetShareId, asset.id),
            isNull(assetShareFiles.deletedAt)
          )
        )
        .orderBy(asc(assetShareFiles.name));

      return {
        accessState: "purchased",
        assetShare: {
          id: asset.id,
          title: asset.title,
          description: asset.description,
          amountCents: asset.amountCents,
          currency: asset.currency,
          templateKey: asset.templateKey,
          creatorName,
        },
        purchase: {
          invoiceNumber: activePurchase.invoiceNumber,
          paidAt: activePurchase.paidAt,
          expiresAt: activePurchase.expiresAt,
          buyerEmail: activePurchase.buyerEmail,
        },
        files,
      };
    }

    // If not purchased: check if link was soft-deleted or deactivated or expired
    if (asset.deletedAt) {
      throw new NotFoundAppError("This Asset Share is no longer available.");
    }

    if (asset.status === "deactivated") {
      return {
        accessState: "deactivated",
        assetShare: {
          id: asset.id,
          title: asset.title,
          creatorName,
        },
      };
    }

    // Fetch previews
    const previews = await db
      .select()
      .from(assetSharePreviewFiles)
      .where(
        and(
          eq(assetSharePreviewFiles.assetShareId, asset.id),
          isNull(assetSharePreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetSharePreviewFiles.sortOrder));

    // File count summary
    const [fileCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assetShareFiles)
      .where(
        and(
          eq(assetShareFiles.assetShareId, asset.id),
          isNull(assetShareFiles.deletedAt)
        )
      );

    const enrichedPreviews = previews.map((p) => ({
      ...p,
      previewUrl: computeAssetMediaUrl(p.storageKey, p.previewUrl),
    }));

    return {
      accessState: "public",
      assetShare: {
        id: asset.id,
        title: asset.title,
        description: asset.description,
        amountCents: asset.amountCents,
        currency: asset.currency,
        templateKey: asset.templateKey,
        creatorName,
        filesCount: fileCountResult?.count || 0,
      },
      previewFiles: enrichedPreviews,
    };
  }

  async processPurchase(shareToken: string, buyerEmail: string) {
    const normalizedEmail = buyerEmail.trim().toLowerCase();

    const [asset] = await db
      .select()
      .from(assetShares)
      .where(
        and(
          eq(assetShares.shareToken, shareToken),
          isNull(assetShares.deletedAt),
          eq(assetShares.status, "active")
        )
      )
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset Share is not active or available for purchase.");
    }

    // 10% platform fee commission
    const commissionCents = Math.round(asset.amountCents * 0.1);
    const netAmountCents = Math.max(0, asset.amountCents - commissionCents);
    const invoiceNumber = `AST-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const accessToken = crypto.randomUUID();
    const paidAt = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours access

    // Insert purchase record
    const [purchase] = await db
      .insert(assetSharePurchases)
      .values({
        assetShareId: asset.id,
        buyerEmail: normalizedEmail,
        amountCents: asset.amountCents,
        currency: asset.currency,
        commissionCents,
        netAmountCents,
        invoiceNumber,
        accessToken,
        paidAt,
        expiresAt,
      })
      .returning();

    // Fetch downloadable files
    const files = await db
      .select()
      .from(assetShareFiles)
      .where(
        and(
          eq(assetShareFiles.assetShareId, asset.id),
          isNull(assetShareFiles.deletedAt)
        )
      )
      .orderBy(asc(assetShareFiles.name));

    return {
      success: true,
      accessToken: purchase.accessToken,
      invoiceNumber: purchase.invoiceNumber,
      paidAt: purchase.paidAt,
      expiresAt: purchase.expiresAt,
      buyerEmail: purchase.buyerEmail,
      files,
    };
  }
}

export const assetShareService = new AssetShareService();
