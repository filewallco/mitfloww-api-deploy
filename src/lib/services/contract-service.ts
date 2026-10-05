import { db } from "@/lib/db/client";
import {
  projects,
  projectContracts,
  projectContractUpdateRequests,
  type ProjectContractRecord,
  type ProjectContractUpdateRequestRecord,
  type ProjectRecord,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AppError, NotFoundAppError } from "@/lib/errors/app-error";
import { creditService } from "@/lib/services/credit-service";
import { contractPdfService } from "@/lib/services/contract-pdf-service";
import { emailService } from "@/lib/email/email-service";
import { userService } from "@/lib/services/user-service";
import { createScopedLogger } from "@/lib/logger";

const scopedLogger = createScopedLogger("contract-service");

export interface ClientContractUpdateStateDTO {
  hasPendingUpdate: boolean;
  requestId: string | null;
  fromVersion: number;
  targetVersion: number;
  currentTerms: {
    title: string;
    amountCents: number;
    currency: string;
    revisionLimit: number;
    extraRevisionCostCents: number;
  };
  proposedTerms: {
    title: string;
    amountCents: number;
    currency: string;
    revisionLimit: number;
    extraRevisionCostCents: number;
  } | null;
  requestedAt: string | null;
}

export class ContractService {
  /**
   * Generates or retrieves the contract PDF for a given project.
   */
  async getContractPdf(params: {
    projectId: string;
    version?: number;
    proposed?: boolean;
  }): Promise<{ pdfBuffer: Buffer; filename: string }> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    let creatorName = "Creator";
    let creatorEmail = "";
    try {
      const profile = await userService.getProfile(project.userId);
      creatorName = profile.user.displayName || profile.user.username || "Creator";
      creatorEmail = profile.user.email || "";
    } catch (e) {
      scopedLogger.warn("Failed to fetch creator profile for contract PDF", { error: e });
    }

    const cleanTitle = (project.title || "Project").replace(/[^a-zA-Z0-9]/g, "_");

    if (params.proposed) {
      const [updateRequest] = await db
        .select()
        .from(projectContractUpdateRequests)
        .where(
          and(
            eq(projectContractUpdateRequests.projectId, project.id),
            eq(projectContractUpdateRequests.status, "pending"),
          ),
        )
        .orderBy(desc(projectContractUpdateRequests.createdAt))
        .limit(1);

      if (!updateRequest) {
        throw new NotFoundAppError("No pending contract update request found for this project.");
      }

      const snapshot = updateRequest.proposedSnapshot as Record<string, any>;
      const pdfBuffer = await contractPdfService.generateContractPdf({
        contractId: updateRequest.id,
        projectId: project.id,
        projectTitle: snapshot.projectTitle || project.title,
        version: updateRequest.targetVersion,
        status: "proposed",
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
        creatorName,
        creatorEmail,
        clientName: project.clientName || "Client",
        clientEmail: project.clientEmail || project.shareClientEmail || "",
        currency: snapshot.currency || project.currency,
        amountCents: snapshot.amountCents ?? project.amountCents,
        advancePaymentEnabled: project.advancePaymentEnabled,
        advanceAmountCents: project.advanceAmountCents,
        remainingAmountCents: project.advancePaymentEnabled
          ? Math.max(0, (snapshot.amountCents ?? project.amountCents) - project.advanceAmountCents)
          : (snapshot.amountCents ?? project.amountCents),
        revisionLimit: snapshot.revisionLimit ?? project.revisionLimit,
        extraRevisionCostCents: snapshot.extraRevisionCostCents ?? project.extraRevisionCostCents,
      });

      return {
        pdfBuffer,
        filename: `MitFloww_Contract_${cleanTitle}_Proposed_v${updateRequest.targetVersion}.pdf`,
      };
    }

    const targetVersion = params.version ?? project.contractAcceptedVersion;
    const isAccepted = project.contractStatus === "accepted" && targetVersion > 0;

    let snapshotData: Record<string, any> = {
      projectTitle: project.title,
      amountCents: project.amountCents,
      currency: project.currency,
      advancePaymentEnabled: project.advancePaymentEnabled,
      advanceAmountCents: project.advanceAmountCents,
      remainingAmountCents: project.advancePaymentEnabled
        ? Math.max(0, project.amountCents - project.advanceAmountCents)
        : project.amountCents,
      revisionLimit: project.revisionLimit,
      extraRevisionCostCents: project.extraRevisionCostCents,
    };

    let acceptedAtFormatted: string | null = null;
    let acceptedBy: string | null = null;

