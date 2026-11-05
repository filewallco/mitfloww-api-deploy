import { gatewayConfigService } from "./gateway-config-service";
import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import {
  paymentTransactions,
  paymentRefunds,
  paymentOutboxEvents,
  projects,
  assets,
  assetPurchases,
  users,
  fileVersions,
  files,
  projectUnlockedFileVersions,
  type PaymentTransactionRecord,
} from "@/lib/db/schema";
import { AppError, NotFoundAppError } from "@/lib/errors/app-error";
import { feeCalculator, type FeeCalculationResult } from "./fee-calculator";
import { gatewayResolver } from "./gateway-resolver";
import { paymentLogger } from "@/lib/logger/payment-logger";
import { paymentOutboxWorker } from "./payment-outbox-worker";
import { transactionService } from "@/lib/services/transaction-service";
import { ensureProjectInvoiceNumber } from "@/lib/services/invoice-service";
import { DrizzleFileRepository } from "@/lib/repositories/file-repository";
import { ProjectPaymentStatus } from "@/lib/dto/projects";
import { CREDIT_PACK_KEYS, getCreditPack } from "@/lib/credits";
import { creditService } from "@/lib/services/credit-service";
import { storageService } from "@/lib/services/storage-service";
import { userService } from "@/lib/services/user-service";
import { eq, and, desc, isNull } from "drizzle-orm";

export interface AuthoritativePriceResult {
  originalAmount: number; // in minor units (cents / paise)
  currency: string;
  referenceType: string;
  referenceId: string;
  userId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  description: string;
  receipt: string;
}

