import { storageService } from "@/lib/services/storage-service";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  assets,
  assetPreviewFiles,
  assetFiles,
  assetPurchases,
  users,
  type AssetRecord,
  type AssetPreviewFileRecord,
  type AssetFileRecord,
  type AssetPurchaseRecord,
} from "@/lib/db/schema";
import { creditService } from "@/lib/services/credit-service";
import { DEFAULT_PROJECT_CURRENCY } from "@/lib/constants/currencies";
import { AppError, NotFoundAppError, ValidationAppError } from "@/lib/errors/app-error";
import { r2Storage } from "@/lib/storage/r2";
import { createStoredZip } from "@/lib/utils/zip";

async function readBodyToBytes(body: any): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  if (typeof (body as any)?.getReader === "function") {
    const reader = (body as any).getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }
  return new Uint8Array();
}

function computeAssetMediaUrl(storageKey?: string | null, storedUrl?: string | null): string | null {
  if (storageKey) {
    const publicBase = process.env.R2_PUBLIC_BASE_URL;
    if (publicBase) {
      return `${publicBase.replace(/\/+$/, "")}/${storageKey}`;
    }
    return `/api/profile/media?key=${encodeURIComponent(storageKey)}`;
  }
  if (storedUrl) {
    if (storedUrl.includes("/api/profile/media?key=")) {
      const keyPart = storedUrl.split("/api/profile/media?key=")[1];
      if (keyPart) {
        return `/api/profile/media?key=${keyPart}`;
      }
    }
    return storedUrl;
  }
  return null;
}

export interface CreateAssetInput {
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

export interface UpdateAssetInput {
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

export interface ListAssetsQuery {
  status?: "all" | "active" | "deactivated";
  search?: string;
  sort?: "newest" | "oldest" | "title-asc" | "amount-desc";
}

export class AssetService {
  async listUserAssets(userId: string, query?: ListAssetsQuery) {
    const conditions = [
      eq(assets.userId, userId),
      isNull(assets.deletedAt),
    ];

    if (query?.status && query.status !== "all") {
      conditions.push(eq(assets.status, query.status));
    }

    if (query?.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(assets.title, term),
          ilike(assets.description, term)
        )!
      );
    }

    let orderBy = desc(assets.createdAt);
    if (query?.sort === "oldest") {
      orderBy = asc(assets.createdAt);
    } else if (query?.sort === "title-asc") {
      orderBy = asc(assets.title);
    } else if (query?.sort === "amount-desc") {
      orderBy = desc(assets.amountCents);
    }

    const items = await db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(orderBy);

    if (items.length === 0) {
      return [];
    }

    const itemIds = items.map((i) => i.id);