    if (isAccepted) {
      const [contractRecord] = await db
        .select()
        .from(projectContracts)
        .where(
          and(
            eq(projectContracts.projectId, project.id),
            eq(projectContracts.version, targetVersion),
          ),
        )
        .limit(1);

      if (contractRecord) {
        snapshotData = contractRecord.snapshot as Record<string, any>;
        acceptedAtFormatted = contractRecord.acceptedAt
          ? new Date(contractRecord.acceptedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null;
        acceptedBy = contractRecord.acceptedBy;
      }
    }

    const pdfBuffer = await contractPdfService.generateContractPdf({
      contractId: project.id,
      projectId: project.id,
      projectTitle: snapshotData.projectTitle || project.title,
      version: targetVersion > 0 ? targetVersion : 1,
      status: isAccepted ? "accepted" : "pending",
      date: acceptedAtFormatted || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
      acceptedAt: acceptedAtFormatted,
      acceptedBy,
      creatorName,
      creatorEmail,
      clientName: project.clientName || "Client",
      clientEmail: project.clientEmail || project.shareClientEmail || "",
      currency: snapshotData.currency || project.currency,
      amountCents: snapshotData.amountCents ?? project.amountCents,
      advancePaymentEnabled: snapshotData.advancePaymentEnabled ?? project.advancePaymentEnabled,
      advanceAmountCents: snapshotData.advanceAmountCents ?? project.advanceAmountCents,
      remainingAmountCents: snapshotData.remainingAmountCents ?? (
        project.advancePaymentEnabled
          ? Math.max(0, project.amountCents - project.advanceAmountCents)
          : project.amountCents
      ),
      revisionLimit: snapshotData.revisionLimit ?? project.revisionLimit,
      extraRevisionCostCents: snapshotData.extraRevisionCostCents ?? project.extraRevisionCostCents,
    });

    return {
      pdfBuffer,
      filename: `MitFloww_Contract_${cleanTitle}_v${targetVersion > 0 ? targetVersion : 1}.pdf`,
    };
  }

  /**
   * Accepts the initial project contract atomically and transactionally.
   * Deducts 10 tokens from the creator and locks the project.
   */
  async acceptInitialContract(params: {
    projectId: string;
    clientEmail: string;
    ip?: string;
  }): Promise<{ success: boolean; contractVersion: number }> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    if (!project.contractEnabled) {
      throw new AppError("Contract is not enabled for this project.", 400, "contract_not_enabled");
    }

    // Idempotency: If already accepted, return existing acceptance without double charging
    if (project.contractStatus === "accepted") {
      return { success: true, contractVersion: project.contractAcceptedVersion || 1 };
    }

    // Verify creator has >= 10 credits
    const balance = await creditService.getCreditBalance({
      actorUserId: project.userId,
      scopeId: project.userId,
      scopeType: "personal",
    });

    if (balance.availableCredits < 10) {
      throw new AppError(
        "Creator has insufficient tokens to activate the contract.",
        402,
        "insufficient_credits",
      );
    }

    // Atomic deduction with idempotency key
    const idempotencyKey = `contract-accept-${project.id}-v1`;
    const deductionResult = await creditService.deductCredits({
      credits: 10,
      featureKey: "project_contract",
      idempotencyKey,
      projectId: project.id,
      scope: {
        actorUserId: project.userId,
        scopeId: project.userId,
        scopeType: "personal",
      },
    });

    let creatorName = "Creator";
    let creatorEmail = "";
    try {
      const profile = await userService.getProfile(project.userId);
      creatorName = profile.user.displayName || profile.user.username || "Creator";
      creatorEmail = profile.user.email || "";
    } catch {}

    const clientEmail = params.clientEmail || project.clientEmail || project.shareClientEmail || "";

    const snapshot = {
      projectId: project.id,
      projectTitle: project.title,
      amountCents: project.amountCents,
      currency: project.currency,
      advancePaymentEnabled: project.advancePaymentEnabled,
      advanceAmountCents: project.advanceAmountCents,
      remainingAmountCents: project.advancePaymentEnabled
        ? Math.max(0, project.amountCents - project.advanceAmountCents)
        : project.amountCents,
      revisionLimit: project.revisionLimit,
      extraRevisionCostCents: project.extraRevisionCostCents,
      creatorName,
      creatorEmail,
      clientName: project.clientName,
      clientEmail,
      acceptedAt: new Date().toISOString(),
      version: 1,
    };

    const acceptedAt = new Date();

    // Insert version 1 into project_contracts
    await db.insert(projectContracts).values({
      projectId: project.id,
      userId: project.userId,
      version: 1,
      status: "accepted",
      snapshot,
      acceptedAt,
      acceptedBy: clientEmail,
      acceptedIp: params.ip,
      tokenTransactionId: deductionResult.ledgerEntry?.id,
    });