export class PaymentService {
  async resolveAuthoritativePrice(params: {
    referenceType: string;
    referenceId: string;
    actorUserId?: string | null;
    shareToken?: string | null;
  }): Promise<AuthoritativePriceResult> {
    const { referenceType, referenceId, actorUserId, shareToken } = params;

    switch (referenceType) {
      case "project_final": {
        const lookup = shareToken
          ? eq(projects.shareToken, shareToken)
          : eq(projects.id, referenceId);

        const [project] = await db
          .select()
          .from(projects)
          .where(lookup)
          .limit(1);

        if (!project) {
          throw new NotFoundAppError("Project not found.");
        }

        const fileRepo = new DrizzleFileRepository();
        let totalRevisions = 0;
        try {
          totalRevisions = await fileRepo.countProjectAddedRevisions(project.id);
        } catch {}

        const revisionLimit = project.revisionLimit ?? 0;
        const extraRevisionCount = Math.max(0, totalRevisions - revisionLimit);
        const extraRevisionCostCents = project.extraRevisionCostCents ?? 0;
        const extraRevisionAmountCents = extraRevisionCount * extraRevisionCostCents;

        const baseAmountCents = Number(project.amountCents) || 0;
        const subtotalCents = baseAmountCents + extraRevisionAmountCents;

        const hasPaidAdvance =
          project.advancePaymentEnabled &&
          project.advancePaymentStatus === ProjectPaymentStatus.Paid &&
          Number(project.advanceAmountCents) > 0;

        const advanceAmountCents = hasPaidAdvance
          ? Number(project.advanceAmountCents)
          : 0;

        const remainingCents = Math.max(0, subtotalCents - advanceAmountCents);
        const finalPayableCents = hasPaidAdvance ? remainingCents : subtotalCents;

        const baseInvoice = await ensureProjectInvoiceNumber(project.id);

        return {
          originalAmount: finalPayableCents,
          currency: project.currency || "INR",
          referenceType: "project_final",
          referenceId: project.id,
          userId: project.userId,
          customerName: project.clientName || "Valued Client",
          customerEmail: project.clientEmail || project.shareClientEmail || null,
          description: `Deliverables unlock for ${project.title || "Project"}`,
          receipt: `rcpt_${baseInvoice}`.slice(0, 40),
        };
      }

      case "project_advance": {
        const lookup = shareToken
          ? eq(projects.shareToken, shareToken)
          : eq(projects.id, referenceId);

        const [project] = await db
          .select()
          .from(projects)
          .where(lookup)
          .limit(1);

        if (!project) {
          throw new NotFoundAppError("Project not found.");
        }

        if (!project.advancePaymentEnabled) {
          throw new AppError("Advance payment is not enabled for this project.", 400, "advance_disabled");
        }

        if (project.advancePaymentStatus === ProjectPaymentStatus.Paid) {
          throw new AppError("Advance payment is already completed for this project.", 400, "advance_already_paid");
        }

        const advanceAmountCents = Number(project.advanceAmountCents) || 0;
        if (advanceAmountCents <= 0) {
          throw new AppError("Advance amount must be greater than zero.", 400, "invalid_advance_amount");
        }

        const baseInvoice = await ensureProjectInvoiceNumber(project.id);

        return {
          originalAmount: advanceAmountCents,
          currency: project.currency || "INR",
          referenceType: "project_advance",
          referenceId: project.id,
          userId: project.userId,
          customerName: project.clientName || "Valued Client",
          customerEmail: project.clientEmail || project.shareClientEmail || null,
          description: `Advance payment for ${project.title || "Project"}`,
          receipt: `adv_${baseInvoice}`.slice(0, 40),
        };
      }

      case "asset_purchase": {
        const [asset] = await db
          .select()
          .from(assets)
          .where(
            and(
              shareToken ? eq(assets.shareToken, shareToken) : eq(assets.id, referenceId),
              isNull(assets.deletedAt),
            ),
          )
          .limit(1);

        if (!asset || !asset.publishedAt) {
          throw new NotFoundAppError("Digital asset not found or not published.");
        }

        const assetPrice = Number(asset.amountCents) || 0;
        if (assetPrice <= 0) {
          throw new AppError("Asset price must be greater than zero.", 400, "invalid_asset_price");
        }

        const assetReceipt = `ast_${asset.id.slice(0, 8)}_${Date.now().toString(36)}`;

        return {
          originalAmount: assetPrice,
          currency: asset.currency || "INR",
          referenceType: "asset_purchase",
          referenceId: asset.id,
          userId: asset.userId,
          customerName: null,
          customerEmail: null,
          description: `Purchase digital asset: ${asset.title}`,
          receipt: assetReceipt.slice(0, 40),
        };
      }

      case "credit_pack": {
        if (!actorUserId) {
          throw new AppError("Authentication required to purchase credit packs.", 401, "unauthorized");
        }

        if (!CREDIT_PACK_KEYS.includes(referenceId as any)) {
          throw new AppError("Invalid credit pack key.", 400, "invalid_pack");
        }

        const pack = getCreditPack(referenceId as any);

        return {
          originalAmount: pack.priceInrMinorUnits,
          currency: "INR",
          referenceType: "credit_pack",
          referenceId,
          userId: actorUserId,
          description: `Purchase ${pack.credits} Credits Top-up`,
          receipt: `crd_${referenceId}_${Date.now().toString(36)}`.slice(0, 40),
        };
      }

      case "storage_addon": {
        if (!actorUserId) {
          throw new AppError("Authentication required to purchase storage add-on.", 401, "unauthorized");
        }

        // Storage add-ons cost defined in credits or monetary equivalent
        // Standard 100GB add-on: 499 INR minor units (49900 paise)
        return {
          originalAmount: 49900,
          currency: "INR",
          referenceType: "storage_addon",
          referenceId,
          userId: actorUserId,
          description: `Purchase Storage Add-on: ${referenceId}`,
          receipt: `str_${referenceId}_${Date.now().toString(36)}`.slice(0, 40),
        };
      }

      case "plan_upgrade": {
        if (!actorUserId) {
          throw new AppError("Authentication required to upgrade plan.", 401, "unauthorized");
        }

        // Plan monthly price mapping in INR minor units
        let planPrice = 99900; // Pro: 999 INR
        if (referenceId === "agency") planPrice = 249900; // Agency: 2499 INR
        if (referenceId === "starter") planPrice = 49900; // Starter: 499 INR

        return {
          originalAmount: planPrice,
          currency: "INR",
          referenceType: "plan_upgrade",
          referenceId,
          userId: actorUserId,
          description: `Upgrade Plan to ${referenceId}`,
          receipt: `pln_${referenceId}_${Date.now().toString(36)}`.slice(0, 40),
        };
      }

      default:
        throw new AppError(`Unknown referenceType: ${referenceType}`, 400, "invalid_reference_type");
    }
  }