    // Fetch previews
    const previews = await db
      .select()
      .from(assetPreviewFiles)
      .where(
        and(
          sql`${assetPreviewFiles.assetId} IN ${itemIds}`,
          isNull(assetPreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetPreviewFiles.sortOrder));

    // Fetch file counts & total storage
    const fileStats = await db
      .select({
        assetId: assetFiles.assetId,
        count: sql<number>`count(*)::int`,
        totalBytes: sql<number>`coalesce(sum(${assetFiles.sizeBytes}), 0)::bigint`,
      })
      .from(assetFiles)
      .where(
        and(
          sql`${assetFiles.assetId} IN ${itemIds}`,
          isNull(assetFiles.deletedAt)
        )
      )
      .groupBy(assetFiles.assetId);

    // Fetch purchases count & total revenue
    const purchaseStats = await db
      .select({
        assetId: assetPurchases.assetId,
        count: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(${assetPurchases.amountCents}), 0)::int`,
        latestPaidAt: sql<Date | null>`max(${assetPurchases.paidAt})`,
      })
      .from(assetPurchases)
      .where(sql`${assetPurchases.assetId} IN ${itemIds}`)
      .groupBy(assetPurchases.assetId);

    const previewsByAssetId = new Map<string, AssetPreviewFileRecord[]>();
    for (const preview of previews) {
      const list = previewsByAssetId.get(preview.assetId) || [];
      list.push(preview);
      previewsByAssetId.set(preview.assetId, list);
    }

    const fileStatsMap = new Map<string, { count: number; totalBytes: number }>();
    for (const row of fileStats) {
      fileStatsMap.set(row.assetId, { count: row.count, totalBytes: Number(row.totalBytes || 0) });
    }

    const purchaseStatsMap = new Map<string, { count: number; totalRevenue: number; latestPaidAt: Date | null }>();
    for (const row of purchaseStats) {
      purchaseStatsMap.set(row.assetId, { count: row.count, totalRevenue: Number(row.totalRevenue || 0), latestPaidAt: row.latestPaidAt });
    }

    return items.map((item) => ({
      ...item,
      previewFiles: (previewsByAssetId.get(item.id) || []).map((p) => ({
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

  async getAssetById(id: string, userId: string) {
    const [record] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, id),
          eq(assets.userId, userId),
          isNull(assets.deletedAt)
        )
      )
      .limit(1);

    if (!record) {
      throw new NotFoundAppError("Asset not found.");
    }

    const previews = await db
      .select()
      .from(assetPreviewFiles)
      .where(
        and(
          eq(assetPreviewFiles.assetId, id),
          isNull(assetPreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetPreviewFiles.sortOrder));

    const files = await db
      .select()
      .from(assetFiles)
      .where(
        and(
          eq(assetFiles.assetId, id),
          isNull(assetFiles.deletedAt)
        )
      )
      .orderBy(desc(assetFiles.createdAt));

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
        totalRevenue: sql<number>`coalesce(sum(${assetPurchases.amountCents}), 0)::int`,
        latestPaidAt: sql<Date | null>`max(${assetPurchases.paidAt})`,
      })
      .from(assetPurchases)
      .where(eq(assetPurchases.assetId, id));

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

  async createAsset(userId: string, input: CreateAssetInput) {
    const templateKey = input.templateKey || "minimal-modern";
    const isPremiumTemplate = templateKey !== "minimal-modern";

    // If premium template, check and deduct 1 credit
    if (isPremiumTemplate) {
      const { scope } = await creditService.getOrCreateCreditAccountForScope();
      await creditService.calculateAndDeductFeatureCredits({
        idempotencyKey: `asset-create-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      .insert(assets)
      .values({
        ...(input.id ? { id: input.id } : {}),
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
        assetId: created.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        storageKey: f.storageKey,
        previewUrl: f.previewUrl || null,
        sortOrder: idx,
      }));

      await db.insert(assetPreviewFiles).values(previewRows);
    }

    return this.getAssetById(created.id, userId);
  }

  async updateAsset(id: string, userId: string, input: UpdateAssetInput) {
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const updates: Partial<typeof assets.$inferInsert> = {
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
      .update(assets)
      .set(updates)
      .where(and(eq(assets.id, id), eq(assets.userId, userId)))
      .returning();

    if (input.previewFiles !== undefined) {
      // Soft-delete removed preview files
      await db
        .update(assetPreviewFiles)
        .set({ deletedAt: new Date() })
        .where(eq(assetPreviewFiles.assetId, id));

      if (input.previewFiles.length > 0) {
        const previewRows = input.previewFiles.slice(0, 3).map((f, idx) => ({
          assetId: id,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          storageKey: f.storageKey,
          previewUrl: f.previewUrl || null,
          sortOrder: idx,
        }));
        await db.insert(assetPreviewFiles).values(previewRows);
      }
    }

    return this.getAssetById(updated.id, userId);
  }

  async regenerateShareToken(id: string, userId: string) {
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const shareToken = crypto.randomUUID().replace(/-/g, "");
    const shareExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    await db
      .update(assets)
      .set({
        shareToken,
        shareExpiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(assets.id, id), eq(assets.userId, userId)));

    return this.getAssetById(id, userId);
  }

  async deleteAsset(id: string, userId: string) {
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const now = new Date();

    await db
      .update(assets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(assets.id, id), eq(assets.userId, userId)));

    await db
      .update(assetFiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(assetFiles.assetId, id));

    await db
      .update(assetPreviewFiles)
      .set({ deletedAt: now })
      .where(eq(assetPreviewFiles.assetId, id));

    return { success: true, id };
  }