    // Lock project as accepted
    await db
      .update(projects)
      .set({
        contractStatus: "accepted",
        contractAcceptedAt: acceptedAt,
        contractAcceptedVersion: 1,
        clientEmail: project.clientEmail || clientEmail,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, project.id));

    // Generate finalized PDF and send asynchronous emails
    void (async () => {
      try {
        const { pdfBuffer } = await this.getContractPdf({
          projectId: project.id,
          version: 1,
        });

        if (creatorEmail && clientEmail) {
          await emailService.sendContractAcceptedEmail({
            creatorEmail,
            creatorName,
            clientEmail,
            clientName: project.clientName,
            projectTitle: project.title,
            version: 1,
            pdfBuffer,
          });
        }
      } catch (err) {
        scopedLogger.error("Failed to generate or send contract acceptance PDF/email", {
          err,
          projectId: project.id,
        });
      }
    })();

    return { success: true, contractVersion: 1 };
  }

  /**
   * Creator requests an update to a contract-locked project.
   * Can only modify: name (title), amountCents, revisionLimit, extraRevisionCostCents.
   */
  async requestProjectUpdate(params: {
    projectId: string;
    userId: string;
    changes: {
      name?: string;
      amountCents?: number;
      revisionLimit?: number;
      extraRevisionCostCents?: number;
    };
  }): Promise<ProjectContractUpdateRequestRecord> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    if (project.userId !== params.userId) {
      throw new AppError("Unauthorized.", 403, "unauthorized");
    }

    if (project.contractStatus !== "accepted") {
      throw new AppError(
        "Project is not contract-locked. Direct edits can be performed before acceptance.",
        400,
        "project_not_contract_locked",
      );
    }

    // Verify creator has at least 5 tokens balance so update can be confirmed later
    const balance = await creditService.getCreditBalance({
      actorUserId: params.userId,
      scopeId: params.userId,
      scopeType: "personal",
    });

    if (balance.availableCredits < 5) {
      throw new AppError(
        "You need at least 5 available tokens to request a project contract update.",
        402,
        "insufficient_credits",
      );
    }

    // Cancel existing pending update requests for this project
    await db
      .update(projectContractUpdateRequests)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectContractUpdateRequests.projectId, project.id),
          eq(projectContractUpdateRequests.status, "pending"),
        ),
      );

    const fromVersion = project.contractAcceptedVersion || 1;
    const targetVersion = fromVersion + 1;

    let creatorName = "Creator";
    try {
      const profile = await userService.getProfile(params.userId);
      creatorName = profile.user.displayName || profile.user.username || "Creator";
    } catch {}

    const clientEmail = project.clientEmail || project.shareClientEmail || "";

    const proposedSnapshot = {
      projectId: project.id,
      projectTitle: params.changes.name?.trim() || project.title,
      amountCents: params.changes.amountCents ?? project.amountCents,
      currency: project.currency,
      advancePaymentEnabled: project.advancePaymentEnabled,
      advanceAmountCents: project.advanceAmountCents,
      remainingAmountCents: project.advancePaymentEnabled
        ? Math.max(0, (params.changes.amountCents ?? project.amountCents) - project.advanceAmountCents)
        : (params.changes.amountCents ?? project.amountCents),
      revisionLimit: params.changes.revisionLimit ?? project.revisionLimit,
      extraRevisionCostCents: params.changes.extraRevisionCostCents ?? project.extraRevisionCostCents,
      creatorName,
      clientName: project.clientName,
      clientEmail,
      proposedAt: new Date().toISOString(),
      targetVersion,
    };

    const [requestRecord] = await db
      .insert(projectContractUpdateRequests)
      .values({
        projectId: project.id,
        userId: params.userId,
        fromVersion,
        targetVersion,
        status: "pending",
        requestedChanges: params.changes,
        proposedSnapshot,
      })
      .returning();

    // Send email to client
    const appUrl = process.env.APP_URL || "https://mitfloww.com";
    const reviewUrl = `${appUrl}/s/${project.shareToken}/contract-update`;

    const formattedAmount =
      params.changes.amountCents != null
        ? `${project.currency} ${(params.changes.amountCents / 100).toFixed(2)}`
        : undefined;

    const formattedExtraRevision =
      params.changes.extraRevisionCostCents != null
        ? `${project.currency} ${(params.changes.extraRevisionCostCents / 100).toFixed(2)}`
        : undefined;

    void (async () => {
      try {
        if (clientEmail) {
          await emailService.sendContractUpdateRequestEmail({
            clientEmail,
            clientName: project.clientName,
            creatorName,
            projectTitle: project.title,
            reviewUrl,
            proposedChanges: {
              title: params.changes.name,
              amountFormatted: formattedAmount,
              revisionLimit: params.changes.revisionLimit,
              extraRevisionCostFormatted: formattedExtraRevision,
            },
          });
        }
      } catch (emailErr) {
        scopedLogger.error("Failed to send contract update request email to client", {
          emailErr,
          projectId: project.id,
        });
      }
    })();

    return requestRecord;
  }

  /**
   * Retrieves the current and proposed contract state for client review.
   */
  async getClientContractUpdateState(params: {
    shareToken: string;
  }): Promise<ClientContractUpdateStateDTO> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, params.shareToken))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    const currentTerms = {
      title: project.title,
      amountCents: project.amountCents,
      currency: project.currency,
      revisionLimit: project.revisionLimit,
      extraRevisionCostCents: project.extraRevisionCostCents,
    };

    const [updateRequest] = await db
      .select()
      .from(projectContractUpdateRequests)
      .where(
        and(
          eq(projectContractUpdateRequests.projectId, project.id),
          eq(projectContractUpdateRequests.status, "pending"),
        ),
      )
      .orderBy(desc(projectContractUpdateRequests.createdAt))
      .limit(1);

    if (!updateRequest) {
      return {
        hasPendingUpdate: false,
        requestId: null,
        fromVersion: project.contractAcceptedVersion,
        targetVersion: project.contractAcceptedVersion,
        currentTerms,
        proposedTerms: null,
        requestedAt: null,
      };
    }

    const snapshot = updateRequest.proposedSnapshot as Record<string, any>;

    return {
      hasPendingUpdate: true,
      requestId: updateRequest.id,
      fromVersion: updateRequest.fromVersion,
      targetVersion: updateRequest.targetVersion,
      currentTerms,
      proposedTerms: {
        title: snapshot.projectTitle || project.title,
        amountCents: snapshot.amountCents ?? project.amountCents,
        currency: snapshot.currency || project.currency,
        revisionLimit: snapshot.revisionLimit ?? project.revisionLimit,
        extraRevisionCostCents: snapshot.extraRevisionCostCents ?? project.extraRevisionCostCents,
      },
      requestedAt: updateRequest.requestedAt.toISOString(),
    };
  }

  /**
   * Client confirms the project contract update.
   * Deducts 5 tokens from the creator and advances the contract version.
   */
  async confirmProjectUpdate(params: {
    shareToken: string;
    requestId: string;
    clientEmail: string;
    ip?: string;
  }): Promise<{ success: boolean; newVersion: number }> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, params.shareToken))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    const [updateRequest] = await db
      .select()
      .from(projectContractUpdateRequests)
      .where(eq(projectContractUpdateRequests.id, params.requestId))
      .limit(1);

    if (!updateRequest || updateRequest.projectId !== project.id) {
      throw new NotFoundAppError("Contract update request not found.");
    }

    if (updateRequest.status !== "pending") {
      throw new AppError(
        "This contract update request is no longer pending.",
        400,
        "contract_update_not_pending",
      );
    }

    if (updateRequest.fromVersion !== project.contractAcceptedVersion) {
      throw new AppError(
        "This contract update request is based on an outdated contract version.",
        400,
        "contract_update_version_mismatch",
      );
    }

    // Verify creator has >= 5 tokens
    const balance = await creditService.getCreditBalance({
      actorUserId: project.userId,
      scopeId: project.userId,
      scopeType: "personal",
    });

    if (balance.availableCredits < 5) {
      throw new AppError(
        "Creator has insufficient tokens to finalize this contract update.",
        402,
        "insufficient_credits",
      );
    }

    // Deduct 5 tokens from creator atomically
    const idempotencyKey = `contract-update-${updateRequest.id}`;
    const deductionResult = await creditService.deductCredits({
      credits: 5,
      featureKey: "project_contract_update",
      idempotencyKey,
      projectId: project.id,
      scope: {
        actorUserId: project.userId,
        scopeId: project.userId,
        scopeType: "personal",
      },
    });

    const changes = updateRequest.requestedChanges as Record<string, any>;
    const targetVersion = updateRequest.targetVersion;

    const newTitle = changes.name?.trim() || project.title;
    const newAmountCents = changes.amountCents ?? project.amountCents;
    const newRevisionLimit = changes.revisionLimit ?? project.revisionLimit;
    const newExtraRevisionCostCents = changes.extraRevisionCostCents ?? project.extraRevisionCostCents;

    let creatorName = "Creator";
    let creatorEmail = "";
    try {
      const profile = await userService.getProfile(project.userId);
      creatorName = profile.user.displayName || profile.user.username || "Creator";
      creatorEmail = profile.user.email || "";
    } catch {}

    const clientEmail = params.clientEmail || project.clientEmail || project.shareClientEmail || "";

    const snapshot = {
      projectId: project.id,
      projectTitle: newTitle,
      amountCents: newAmountCents,
      currency: project.currency,
      advancePaymentEnabled: project.advancePaymentEnabled,
      advanceAmountCents: project.advanceAmountCents,
      remainingAmountCents: project.advancePaymentEnabled
        ? Math.max(0, newAmountCents - project.advanceAmountCents)
        : newAmountCents,
      revisionLimit: newRevisionLimit,
      extraRevisionCostCents: newExtraRevisionCostCents,
      creatorName,
      creatorEmail,
      clientName: project.clientName,
      clientEmail,
      acceptedAt: new Date().toISOString(),
      version: targetVersion,
    };

    const acceptedAt = new Date();

    // 1. Insert new contract version
    await db.insert(projectContracts).values({
      projectId: project.id,
      userId: project.userId,
      version: targetVersion,
      status: "accepted",
      snapshot,
      acceptedAt,
      acceptedBy: clientEmail,
      acceptedIp: params.ip,
      tokenTransactionId: deductionResult.ledgerEntry?.id,
    });

    // 2. Mark update request as accepted
    await db
      .update(projectContractUpdateRequests)
      .set({
        status: "accepted",
        respondedAt: acceptedAt,
        tokenTransactionId: deductionResult.ledgerEntry?.id,
        updatedAt: acceptedAt,
      })
      .where(eq(projectContractUpdateRequests.id, updateRequest.id));

    // 3. Apply ONLY allowed fields to project and keep locked
    await db
      .update(projects)
      .set({
        title: newTitle,
        amountCents: newAmountCents,
        revisionLimit: newRevisionLimit,
        extraRevisionCostCents: newExtraRevisionCostCents,
        contractAcceptedVersion: targetVersion,
        contractAcceptedAt: acceptedAt,
        updatedAt: acceptedAt,
      })
      .where(eq(projects.id, project.id));

    // 4. Generate finalized PDF and send asynchronous emails to creator and client
    void (async () => {
      try {
        const { pdfBuffer } = await this.getContractPdf({
          projectId: project.id,
          version: targetVersion,
        });

        if (creatorEmail && clientEmail) {
          await emailService.sendContractUpdateConfirmedEmail({
            creatorEmail,
            creatorName,
            clientEmail,
            clientName: project.clientName,
            projectTitle: newTitle,
            version: targetVersion,
            pdfBuffer,
          });
        }
      } catch (err) {
        scopedLogger.error("Failed to generate or send confirmed contract PDF/email", {
          err,
          projectId: project.id,
          version: targetVersion,
        });
      }
    })();

    return { success: true, newVersion: targetVersion };
  }

  /**
   * Client rejects the project contract update.
   * Cancels the update request and keeps original contract active.
   */
  async rejectProjectUpdate(params: {
    shareToken: string;
    requestId: string;
    clientEmail?: string;
  }): Promise<{ success: boolean }> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.shareToken, params.shareToken))
      .limit(1);

    if (!project) {
      throw new NotFoundAppError("Project not found.");
    }

    const [updateRequest] = await db
      .select()
      .from(projectContractUpdateRequests)
      .where(eq(projectContractUpdateRequests.id, params.requestId))
      .limit(1);

    if (!updateRequest || updateRequest.projectId !== project.id) {
      throw new NotFoundAppError("Contract update request not found.");
    }

    if (updateRequest.status !== "pending") {
      throw new AppError(
        "This contract update request is no longer pending.",
        400,
        "contract_update_not_pending",
      );
    }

    await db
      .update(projectContractUpdateRequests)
      .set({
        status: "rejected",
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectContractUpdateRequests.id, updateRequest.id));

    void (async () => {
      try {
        const profile = await userService.getProfile(project.userId);
        if (profile.user.email) {
          await emailService.sendContractUpdateRejectedEmail({
            creatorEmail: profile.user.email,
            creatorName: profile.user.displayName || profile.user.username || undefined,
            clientName: project.clientName || undefined,
            projectTitle: project.title,
          });
        }
      } catch (err) {
        scopedLogger.error("Failed to send contract update rejection email", { err });
      }
    })();

    return { success: true };
  }

}

export const contractService = new ContractService();