  async getFeePreview(params: {
    referenceType: string;
    referenceId: string;
    actorUserId?: string | null;
    shareToken?: string | null;
    preferredProvider?: string;
  }): Promise<FeeCalculationResult & { productDescription: string }> {
    const authoritative = await this.resolveAuthoritativePrice(params);
    const provider = gatewayResolver.resolveProvider({
      currency: authoritative.currency,
      preferredProvider: params.preferredProvider,
    });

    const feeConfig = await gatewayConfigService.getProviderFeeConfig(provider);
    const feeBreakdown = feeCalculator.calculate({
      originalAmount: authoritative.originalAmount,
      currency: authoritative.currency,
      provider,
      customConfig: feeConfig,
    });

    return {
      ...feeBreakdown,
      productDescription: authoritative.description,
    };
  }

  async createOrder(params: {
    referenceType: string;
    referenceId: string;
    actorUserId?: string | null;
    shareToken?: string | null;
    preferredProvider?: string;
    idempotencyKey?: string | null;
    customer?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    description?: string;
    themeColor?: string | null;
  }) {
    const authoritative = await this.resolveAuthoritativePrice(params);
    const provider = gatewayResolver.resolveProvider({
      currency: authoritative.currency,
      preferredProvider: params.preferredProvider,
    });
    const adapter = gatewayResolver.getAdapter(provider);

    const feeConfig = await gatewayConfigService.getProviderFeeConfig(provider);
    const feeSnapshot = feeCalculator.calculate({
      originalAmount: authoritative.originalAmount,
      currency: authoritative.currency,
      provider,
      customConfig: feeConfig,
    });

    const idempotencyKey =
      params.idempotencyKey ||
      `pay_${authoritative.referenceType}_${authoritative.referenceId}_${crypto.randomUUID()}`;

    // Idempotency check: see if a transaction already exists for this idempotency key
    const [existing] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing && existing.orderId) {
      // Re-use active existing order
      const checkoutPayload = {
        keyId: adapter.providerName === "razorpay" ? (adapter as any).getCredentials?.()?.keyId || "" : "",
        orderId: existing.orderId,
        amount: existing.amount,
        currency: existing.currency,
        name: "MitFloww",
        description: params.description || authoritative.description,
        notes: {
          paymentTransactionId: existing.id,
          referenceType: existing.referenceType,
          referenceId: existing.referenceId,
        },
        prefill: {
          name: params.customer?.name || existing.customerName || undefined,
          email: params.customer?.email || existing.customerEmail || undefined,
          contact: params.customer?.contact || existing.customerContact || undefined,
        },
        themeColor: params.themeColor || "#2563EB",
      };

      await paymentLogger.info("payment.order_reused", {
        paymentTransactionId: existing.id,
        provider,
        providerOrderId: existing.orderId,
        referenceType: existing.referenceType,
        referenceId: existing.referenceId,
        data: { idempotencyKey },
      });

      return {
        transaction: existing,
        checkout: checkoutPayload,
        feeSnapshot,
      };
    }

    const customerEmail =
      params.customer?.email || authoritative.customerEmail || null;
    const customerName =
      params.customer?.name || authoritative.customerName || null;
    const customerContact = params.customer?.contact || null;

    // 1. Insert record in mitfloww.payment_transactions with status 'pending'
    const [transaction] = await db
      .insert(paymentTransactions)
      .values({
        idempotencyKey,
        provider,
        status: "pending",
        currency: authoritative.currency,
        originalAmount: feeSnapshot.originalAmount,
        feePercentage: feeSnapshot.feePercentage.toFixed(4),
        fixedFee: feeSnapshot.fixedFee,
        taxRate: feeSnapshot.taxRate.toFixed(4),
        feeAmount: feeSnapshot.feeAmount,
        taxAmount: feeSnapshot.taxAmount,
        totalPayable: feeSnapshot.totalPayable,
        amount: feeSnapshot.totalPayable,
        feeAbsorbedByMerchant: feeSnapshot.feeAbsorbedByMerchant,
        feeConfigVersion: feeSnapshot.feeConfigVersion,
        referenceType: authoritative.referenceType,
        referenceId: authoritative.referenceId,
        userId: authoritative.userId || params.actorUserId || null,
        customerName,
        customerEmail,
        customerContact,
        receipt: authoritative.receipt,
        metadata: {
          description: authoritative.description,
          feeSnapshot,
        },
      })
      .returning();