  async uploadStagedDownloadableFile(
    id: string,
    userId: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string
  ) {
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "exe") {
      throw new ValidationAppError("Executable (.exe) files are disallowed.");
    }

    const fileId = crypto.randomUUID();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${userId}/assets/${id}/files/${fileId}-${sanitizedName}`;
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
    await this.getAssetById(id, userId);

    const prefix = `users/${userId}/assets/${id}/files/`;
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
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "exe") {
      throw new ValidationAppError("Executable (.exe) files are disallowed.");
    }

    const fileId = crypto.randomUUID();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${userId}/assets/${id}/files/${fileId}-${sanitizedName}`;
    const contentType = (mimeType || "application/octet-stream").toLowerCase();

    await r2Storage.uploadFile({
      key: storageKey,
      body: buffer,
      contentType,
    });

    const [inserted] = await db
      .insert(assetFiles)
      .values({
        id: fileId,
        assetId: id,
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
    const existing = await this.getAssetById(id, userId);
    if (!existing) {
      throw new NotFoundAppError("Asset not found.");
    }

    const totalBytes = filesList.reduce((sum, f) => sum + f.sizeBytes, 0);

    if (totalBytes > 0) {
      await storageService.assertCanAllocateStorage({
        requiredBytes: totalBytes,
        scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
      });
    }

    const rows = filesList.map((f) => ({
      assetId: id,
      name: f.name.trim(),
      originalName: f.originalName,
      mimeType: f.mimeType,
      extension: f.extension.toLowerCase().replace(/^\./, ""),
      sizeBytes: f.sizeBytes,
      storageKey: f.storageKey,
    }));

    const inserted = await db.insert(assetFiles).values(rows).returning();

    // Commit storage accounting for each file
    for (const file of inserted) {
      if (file.sizeBytes > 0) {
        try {
          await storageService.commitStorageUsage({
            bytes: file.sizeBytes,
            fileId: file.id,
            idempotencyKey: `asset-file:${id}:${file.id}:commit`,
            scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
            metadata: {
              featureReason: "asset_file_upload",
            },
          });
        } catch (err) {
          console.warn("Failed to commit storage for asset file:", err);
        }
      }
    }

    return inserted;
  }

  async deleteDownloadableFile(id: string, fileId: string, userId: string) {
    await this.getAssetById(id, userId);

    const [file] = await db
      .select()
      .from(assetFiles)
      .where(and(eq(assetFiles.id, fileId), eq(assetFiles.assetId, id)))
      .limit(1);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    const now = new Date();
    await db
      .update(assetFiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(assetFiles.id, fileId));

    // Release storage accounting
    if (file.sizeBytes > 0) {
      try {
        await storageService.releaseStorageUsage({
          bytes: file.sizeBytes,
          fileId: file.id,
          idempotencyKey: `asset-file:${id}:${file.id}:release`,
          scope: { scopeType: "personal", scopeId: userId, actorUserId: userId },
          metadata: {
            featureReason: "asset_file_delete",
          },
        });
      } catch (err) {
        console.warn("Failed to release storage for asset file:", err);
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

  async getPublicAssetState(shareToken: string, buyerEmail?: string | null) {
    const [asset] = await db
      .select()
      .from(assets)
      .where(eq(assets.shareToken, shareToken))
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset link not found.");
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
    let activePurchase: AssetPurchaseRecord | null = null;
    if (buyerEmail && buyerEmail.trim()) {
      const normalizedEmail = buyerEmail.trim().toLowerCase();
      const [purchase] = await db
        .select()
        .from(assetPurchases)
        .where(
          and(
            eq(assetPurchases.assetId, asset.id),
            eq(assetPurchases.buyerEmail, normalizedEmail),
            sql`${assetPurchases.expiresAt} > NOW()`
          )
        )
        .orderBy(desc(assetPurchases.paidAt))
        .limit(1);

      if (purchase) {
        activePurchase = purchase;
      }
    }

    // If active purchase exists, return purchased file delivery state regardless of public link status!
    if (activePurchase) {
      const files = await db
        .select()
        .from(assetFiles)
        .where(
          and(
            eq(assetFiles.assetId, asset.id),
            isNull(assetFiles.deletedAt)
          )
        )
        .orderBy(asc(assetFiles.name));

      const purchasedAssetData = {
        id: asset.id,
        title: asset.title,
        description: asset.description,
        amountCents: asset.amountCents,
        currency: asset.currency,
        templateKey: asset.templateKey,
        creatorName,
      };

      return {
        accessState: "purchased",
        asset: purchasedAssetData,
        assetShare: purchasedAssetData,
        creator: {
          id: asset.userId,
          displayName: creatorName,
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
      throw new NotFoundAppError("This Asset is no longer available.");
    }

    if (asset.status === "deactivated") {
      const deactivatedAssetData = {
        id: asset.id,
        title: asset.title,
        creatorName,
      };

      return {
        accessState: "deactivated",
        asset: deactivatedAssetData,
        assetShare: deactivatedAssetData,
        creator: {
          id: asset.userId,
          displayName: creatorName,
        },
      };
    }

    // Fetch previews
    const previews = await db
      .select()
      .from(assetPreviewFiles)
      .where(
        and(
          eq(assetPreviewFiles.assetId, asset.id),
          isNull(assetPreviewFiles.deletedAt)
        )
      )
      .orderBy(asc(assetPreviewFiles.sortOrder));

    // File count summary
    const [fileCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(assetFiles)
      .where(
        and(
          eq(assetFiles.assetId, asset.id),
          isNull(assetFiles.deletedAt)
        )
      );

    const enrichedPreviews = previews.map((p) => ({
      ...p,
      previewUrl: computeAssetMediaUrl(p.storageKey, p.previewUrl),
    }));

    const publicAssetData = {
      id: asset.id,
      title: asset.title,
      description: asset.description,
      amountCents: asset.amountCents,
      currency: asset.currency,
      templateKey: asset.templateKey,
      creatorName,
      filesCount: fileCountResult?.count || 0,
    };

    return {
      accessState: "public",
      asset: publicAssetData,
      assetShare: publicAssetData,
      creator: {
        id: asset.userId,
        displayName: creatorName,
      },
      previewFiles: enrichedPreviews,
    };
  }

  async processPurchase(shareToken: string, buyerEmail: string) {
    const normalizedEmail = buyerEmail.trim().toLowerCase();

    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.shareToken, shareToken),
          isNull(assets.deletedAt),
          eq(assets.status, "active")
        )
      )
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset is not active or available for purchase.");
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
      .insert(assetPurchases)
      .values({
        assetId: asset.id,
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
      .from(assetFiles)
      .where(
        and(
          eq(assetFiles.assetId, asset.id),
          isNull(assetFiles.deletedAt)
        )
      )
      .orderBy(asc(assetFiles.name));

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
  async getPublicAssetDownloadFile(token: string, fileId: string, buyerEmail?: string | null) {
    const [asset] = await db
      .select()
      .from(assets)
      .where(eq(assets.shareToken, token))
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset link not found.");
    }

    if (buyerEmail && buyerEmail.trim()) {
      const normalizedEmail = buyerEmail.trim().toLowerCase();
      const [purchase] = await db
        .select()
        .from(assetPurchases)
        .where(
          and(
            eq(assetPurchases.assetId, asset.id),
            eq(assetPurchases.buyerEmail, normalizedEmail),
            sql`${assetPurchases.expiresAt} > NOW()`
          )
        )
        .limit(1);

      if (!purchase) {
        throw new AppError("Purchase required to download asset files.", 403, "purchase_required");
      }
    }

    const [file] = await db
      .select()
      .from(assetFiles)
      .where(
        and(
          eq(assetFiles.id, fileId),
          eq(assetFiles.assetId, asset.id),
          isNull(assetFiles.deletedAt)
        )
      )
      .limit(1);

    if (!file) {
      throw new NotFoundAppError("File not found.");
    }

    const storageResult = await r2Storage.getFile({ key: file.storageKey });
    return {
      body: storageResult.body,
      filename: file.originalName || file.name || "file",
      mimeType: file.mimeType || "application/octet-stream",
      contentLength: storageResult.contentLength,
      storageKey: file.storageKey,
    };
  }

  async getPublicAssetZipArchive(token: string, buyerEmail?: string | null, fileIds?: string[]) {
    const [asset] = await db
      .select()
      .from(assets)
      .where(eq(assets.shareToken, token))
      .limit(1);

    if (!asset) {
      throw new NotFoundAppError("Asset link not found.");
    }

    if (buyerEmail && buyerEmail.trim()) {
      const normalizedEmail = buyerEmail.trim().toLowerCase();
      const [purchase] = await db
        .select()
        .from(assetPurchases)
        .where(
          and(
            eq(assetPurchases.assetId, asset.id),
            eq(assetPurchases.buyerEmail, normalizedEmail),
            sql`${assetPurchases.expiresAt} > NOW()`
          )
        )
        .limit(1);

      if (!purchase) {
        throw new AppError("Purchase required to download asset files.", 403, "purchase_required");
      }
    }

    let filesList = await db
      .select()
      .from(assetFiles)
      .where(
        and(
          eq(assetFiles.assetId, asset.id),
          isNull(assetFiles.deletedAt)
        )
      )
      .orderBy(asc(assetFiles.name));

    if (fileIds && fileIds.length > 0) {
      const requestedSet = new Set(fileIds);
      filesList = filesList.filter((f) => requestedSet.has(f.id));
    }

    if (filesList.length === 0) {
      throw new NotFoundAppError("No files found to bundle.");
    }

    const entries = await Promise.all(
      filesList.map(async (f) => {
        const fileData = await r2Storage.getFile({ key: f.storageKey });
        const bytes = await readBodyToBytes(fileData.body);
        const rawName = (f.originalName || f.name || "file").trim();
        let baseName = rawName.replace(/[\/\\]/g, "_").replace(/[<>:"|?*]/g, "_").trim() || "file";
        const ext = f.extension ? `.${f.extension.replace(/^\./, "")}` : "";
        if (ext && !baseName.toLowerCase().endsWith(ext.toLowerCase())) {
          baseName += ext;
        }

        return {
          data: bytes,
          rawFilename: baseName,
        };
      })
    );

    const deduplicatedEntries: Array<{ data: Uint8Array; filename: string }> = [];
    const usedFilenames = new Set<string>();

    for (const entry of entries) {
      let finalName = entry.rawFilename;
      if (usedFilenames.has(finalName.toLowerCase())) {
        const lastDot = finalName.lastIndexOf(".");
        const prefix = lastDot > 0 ? finalName.slice(0, lastDot) : finalName;
        const ext = lastDot > 0 ? finalName.slice(lastDot) : "";
        let counter = 1;
        while (usedFilenames.has(`${prefix} (${counter})${ext}`.toLowerCase())) {
          counter++;
        }
        finalName = `${prefix} (${counter})${ext}`;
      }
      usedFilenames.add(finalName.toLowerCase());
      deduplicatedEntries.push({
        data: entry.data,
        filename: finalName,
      });
    }

    const zipBytes = createStoredZip(deduplicatedEntries);
    const sanitizedTitle = (asset.title || "asset").replace(/[^a-zA-Z0-9_-]/g, "_");
    return {
      body: zipBytes,
      filename: `${sanitizedTitle}-files.zip`,
      totalFiles: deduplicatedEntries.length,
    };
  }
}

export const assetService = new AssetService();