    // 2. Call gateway adapter to create provider order
    let providerOrder: any = null;
    try {
      providerOrder = await adapter.createOrder({
        amount: feeSnapshot.totalPayable,
        currency: feeSnapshot.currency,
        receipt: authoritative.receipt,
        notes: {
          paymentTransactionId: transaction.id,
          referenceType: authoritative.referenceType,
          referenceId: authoritative.referenceId,
        },
        customer: {
          name: customerName || undefined,
          email: customerEmail || undefined,
          contact: customerContact || undefined,
        },
        idempotencyKey,
        description: params.description || authoritative.description,
        themeColor: params.themeColor,
      });
    } catch (err: any) {
      await db
        .update(paymentTransactions)
        .set({
          status: "failed",
          failureCode: "order_creation_failed",
          failureReason: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, transaction.id));

      await paymentLogger.error("payment.order_creation_failed", {
        paymentTransactionId: transaction.id,
        provider,
        referenceType: authoritative.referenceType,
        referenceId: authoritative.referenceId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }

    // 3. Update payment_transactions with provider orderId and status 'created'
    const [updated] = await db
      .update(paymentTransactions)
      .set({
        orderId: providerOrder.orderId,
        status: "created",
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, transaction.id))
      .returning();

    await paymentLogger.info("payment.order_created", {
      paymentTransactionId: updated.id,
      provider,
      providerOrderId: providerOrder.orderId,
      referenceType: authoritative.referenceType,
      referenceId: authoritative.referenceId,
      previousStatus: "pending",
      newStatus: "created",
      data: {
        originalAmount: feeSnapshot.originalAmount,
        totalPayable: feeSnapshot.totalPayable,
        feeAmount: feeSnapshot.feeAmount,
        taxAmount: feeSnapshot.taxAmount,
      },
    });

    return {
      transaction: updated,
      checkout: providerOrder.checkoutPayload,
      feeSnapshot,
    };
  }

  async verifyPayment(params: {
    orderId: string;
    paymentId: string;
    signature?: string;
  }) {
    const [transaction] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, params.orderId))
      .limit(1);

    if (!transaction) {
      throw new NotFoundAppError(`Payment transaction with order ID ${params.orderId} not found.`);
    }

    const adapter = gatewayResolver.getAdapter(transaction.provider as any);

    // Call adapter for cryptographic signature and direct server status check
    const verification = await adapter.verifyPayment({
      orderId: params.orderId,
      paymentId: params.paymentId,
      signature: params.signature,
    });

    if (!verification.verified || verification.status !== "captured") {
      await paymentLogger.warn("payment.verification_not_captured", {
        paymentTransactionId: transaction.id,
        provider: transaction.provider,
        providerOrderId: params.orderId,
        providerPaymentId: params.paymentId,
        data: { verificationStatus: verification.status },
      });

      return {
        verified: false,
        status: verification.status,
        transaction,
      };
    }

    // Atomically finalize transaction and grant entitlements in a single DB transaction
    const finalized = await this.finalizeCapturedPayment({
      paymentTransactionId: transaction.id,
      paymentId: params.paymentId,
      provider: transaction.provider,
    });

    return {
      verified: true,
      status: "captured",
      transaction: finalized,
    };
  }

  async finalizeCapturedPayment(params: {
    paymentTransactionId: string;
    paymentId: string;
    provider: string;
  }): Promise<PaymentTransactionRecord> {
    const { paymentTransactionId, paymentId } = params;

    const result = await db.transaction(async (tx) => {
      // 1. Lock payment transaction row (SELECT ... FOR UPDATE) to eliminate race conditions
      const [payTx] = await tx
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.id, paymentTransactionId))
        .for("update");

      if (!payTx) {
        throw new NotFoundAppError("Payment transaction record not found.");
      }

      // Idempotency: If already captured and entitlement granted, exit cleanly
      if (payTx.status === "captured" && payTx.entitlementGranted) {
        return payTx;
      }

      // 2. Mark payment transaction as captured
      const [updatedPayTx] = await tx
        .update(paymentTransactions)
        .set({
          status: "captured",
          paymentId,
          capturedAt: payTx.capturedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, payTx.id))
        .returning();

      // 3. Execute authoritative domain entitlements based on referenceType
      switch (payTx.referenceType) {
        case "project_final": {
          const [project] = await tx
            .select()
            .from(projects)
            .where(eq(projects.id, payTx.referenceId))
            .limit(1);

          if (project) {
            const completedAt = new Date();
            const invoiceNumber = await ensureProjectInvoiceNumber(project.id);

            // Update project payment status
            await tx
              .update(projects)
              .set({
                paymentStatus: ProjectPaymentStatus.Paid,
                clientPaymentCompletedAt: completedAt,
                clientPaymentReference: invoiceNumber,
                updatedAt: new Date(),
              })
              .where(eq(projects.id, project.id));

            // Record authoritative creator earnings in mitfloww.transactions
            await transactionService.recordProjectTransaction(project.id, tx);

            // Fetch final draft file versions to unlock
            const projectFiles = await tx
              .select({
                fileId: files.id,
                finalDraftVersionId: files.finalDraftVersionId,
              })
              .from(files)
              .where(eq(files.projectId, project.id));

            const filesForR2Cleanup: { bucket: string; key: string }[] = [];

            for (const file of projectFiles) {
              if (file.finalDraftVersionId) {
                // Unlock final draft version
                await tx
                  .insert(projectUnlockedFileVersions)
                  .values({
                    projectId: project.id,
                    fileId: file.fileId,
                    fileVersionId: file.finalDraftVersionId,
                    unlockedAt: completedAt,
                  })
                  .onConflictDoNothing();

                // Fetch storage key of processed watermark for R2 cleanup
                const [v] = await tx
                  .select({
                    processedBucket: fileVersions.processedStorageBucket,
                    processedKey: fileVersions.processedStorageKey,
                  })
                  .from(fileVersions)
                  .where(eq(fileVersions.id, file.finalDraftVersionId))
                  .limit(1);

                if (v?.processedBucket && v?.processedKey) {
                  filesForR2Cleanup.push({
                    bucket: v.processedBucket,
                    key: v.processedKey,
                  });
                }
              }
            }

            // Enqueue outbox tasks for asynchronous side effects
            if (filesForR2Cleanup.length > 0) {
              await tx.insert(paymentOutboxEvents).values({
                paymentTransactionId: payTx.id,
                eventType: "payment.project_final.r2_cleanup",
                payload: { files: filesForR2Cleanup, projectId: project.id },
                status: "pending",
              });
            }

            // Enqueue creator payment email
            if (project.userId) {
              const [creator] = await tx
                .select({
                  email: users.email,
                  displayName: users.displayName,
                  firstName: users.firstName,
                })
                .from(users)
                .where(eq(users.id, project.userId))
                .limit(1);

              if (creator?.email) {
                const amountFormatted = `${project.currency || "INR"} ${(payTx.originalAmount / 100).toLocaleString()}`;
                await tx.insert(paymentOutboxEvents).values({
                  paymentTransactionId: payTx.id,
                  eventType: "payment.email.creator_payment",
                  payload: {
                    creatorEmail: creator.email,
                    creatorName: creator.displayName || creator.firstName || "Creator",
                    projectTitle: project.title,
                    payerName: payTx.customerName || "Client",
                    amountFormatted,
                    invoiceNumber,
                    projectId: project.id,
                  },
                  status: "pending",
                });
              }
            }

            // Enqueue client receipt email
            const clientEmail = payTx.customerEmail || project.shareClientEmail || project.clientEmail;
            if (clientEmail) {
              const amountFormatted = `${project.currency || "INR"} ${(payTx.totalPayable / 100).toLocaleString()}`;
              await tx.insert(paymentOutboxEvents).values({
                paymentTransactionId: payTx.id,
                eventType: "payment.email.client_invoice",
                payload: {
                  clientEmail,
                  clientName: payTx.customerName || project.clientName || undefined,
                  projectTitle: project.title,
                  invoiceNumber,
                  amountFormatted,
                  galleryUrl: project.shareUrl || undefined,
                },
                status: "pending",
              });
            }
          }
          break;
        }

        case "project_advance": {
          const [project] = await tx
            .select()
            .from(projects)
            .where(eq(projects.id, payTx.referenceId))
            .limit(1);

          if (project) {
            const completedAt = new Date();
            await tx
              .update(projects)
              .set({
                advancePaymentStatus: ProjectPaymentStatus.Paid,
                advancePaymentCompletedAt: completedAt,
                updatedAt: new Date(),
              })
              .where(eq(projects.id, project.id));

            // Record creator advance transaction in mitfloww.transactions
            await transactionService.recordAdvanceTransaction(project.id, tx);

            // Enqueue advance payment received email for creator
            if (project.userId) {
              const [creator] = await tx
                .select({
                  email: users.email,
                  displayName: users.displayName,
                  firstName: users.firstName,
                })
                .from(users)
                .where(eq(users.id, project.userId))
                .limit(1);

              if (creator?.email) {
                const amountFormatted = `${project.currency || "INR"} ${(payTx.originalAmount / 100).toLocaleString()}`;
                await tx.insert(paymentOutboxEvents).values({
                  paymentTransactionId: payTx.id,
                  eventType: "payment.email.advance_received",
                  payload: {
                    creatorEmail: creator.email,
                    creatorName: creator.displayName || creator.firstName || "Creator",
                    projectTitle: project.title,
                    payerName: payTx.customerName || "Client",
                    amountFormatted,
                    projectId: project.id,
                  },
                  status: "pending",
                });
              }
            }
          }
          break;
        }

        case "asset_purchase": {
          const [asset] = await tx
            .select()
            .from(assets)
            .where(eq(assets.id, payTx.referenceId))
            .limit(1);

          if (asset && payTx.customerEmail) {
            const accessToken = crypto.randomUUID();
            const invoiceNumber = `AST-${asset.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            const commissionCents = Math.round(payTx.originalAmount * 0.1);
            const netAmountCents = Math.max(0, payTx.originalAmount - commissionCents);

            await tx.insert(assetPurchases).values({
              assetId: asset.id,
              buyerEmail: payTx.customerEmail.toLowerCase().trim(),
              amountCents: payTx.originalAmount,
              currency: payTx.currency,
              commissionCents,
              netAmountCents,
              invoiceNumber,
              accessToken,
              paidAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours access
            });

            // Enqueue buyer delivery email
            const downloadUrl = `${process.env.APP_URL || "http://localhost:3000"}/s/asset/download/${accessToken}`;
            await tx.insert(paymentOutboxEvents).values({
              paymentTransactionId: payTx.id,
              eventType: "payment.email.asset_delivery",
              payload: {
                buyerEmail: payTx.customerEmail,
                assetTitle: asset.title,
                invoiceNumber,
                amountFormatted: `${payTx.currency} ${(payTx.totalPayable / 100).toLocaleString()}`,
                downloadUrl,
                expiresInHours: 24,
              },
              status: "pending",
            });
          }
          break;
        }

        case "credit_pack": {
          if (payTx.userId) {
            const pack = getCreditPack(payTx.referenceId as any);
            const { scope } = await creditService.getOrCreateCreditAccountForScope({
              actorUserId: payTx.userId,
              scopeId: payTx.userId,
              scopeType: "personal",
            });

            await creditService.grantCredits({
              credits: pack.credits,
              idempotencyKey: `credit-pack:${scope.scopeType}:${scope.scopeId}:${payTx.id}`,
              metadata: {
                paymentTransactionId: payTx.id,
                packKey: payTx.referenceId,
                priceInrMinorUnits: payTx.originalAmount,
              },
              scope,
              source: "purchased_pack",
              type: "purchase",
            });
          }
          break;
        }

        case "storage_addon": {
          if (payTx.userId) {
            await storageService.purchaseStorageAddOn({
              currency: payTx.currency,
              idempotencyKey: `storage-addon:${payTx.userId}:${payTx.id}`,
              storageAddOnKey: payTx.referenceId as any,
            });
          }
          break;
        }

        case "plan_upgrade": {
          if (payTx.userId) {
            await userService.updateUserPlan(payTx.userId, payTx.referenceId as any);
          }
          break;
        }
      }

      // 4. Mark entitlement as granted
      const [finalizedRecord] = await tx
        .update(paymentTransactions)
        .set({
          entitlementGranted: true,
          entitlementGrantedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, payTx.id))
        .returning();

      // 5. Append-only transactional audit log
      await paymentLogger.audit({
        tx,
        severity: "info",
        operation: "payment.captured_and_entitled",
        paymentTransactionId: payTx.id,
        referenceType: payTx.referenceType,
        referenceId: payTx.referenceId,
        provider: payTx.provider,
        providerOrderId: payTx.orderId,
        providerPaymentId: paymentId,
        previousStatus: payTx.status,
        newStatus: "captured",
        outcome: "success",
        data: {
          originalAmount: payTx.originalAmount,
          totalPayable: payTx.totalPayable,
          entitlementGranted: true,
        },
      });

      return finalizedRecord;
    });

    // Fire outbox processing immediately after transaction commit
    paymentOutboxWorker.triggerImmediate();

    return result;
  }

  async refundPayment(params: {
    paymentTransactionId: string;
    amount?: number;
    reason?: string;
    actorUserId?: string;
  }) {
    const { paymentTransactionId, amount, reason } = params;

    const [payTx] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, paymentTransactionId))
      .limit(1);

    if (!payTx) {
      throw new NotFoundAppError("Payment transaction not found.");
    }

    if (payTx.status !== "captured" && payTx.status !== "partially_refunded") {
      throw new AppError(
        `Cannot refund payment in '${payTx.status}' status. Only captured payments can be refunded.`,
        400,
        "invalid_refund_status",
      );
    }

    const availableToRefund = payTx.amount - payTx.amountRefunded;
    const refundAmount = amount ? Math.min(amount, availableToRefund) : availableToRefund;

    if (refundAmount <= 0) {
      throw new AppError("Payment is already fully refunded.", 400, "already_refunded");
    }

    const adapter = gatewayResolver.getAdapter(payTx.provider as any);
    const refundIdempotencyKey = `ref_${payTx.id}_${Date.now()}`;

    // Call gateway provider refund API
    const refundResult = await adapter.refundPayment({
      paymentId: payTx.paymentId!,
      amount: refundAmount,
      currency: payTx.currency,
      reason,
      idempotencyKey: refundIdempotencyKey,
    });

    const newAmountRefunded = payTx.amountRefunded + refundAmount;
    const isFullRefund = newAmountRefunded >= payTx.amount;
    const newStatus = isFullRefund ? "refunded" : "partially_refunded";

    const [updatedTx] = await db.transaction(async (tx) => {
      // Record refund in mitfloww.payment_refunds
      await tx.insert(paymentRefunds).values({
        paymentTransactionId: payTx.id,
        provider: payTx.provider,
        providerRefundId: refundResult.refundId,
        amount: refundAmount,
        currency: payTx.currency,
        status: refundResult.status as any,
        reason: reason || null,
        idempotencyKey: refundIdempotencyKey,
      });

      // Update payment_transactions
      const [updated] = await tx
        .update(paymentTransactions)
        .set({
          status: newStatus,
          amountRefunded: newAmountRefunded,
          refundedAt: isFullRefund ? new Date() : payTx.refundedAt,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, payTx.id))
        .returning();

      await paymentLogger.audit({
        tx,
        severity: "info",
        operation: "payment.refund_processed",
        paymentTransactionId: payTx.id,
        provider: payTx.provider,
        providerPaymentId: payTx.paymentId,
        providerRefundId: refundResult.refundId,
        previousStatus: payTx.status,
        newStatus,
        data: {
          refundAmount,
          newAmountRefunded,
          isFullRefund,
          reason,
        },
      });

      return [updated];
    });

    return {
      success: true,
      transaction: updatedTx,
      refundId: refundResult.refundId,
      refundAmount,
      status: newStatus,
    };
  }

  async getAuthoritativeStatus(params: {
    orderId?: string;
    paymentId?: string;
    transactionId?: string;
  }): Promise<PaymentTransactionRecord | null> {
    if (params.transactionId) {
      const [record] = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.id, params.transactionId))
        .limit(1);
      return record ?? null;
    }

    if (params.orderId) {
      const [record] = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.orderId, params.orderId))
        .limit(1);
      return record ?? null;
    }

    if (params.paymentId) {
      const [record] = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.paymentId, params.paymentId))
        .limit(1);
      return record ?? null;
    }

    return null;
  }
}

export const paymentService = new PaymentService();

