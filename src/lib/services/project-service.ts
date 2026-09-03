  import { INPUT_LIMITS } from "@/config/input-limits";
  import {
    PROJECT_SHARE_LINK_EXPIRY_DAYS,
    PROJECT_SHARE_PASSWORD_LOCKOUT_MINUTES,
    PROJECT_SHARE_PASSWORD_MAX_ATTEMPTS,
  } from "@/config/projects";
  import { defaultLocale } from "@/i18n/config";
  import {
    DEFAULT_PROJECT_CURRENCY,
    normalizeProjectCurrency,
  } from "@/lib/constants/currencies";
  import type {
    DeletedProjectDTO,
    ProjectEditLocksDTO,
    ProjectClientReviewDTO,
    ProjectDTO,
    ProjectShareClientStateDTO,
    ProjectShareComposerDTO,
    ProjectShareAccessDTO,
    ProjectShareDraftDTO,
  } from "@/lib/dto/projects";
  import type { TranslatedTextDTO } from "@/lib/dto/translated-text";
  import {
    ProjectPaymentStatus,
    ProjectPaymentStatusDb,
    ProjectShareMutationAction,
    ProjectShareStatus,
    ProjectStatus,
  } from "@/lib/dto/projects";
  import type { ProjectRecord } from "@/lib/db/schema";
  import {
    AppError,
    NotFoundAppError,
    ValidationAppError,
  } from "@/lib/errors/app-error";
  import {
    DrizzleFileRepository,
    type FileRepository,
  } from "@/lib/repositories/file-repository";
  import {
    DrizzleProjectRepository,
    type ProjectRepository,
  } from "@/lib/repositories/project-repository";
  import { fileService } from "@/lib/services/file-service";
  import {
    buildPaginationMeta,
    buildPaginationParams,
    type PaginatedResult,
  } from "@/lib/query/pagination";
  import {
    hashProjectSharePassword,
    verifyProjectSharePassword,
  } from "@/lib/security/project-share-password";
  import {
    decryptProjectSharePassword,
    encryptProjectSharePassword,
  } from "@/lib/security/project-share-password-storage";
  import {
    createSignedProjectShareToken,
    getProjectShareTokenExpiry,
    isSignedProjectShareToken,
  } from "@/lib/security/project-share-token";
  import {
    createProjectShareSessionToken,
    verifyProjectShareSessionToken,
  } from "@/lib/security/project-share-session";
  import { createTranslatedTextDTO } from "@/lib/translation/create-translated-text";
  import type {
    ProjectMutationValues,
    ProjectShareLinkMutationInput,
  } from "@/lib/validation/projects";
  import type { ProjectListQueryParams } from "@/lib/validation/projects";

  function normalizeProjectText(value: string, maxLength: number) {
    const normalized = value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");

    return normalized.length > maxLength
      ? normalized.slice(0, maxLength).trimEnd()
      : normalized;
  }

  function normalizeProjectName(value: string) {
    return normalizeProjectText(value, INPUT_LIMITS.projectTitle);
  }

  function normalizeClientName(value: string) {
    return normalizeProjectText(value, INPUT_LIMITS.clientName);
  }

  function normalizeClientEmail(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function normalizeRequiredClientEmail(value: string) {
    const normalized = normalizeClientEmail(value);

    if (!normalized) {
      throw new ValidationAppError("Enter a valid client email address.");
    }

    return normalized;
  }

  function slugifyProjectId(value: string) {
    const slug = value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");

    return slug.length > 0 ? slug : "project";
  }

  function clampProjectId(base: string, suffix?: number) {
    const suffixLabel = suffix == null ? "" : `-${suffix}`;
    const maxBaseLength = 255 - suffixLabel.length;
    const trimmedBase = base.slice(0, maxBaseLength).replace(/-+$/g, "");
    const normalizedBase = trimmedBase.length > 0 ? trimmedBase : "project";

    return `${normalizedBase}${suffixLabel}`;
  }

  export function resolvePublicAppBaseUrl(requestBaseUrl?: string) {
    const normalizedRequestBaseUrl = requestBaseUrl?.trim().replace(/\/+$/, "");

    const isApiBackend =
      normalizedRequestBaseUrl &&
      (normalizedRequestBaseUrl.includes(":4001") ||
        normalizedRequestBaseUrl.includes("mitfloww-api"));

    if (normalizedRequestBaseUrl && !isApiBackend) {
      return normalizedRequestBaseUrl;
    }

    const configuredBaseUrl = (
      process.env.APP_URL ||
      process.env.WEB_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PROCESSING_CALLBACK_BASE_URL
    )?.trim().replace(/\/+$/, "");

    if (
      configuredBaseUrl &&
      !configuredBaseUrl.includes(":4001") &&
      !configuredBaseUrl.includes("mitfloww-api")
    ) {
      return configuredBaseUrl;
    }

    return "http://localhost:3000";
  }

  export function buildProjectShareUrl(shareToken: string, requestBaseUrl?: string) {
    return `${resolvePublicAppBaseUrl(requestBaseUrl)}/s/${encodeURIComponent(shareToken)}`;
  }

  function createProjectShareExpiryDate(expiryDays?: number) {
    return new Date(
      Date.now() + (expiryDays ?? PROJECT_SHARE_LINK_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );
  }

  function createProjectShareAccessFields(
    requestBaseUrl?: string,
    shareToken?: string,
    expiryDays?: number,
  ) {
    const shareExpiresAt = shareToken
      ? getProjectShareTokenExpiry(shareToken)
      : createProjectShareExpiryDate(expiryDays);

    if (!shareExpiresAt || Number.isNaN(shareExpiresAt.getTime())) {
      throw new ValidationAppError("Share link is invalid.");
    }

    const resolvedShareToken =
      shareToken ?? createSignedProjectShareToken(shareExpiresAt);

    return {
      shareExpiresAt,
      shareToken: resolvedShareToken,
      shareUrl: buildProjectShareUrl(resolvedShareToken, requestBaseUrl),
    };
  }

  function createProjectShareDraft(
    projectId: string,
    requestBaseUrl?: string,
    expiryDays?: number,
  ): ProjectShareDraftDTO {
    const draft = createProjectShareAccessFields(requestBaseUrl, undefined, expiryDays);

    return {
      projectId,
      shareExpiresAt: draft.shareExpiresAt.toISOString(),
      shareToken: draft.shareToken,
      shareUrl: draft.shareUrl,
    };
  }

  function hasPersistedProjectShareAccess(project: {
    shareExpiresAt: Date | null;
    shareToken: string | null;
    shareUrl: string | null;
  }) {
    return Boolean(
      project.shareToken &&
        project.shareUrl &&
        project.shareExpiresAt,
    );
  }

  function getProjectShareRevokeThreshold() {
    return PROJECT_SHARE_PASSWORD_MAX_ATTEMPTS * 2;
  }

  function resolveProjectShareStatus(
    project: Pick<
      ProjectRecord,
      | "shareExpiresAt"
      | "shareLockedUntil"
      | "sharePasswordHash"
      | "shareStatus"
      | "shareToken"
      | "shareUrl"
    >,
    now = new Date(),
  ) {
    if (!project.shareToken || !project.shareUrl || !project.shareExpiresAt) {
      return null;
    }

    if (project.shareStatus === ProjectShareStatus.Revoked) {
      return ProjectShareStatus.Revoked;
    }

    if (project.shareExpiresAt.getTime() <= now.getTime()) {
      return ProjectShareStatus.Expired;
    }

    if (
      project.shareLockedUntil &&
      project.shareLockedUntil.getTime() > now.getTime()
    ) {
      return ProjectShareStatus.Locked;
    }

    return project.sharePasswordHash
      ? ProjectShareStatus.PasswordRequired
      : ProjectShareStatus.Active;
  }

  function toProjectShareDraft(
    project: Pick<ProjectRecord, "id" | "shareExpiresAt" | "shareToken" | "shareUrl">,
    baseUrl?: string,
  ): ProjectShareDraftDTO {
    if (!project.shareExpiresAt || !project.shareToken || !project.shareUrl) {
      throw new Error("Project share draft is not available.");
    }

    return {
      projectId: project.id,
      shareExpiresAt: project.shareExpiresAt.toISOString(),
      shareToken: project.shareToken,
      shareUrl: buildProjectShareUrl(project.shareToken, baseUrl),
    };
  }

  function getProjectShareRemainingAttempts(failedAttempts: number) {
    return Math.max(0, PROJECT_SHARE_PASSWORD_MAX_ATTEMPTS - failedAttempts);
  }

  function isProjectShareAccessOpen(
    shareStatus: ProjectShareStatus | null,
  ) {
    return (
      shareStatus === ProjectShareStatus.Active ||
      shareStatus === ProjectShareStatus.PasswordRequired
    );
  }

  function isProjectShareEmailRequired(
    project: Pick<ProjectRecord, "shareClientEmail">,
  ) {
    return true;
  }

  function isShareAccessLockedAfterPayment(project: Pick<ProjectRecord, "paymentStatus">) {
    return project.paymentStatus === ProjectPaymentStatus.Paid;
  }

  function getStoredProjectSharePassword(
    project: Pick<ProjectRecord, "sharePasswordCiphertext">,
  ) {
    if (!project.sharePasswordCiphertext) {
      return null;
    }

    return decryptProjectSharePassword(project.sharePasswordCiphertext);
  }

  function toProjectShareAccess(
    project: ProjectRecord,
    options?: { includeSharePassword?: boolean; baseUrl?: string },
  ): ProjectShareAccessDTO | null {
    if (!hasPersistedProjectShareAccess(project)) {
      return null;
    }

    const shareStatus = resolveProjectShareStatus(project);

    if (!shareStatus) {
      return null;
    }

    return {
      emailAdded: project.shareEmailAdded,
      failedAttempts: project.shareFailedAttempts,
      lockedUntil: project.shareLockedUntil?.toISOString() ?? null,
      passwordEnabled: Boolean(project.sharePasswordHash),
      projectId: project.id,
      shareClientEmail: project.shareClientEmail,
      shareExpiresAt: project.shareExpiresAt!.toISOString(),
      sharePassword: options?.includeSharePassword
        ? getStoredProjectSharePassword(project)
        : undefined,
      shareStatus,
      shareToken: project.shareToken!,
      shareUrl: buildProjectShareUrl(project.shareToken!, options?.baseUrl),
    };
  }

  function toProjectDTO(
    project: ProjectRecord,
    options?: {
      baseUrl?: string;
      clientNameText?: TranslatedTextDTO;
      includeSharePassword?: boolean;
      titleText?: TranslatedTextDTO;
    },
  ): ProjectDTO {
    return {
      advancePaymentEnabled: project.advancePaymentEnabled,
      advanceAmountCents: project.advanceAmountCents,
      advancePaymentStatus: project.advancePaymentStatus,
      amountCents: project.amountCents,
      clientEmail: project.clientEmail,
      clientName: project.clientName || "",
      clientNameText:
        options?.clientNameText ??
        createTranslatedTextDTO({
          originalText: project.clientName || "",
          sourceLocale: project.clientNameSourceLocale,
        }),
      createdAt: project.createdAt.toISOString(),
      currency: project.currency || DEFAULT_PROJECT_CURRENCY,
      extraRevisionCostCents: project.extraRevisionCostCents,
      id: project.id,
      publicId: project.publicId,
      paymentStatus: project.paymentStatus,
      revisionLimit: project.revisionLimit,
      shareClientEmail: project.shareClientEmail,
      shareAccess: toProjectShareAccess(project, options),
      status: project.status,
      title: project.title,
      titleText:
        options?.titleText ??
        createTranslatedTextDTO({
          originalText: project.title,
          sourceLocale: project.titleSourceLocale,
        }),
      updatedAt: project.updatedAt.toISOString(),
      watermarkEnabled: project.watermarkEnabled,
      paymentCompletedAt: project.clientPaymentCompletedAt?.toISOString() ?? null,
    };
  }

  function toProjectShareClientState(
    project: ProjectRecord,
    accessGranted: boolean,
    options?: {
      titleText?: TranslatedTextDTO;
    },
  ): ProjectShareClientStateDTO {
    if (!project.shareExpiresAt) {
      throw new Error("Project share expiry is not available.");
    }

    const shareStatus = resolveProjectShareStatus(project);

    if (!shareStatus) {
      throw new Error("Project share status is not available.");
    }

    return {
      accessGranted,
      emailRequired: isProjectShareEmailRequired(project),
      expiresAt: project.shareExpiresAt.toISOString(),
      lockedUntil: project.shareLockedUntil?.toISOString() ?? null,
      maxAttempts: PROJECT_SHARE_PASSWORD_MAX_ATTEMPTS,
      passwordRequired: Boolean(project.sharePasswordHash),
      project: accessGranted
        ? {
            id: project.id,
            title: project.title,
            titleText:
              options?.titleText ??
              createTranslatedTextDTO({
                originalText: project.title,
                sourceLocale: project.titleSourceLocale,
              }),
            advancePaymentEnabled: project.advancePaymentEnabled,
            advancePaymentStatus: project.advancePaymentStatus,
            paymentStatus: project.paymentStatus,
          }
        : null,
      remainingAttempts: getProjectShareRemainingAttempts(
        project.shareFailedAttempts,
      ),
      shareStatus,
    };
  }

  type ProjectTextRecord = Pick<
    ProjectRecord,
    | "id"
    | "title"
    | "titleSourceLocale"
    | "clientName"
    | "clientNameSourceLocale"
  >;

  type ResolvedProjectText = {
    clientNameText: TranslatedTextDTO;
    titleText: TranslatedTextDTO;
  };

  export class ProjectService {
    constructor(
      private readonly repository: ProjectRepository,
      private readonly fileRepository: FileRepository,
    ) {}

    async listProjects(
      params: ProjectListQueryParams,
      viewerLocale: string,
    ): Promise<PaginatedResult<ProjectDTO>> {
      const pagination = buildPaginationParams({
        limit: params.limit,
        page: params.page,
      });
      const result = await this.repository.findManyPaginated({
        ...params,
        ...pagination,
      });

      return {
        items: await this.buildProjectDTOs(result.records, viewerLocale),
        pagination:
          result.total == null
            ? null
            : buildPaginationMeta({
                limit: pagination.limit,
                page: pagination.page,
                total: result.total,
              }),
      };
    }

    async getProjectById(id: string, viewerLocale: string): Promise<ProjectDTO> {
      const record = await this.repository.findByIdentifier(id);

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return this.buildProjectDTO(record, viewerLocale);
    }

    async getProjectClientReviewByProjectId(
      id: string,
    ): Promise<ProjectClientReviewDTO | null> {
      const record = await this.repository.findByIdentifier(id);

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      const review = await this.repository.findClientReviewByProjectId(record.id);

      if (!review) {
        return null;
      }

      return {
        createdAt: review.createdAt.toISOString(),
        id: review.id,
        projectId: review.projectId,
        rating: review.rating,
        reviewText: review.reviewText,
        sourceLocale: review.sourceLocale,
        submittedAt: review.submittedAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      };
    }

    async createProject(
      input: ProjectMutationValues,
      options: {
        sourceLocale: string;
        viewerLocale: string;
      },
    ): Promise<ProjectDTO> {
      const title = normalizeProjectName(input.name);
      const clientName = normalizeClientName(input.clientName);
      const titleSourceLocale = defaultLocale;
      const clientNameSourceLocale = defaultLocale;

      await this.assertProjectIdentityAvailable({
        clientName,
        title,
      });

      const publicId = await this.createUniqueProjectPublicId(title);

      const record = await this.repository.create({
        advancePaymentEnabled: input.advancePaymentEnabled,
        advancePaymentStatus: ProjectPaymentStatus.Pending,
        advancePaymentCompletedAt: null,
        advanceAmountCents: input.advanceAmountCents,
        amountCents: input.amountCents,
        clientEmail: normalizeClientEmail(input.clientEmail),
        clientName,
        currency: normalizeProjectCurrency(input.currency),
        extraRevisionCostCents: input.extraRevisionCostCents,
        paymentStatus: input.paymentStatus ?? ProjectPaymentStatus.Pending,
        publicId,
        revisionLimit: input.revisionLimit,
        shareClientEmail: null,
        shareEmailAdded: false,
        shareExpiresAt: null,
        shareFailedAttempts: 0,
        shareLockedUntil: null,
        sharePasswordCiphertext: null,
        sharePasswordHash: null,
        shareStatus: null,
        shareToken: null,
        shareUrl: null,
        status: ProjectStatus.Active,
        title,
        titleSourceLocale,
        watermarkEnabled: input.watermarkEnabled,
        clientNameSourceLocale,
        clientPaymentCompletedAt: null,
        clientPaymentReference: null,
      });

      return this.buildProjectDTO(record, options.viewerLocale);
    }

    async updateProject(
      id: string,
      input: ProjectMutationValues,
      options: {
        sourceLocale: string;
        viewerLocale: string;
      },
    ): Promise<ProjectDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      this.assertProjectIsActive(existing.status);

      const title = normalizeProjectName(input.name);
      const clientName = normalizeClientName(input.clientName);
      const titleSourceLocale = defaultLocale;
      const clientNameSourceLocale = defaultLocale;
      const workflowSummary =
        await this.fileRepository.getProjectWorkflowSummary(existing.id);

      const lockDetails: Array<{
        code: string;
        message: string;
        path: string;
      }> = [];

      if (
        workflowSummary.activeFileCount > 0 &&
        (input.revisionLimit !== existing.revisionLimit ||
          input.extraRevisionCostCents !== existing.extraRevisionCostCents)
      ) {
        lockDetails.push(
          {
            code: "project_revision_settings_locked",
            message: "projectRevisionSettingsLocked",
            path: "revisionLimit",
          },
          {
            code: "project_revision_settings_locked",
            message: "projectRevisionSettingsLocked",
            path: "extraRevisionCostCents",
          },
        );
      }

      if (
        workflowSummary.hasAnyApprovedRevision &&
        (input.amountCents !== existing.amountCents ||
          normalizeProjectCurrency(input.currency) !== existing.currency)
      ) {
        lockDetails.push({
          code: "project_amount_locked_after_approval",
          message: "projectAmountLockedAfterApproval",
          path: "amountCents",
        });
        lockDetails.push({
          code: "project_amount_locked_after_approval",
          message: "projectAmountLockedAfterApproval",
          path: "currency",
        });
      }

      if (
        existing.advancePaymentStatus === ProjectPaymentStatus.Paid &&
        (input.advancePaymentEnabled !== existing.advancePaymentEnabled ||
          input.advanceAmountCents !== existing.advanceAmountCents)
      ) {
        lockDetails.push(
          {
            code: "advance_payment_locked_after_paid",
            message: "advancePaymentLockedAfterPaid",
            path: "advancePaymentEnabled",
          },
          {
            code: "advance_payment_locked_after_paid",
            message: "advancePaymentLockedAfterPaid",
            path: "advanceAmountCents",
          },
        );
      }

      if (lockDetails.length > 0) {
        throw new AppError(
          "Some project settings can no longer be changed.",
          409,
          "project_update_locked",
          lockDetails,
        );
      }

      await this.assertProjectIdentityAvailable({
        clientName,
        excludeId: existing.id,
        title,
      });

      const record = await this.repository.update(existing.id, {
        advancePaymentEnabled: input.advancePaymentEnabled,
        advanceAmountCents: input.advanceAmountCents,
        amountCents: input.amountCents,
        clientEmail: normalizeClientEmail(input.clientEmail),
        clientName,
        currency: normalizeProjectCurrency(input.currency),
        extraRevisionCostCents: input.extraRevisionCostCents,
        paymentStatus: input.paymentStatus ?? existing.paymentStatus,
        revisionLimit: input.revisionLimit,
        title,
        titleSourceLocale,
        updatedAt: new Date(),
        watermarkEnabled: input.watermarkEnabled,
        clientNameSourceLocale,
      });

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return this.buildProjectDTO(record, options.viewerLocale);
    }

    async getProjectEditLocks(id: string): Promise<ProjectEditLocksDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      const workflowSummary =
        await this.fileRepository.getProjectWorkflowSummary(existing.id);

      return {
        advancePaymentLocked: existing.advancePaymentStatus === ProjectPaymentStatus.Paid,
        amountLocked: workflowSummary.hasAnyApprovedRevision,
        hasApprovedRevision: workflowSummary.hasAnyApprovedRevision,
        hasDeliverables: workflowSummary.activeFileCount > 0,
        revisionSettingsLocked: workflowSummary.activeFileCount > 0,
      };
    }

    async getProjectShareComposer(
      id: string,
      options?: { baseUrl?: string; viewerLocale: string; expiryDays?: number },
    ): Promise<ProjectShareComposerDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      const record = await this.syncProjectShareRecord(existing, {
        baseUrl: options?.baseUrl,
      });

      return {
        project: await this.buildProjectDTO(record, options?.viewerLocale ?? "en", {
          baseUrl: options?.baseUrl,
          includeSharePassword: true,
        }),
        shareDraft: hasPersistedProjectShareAccess(record)
          ? toProjectShareDraft(record, options?.baseUrl)
          : createProjectShareDraft(record.id, options?.baseUrl, options?.expiryDays),
      };
    }

    async mutateProjectShare(
      id: string,
      input: ProjectShareLinkMutationInput,
      options?: { baseUrl?: string; viewerLocale: string; expiryDays?: number },
    ): Promise<ProjectShareComposerDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      const record = await this.syncProjectShareRecord(existing, {
        baseUrl: options?.baseUrl,
      });

      if (isShareAccessLockedAfterPayment(record)) {
        if (!hasPersistedProjectShareAccess(record)) {
          throw new AppError(
            "Share access is locked after payment.",
            409,
            "share_access_locked_after_payment",
          );
        }

        if (input.action === ProjectShareMutationAction.Regenerate) {
          throw new AppError(
            "Share access is locked after payment.",
            409,
            "share_access_locked_after_payment",
          );
        }

        if (
          input.passwordEnabled !== Boolean(record.sharePasswordHash) ||
          input.sharePassword
        ) {
          throw new AppError(
            "Share access is locked after payment.",
            409,
            "share_access_locked_after_payment",
          );
        }

        return {
          project: await this.buildProjectDTO(record, options?.viewerLocale ?? "en", {
            baseUrl: options?.baseUrl,
            includeSharePassword: true,
          }),
          shareDraft: toProjectShareDraft(record, options?.baseUrl),
        };
      }

      if (input.action === ProjectShareMutationAction.Regenerate) {
        if (!hasPersistedProjectShareAccess(record)) {
          return {
            project: await this.buildProjectDTO(record, options?.viewerLocale ?? "en", {
              includeSharePassword: true,
            }),
            shareDraft: createProjectShareDraft(record.id, options?.baseUrl, options?.expiryDays),
          };
        }

        const regeneratedRecord = await this.saveProjectShareRecord(record, input, {
          baseUrl: options?.baseUrl,
          regenerate: true,
          expiryDays: options?.expiryDays,
        });

        return {
          project: await this.buildProjectDTO(
            regeneratedRecord,
            options?.viewerLocale ?? "en",
            {
            includeSharePassword: true,
          }),
          shareDraft: toProjectShareDraft(regeneratedRecord),
        };
      }

      const updatedRecord = await this.saveProjectShareRecord(record, input, {
        baseUrl: options?.baseUrl,
        regenerate: false,
        expiryDays: options?.expiryDays,
      });

      return {
        project: await this.buildProjectDTO(
          updatedRecord,
          options?.viewerLocale ?? "en",
          { includeSharePassword: true },
        ),
        shareDraft: toProjectShareDraft(updatedRecord),
      };
    }

    async saveProjectShareClientEmail(
      id: string,
      shareClientEmail: string,
      viewerLocale: string,
    ): Promise<ProjectDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      const record = await this.repository.update(existing.id, {
        shareClientEmail: normalizeRequiredClientEmail(shareClientEmail),
        shareEmailAdded: true,
        updatedAt: new Date(),
      });

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return this.buildProjectDTO(record, viewerLocale);
    }

    async clearProjectShareClientEmail(
      id: string,
      viewerLocale: string,
    ): Promise<ProjectDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      const record = await this.repository.update(existing.id, {
        shareClientEmail: null,
        shareEmailAdded: false,
        updatedAt: new Date(),
      });

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return this.buildProjectDTO(record, viewerLocale);
    }

    async deleteProject(id: string): Promise<DeletedProjectDTO> {
      const existing = await this.repository.findByIdentifier(id);

      if (!existing) {
        throw new NotFoundAppError("Project not found.");
      }

      this.assertProjectIsActive(existing.status);

      while (true) {
        const batch = await this.fileRepository.findMany({
          includeTotal: false,
          limit: 100,
          page: 1,
          offset: 0,
          order: "asc",
          projectId: existing.id,
          sort: "createdAt",
        });

        if (batch.records.length === 0) {
          break;
        }

        for (const file of batch.records) {
          await fileService.deleteFile(file.id);
        }
      }

      const deletedAt = new Date();
      const record = await this.repository.softDelete(existing.id, deletedAt);

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return {
        deletedAt: deletedAt.toISOString(),
        id: record.id,
      };
    }

    async getProjectShareClientState(
      shareToken: string,
      sessionToken?: string | null,
      viewerLocale = "en",
    ): Promise<ProjectShareClientStateDTO> {
      const record = await this.findProjectByShareToken(shareToken);

      if (!record) {
        throw this.createShareUnavailableError();
      }

      const project = await this.syncProjectShareRecord(record);
      const shareStatus = resolveProjectShareStatus(project);

      if (!shareStatus) {
        throw this.createShareUnavailableError();
      }

      const accessGranted =
        isProjectShareAccessOpen(shareStatus) &&
        this.isProjectShareSessionAuthorized(project, shareToken, sessionToken);

      const resolvedText = await this.resolveProjectText(project, viewerLocale);

      return toProjectShareClientState(project, accessGranted, {
        titleText: resolvedText.titleText,
      });
    }

    async createProjectShareAccessSession(input: {
      email?: string | null;
      password?: string | null;
      shareToken: string;
      viewerLocale: string;
    }): Promise<{
      sessionToken: string;
      state: ProjectShareClientStateDTO;
    }> {
      const { email, password, shareToken } = input;
      const record = await this.findProjectByShareToken(shareToken);

      if (!record) {
        throw this.createShareUnavailableError();
      }

      let project = await this.syncProjectShareRecord(record);
      const shareStatus = resolveProjectShareStatus(project);

      if (!shareStatus) {
        throw this.createShareUnavailableError();
      }

      if (shareStatus === ProjectShareStatus.Revoked) {
        throw new AppError(
          "This link is no longer available. Request a new share link.",
          410,
          "share_link_revoked",
        );
      }

      if (shareStatus === ProjectShareStatus.Expired) {
        throw new AppError(
          "This share link has expired. Request a new share link.",
          410,
          "share_link_expired",
        );
      }

      if (shareStatus === ProjectShareStatus.Locked) {
        throw new AppError(
          "Too many incorrect password attempts. This link is temporarily locked.",
          423,
          "share_link_locked",
        );
      }

      if (isProjectShareEmailRequired(project) && !email?.trim()) {
        throw new AppError(
          "Enter a valid client email address.",
          400,
          "share_email_required",
          [
            {
              code: "share_email_required",
              message: "Enter a valid client email address.",
              path: "email",
            },
          ],
        );
      }

      if (!project.shareClientEmail?.trim() && email?.trim()) {
        const savedEmail = email.trim();
        const updated = await this.repository.update(project.id, {
          shareClientEmail: savedEmail,
          clientEmail: savedEmail,
          updatedAt: new Date(),
        });
        if (!updated) {
          throw this.createShareUnavailableError();
        }
        project = updated;
      } else if (project.shareClientEmail?.trim() && email?.trim()) {
        if (email.trim().toLowerCase() !== project.shareClientEmail.trim().toLowerCase()) {
          throw new AppError(
            "Incorrect email address.",
            400,
            "share_email_invalid",
            [
              {
                code: "share_email_invalid",
                message: "Incorrect email address.",
                path: "email",
              },
            ],
          );
        }
      }

      if (!project.sharePasswordHash) {
        const sessionToken = createProjectShareSessionToken({
          email: email?.trim() || null,
          expiresAt: project.shareExpiresAt!,
          shareToken,
          passwordVerified: true,
        });

        return {
          sessionToken,
          state: toProjectShareClientState(
            project,
            true,
            {
              titleText: (
                await this.resolveProjectText(project, input.viewerLocale)
              ).titleText,
            },
          ),
        };
      }

      if (!password?.trim()) {
        const sessionToken = createProjectShareSessionToken({
          email: email?.trim() || null,
          expiresAt: project.shareExpiresAt!,
          shareToken,
          passwordVerified: false,
        });

        return {
          sessionToken,
          state: toProjectShareClientState(
            project,
            false,
            {
              titleText: (
                await this.resolveProjectText(project, input.viewerLocale)
              ).titleText,
            },
          ),
        };
      }

      const isPasswordValid = await verifyProjectSharePassword(
        password,
        project.sharePasswordHash,
      );

      if (isPasswordValid) {
        const resetRecord =
          project.shareFailedAttempts > 0 || project.shareLockedUntil
            ? await this.repository.update(project.id, {
                shareFailedAttempts: 0,
                shareLockedUntil: null,
                shareStatus: ProjectShareStatus.PasswordRequired,
                updatedAt: new Date(),
              })
            : project;

        if (!resetRecord) {
          throw this.createShareUnavailableError();
        }

        const sessionToken = createProjectShareSessionToken({
          email: email?.trim() || null,
          expiresAt: resetRecord.shareExpiresAt!,
          shareToken,
          passwordVerified: true,
        });

        return {
          sessionToken,
          state: toProjectShareClientState(
            resetRecord,
            true,
            {
              titleText: (
                await this.resolveProjectText(resetRecord, input.viewerLocale)
              ).titleText,
            },
          ),
        };
      }

      const nextFailedAttempts = project.shareFailedAttempts + 1;
      const nextLockedUntil =
        nextFailedAttempts > PROJECT_SHARE_PASSWORD_MAX_ATTEMPTS
          ? new Date(
              Date.now() +
                PROJECT_SHARE_PASSWORD_LOCKOUT_MINUTES * 60 * 1000,
            )
          : null;
      const nextStatus =
        nextFailedAttempts > getProjectShareRevokeThreshold()
          ? ProjectShareStatus.Revoked
          : nextLockedUntil
            ? ProjectShareStatus.Locked
            : ProjectShareStatus.PasswordRequired;

      const updatedRecord = await this.repository.update(project.id, {
        shareFailedAttempts: nextFailedAttempts,
        shareLockedUntil:
          nextStatus === ProjectShareStatus.Locked ? nextLockedUntil : null,
        shareStatus: nextStatus,
        updatedAt: new Date(),
      });

      if (!updatedRecord) {
        throw new NotFoundAppError("Share link not found.");
      }

      if (nextStatus === ProjectShareStatus.Revoked) {
        throw new AppError(
          "This link is no longer available. Request a new share link.",
          410,
          "share_link_revoked",
        );
      }

      if (nextStatus === ProjectShareStatus.Locked) {
        throw new AppError(
          "Too many incorrect password attempts. This link is temporarily locked.",
          423,
          "share_link_locked",
        );
      }

      throw new AppError(
        "Incorrect password.",
        400,
        "invalid_share_password",
        [
          {
            code: "invalid_share_password",
            message: "Incorrect password.",
            path: "password",
          },
        ],
      );
    }

    private async buildProjectDTOs(
      records: ProjectRecord[],
      viewerLocale: string,
      options?: { includeSharePassword?: boolean; baseUrl?: string },
    ) {
      const resolvedTextById = await this.resolveProjectTextBatch(records, viewerLocale);

      return records.map((record) =>
        toProjectDTO(record, {
          baseUrl: options?.baseUrl,
          clientNameText:
            resolvedTextById.get(record.id)?.clientNameText,
          includeSharePassword: options?.includeSharePassword,
          titleText: resolvedTextById.get(record.id)?.titleText,
        }),
      );
    }

    private async buildProjectDTO(
      record: ProjectRecord,
      viewerLocale: string,
      options?: { includeSharePassword?: boolean; baseUrl?: string },
    ) {
      const [dto] = await this.buildProjectDTOs([record], viewerLocale, options);

      if (!dto) {
        throw new Error("Project translation mapping failed.");
      }

      return dto;
    }

    private async resolveProjectText(
      record: ProjectTextRecord,
      viewerLocale: string,
    ) {
      const resolved = await this.resolveProjectTextBatch([record], viewerLocale);

      return (
        resolved.get(record.id) ?? {
          clientNameText: createTranslatedTextDTO({
            originalText: record.clientName || "",
            sourceLocale: record.clientNameSourceLocale,
          }),
          titleText: createTranslatedTextDTO({
            originalText: record.title,
            sourceLocale: record.titleSourceLocale,
          }),
        }
      );
    }

    private async resolveProjectTextBatch(
      records: ProjectTextRecord[],
      viewerLocale: string,
    ) {
      void viewerLocale;

      return new Map<string, ResolvedProjectText>(
        records.map((record) => [
          record.id,
          {
            clientNameText: createTranslatedTextDTO({
              originalText: record.clientName || "",
              sourceLocale: record.clientNameSourceLocale,
            }),
            titleText: createTranslatedTextDTO({
              originalText: record.title,
              sourceLocale: record.titleSourceLocale,
            }),
          },
        ]),
      );
    }

    async requireProjectShareAccess(
      shareToken: string,
      sessionToken?: string | null,
    ): Promise<ProjectRecord> {
      const record = await this.findProjectByShareToken(shareToken);

      if (!record) {
        throw new AppError(
          "Unauthorized access.",
          401,
          "share_access_unauthorized",
        );
      }

      const project = await this.syncProjectShareRecord(record);
      const shareStatus = resolveProjectShareStatus(project);

      if (shareStatus === ProjectShareStatus.Revoked) {
        throw new AppError(
          "This link is no longer available. Request a new share link.",
          410,
          "share_link_revoked",
        );
      }

      if (shareStatus === ProjectShareStatus.Expired) {
        throw new AppError(
          "This share link has expired. Request a new share link.",
          410,
          "share_link_expired",
        );
      }

      if (shareStatus === ProjectShareStatus.Locked) {
        throw new AppError(
          "Too many incorrect password attempts. This link is temporarily locked.",
          423,
          "share_link_locked",
        );
      }

      if (
        !isProjectShareAccessOpen(shareStatus) ||
        !this.isProjectShareSessionAuthorized(project, shareToken, sessionToken)
      ) {
        throw new AppError(
          "Unauthorized access.",
          401,
          "share_access_unauthorized",
        );
      }

      return project;
    }

    private async assertProjectIdentityAvailable(input: {
      clientName: string;
      excludeId?: string;
      title: string;
    }) {
      const duplicate =
        await this.repository.findActiveByCanonicalTitleAndClientName(input);

      if (!duplicate) {
        return;
      }

      throw new AppError(
        "A project with this name already exists for this client.",
        409,
        "project_duplicate",
        [
          {
            code: "project_duplicate",
            message: "projectDuplicateForClient",
            path: "name",
          },
          {
            code: "project_duplicate",
            message: "projectDuplicateForClient",
            path: "clientName",
          },
        ],
      );
    }

    private async createUniqueProjectPublicId(title: string) {
      const baseId = slugifyProjectId(title);

      for (let attempt = 0; attempt < 500; attempt += 1) {
        const nextId = clampProjectId(
          baseId,
          attempt === 0 ? undefined : attempt + 1,
        );

        const existing = await this.repository.findByPublicId(nextId, {
          includeDeleted: true,
        });

        if (!existing) {
          return nextId;
        }
      }

      throw new Error("Could not generate a unique project id.");
    }

    private async findProjectByShareToken(shareToken: string) {
      return this.repository.findByShareToken(shareToken);
    }

    private createShareUnavailableError() {
      return new AppError(
        "This share link could not be opened.",
        404,
        "share_link_unavailable",
      );
    }

    private isProjectShareSessionAuthorized(
      project: Pick<ProjectRecord, "shareClientEmail" | "shareExpiresAt" | "sharePasswordHash">,
      shareToken: string,
      sessionToken?: string | null,
    ) {
      if (!sessionToken || !project.shareExpiresAt) {
        return false;
      }

      const payload = verifyProjectShareSessionToken(sessionToken);

      if (!payload || payload.t !== shareToken) {
        return false;
      }

      if (payload.e * 1000 <= Date.now()) {
        return false;
      }

      if (payload.e !== Math.floor(project.shareExpiresAt.getTime() / 1000)) {
        return false;
      }

      if (project.shareClientEmail?.trim()) {
        if (!payload.m?.trim() || payload.m.trim().toLowerCase() !== project.shareClientEmail.trim().toLowerCase()) {
          return false;
        }
      } else {
        if (!payload.m?.trim()) {
          return false;
        }
      }

      if (project.sharePasswordHash && !payload.p) {
        return false;
      }

      return true;
    }

    private async buildProjectShareSecurityFields(
      project: Pick<ProjectRecord, "sharePasswordCiphertext" | "sharePasswordHash">,
      input: Pick<ProjectShareLinkMutationInput, "passwordEnabled" | "sharePassword">,
      options?: { regenerate?: boolean },
    ) {
      if (!input.passwordEnabled) {
        return {
          sharePasswordCiphertext: null,
          sharePasswordHash: null,
          shareStatus: ProjectShareStatus.Active,
        } as const;
      }

      if (options?.regenerate && !input.sharePassword) {
        throw new ValidationAppError("Share password is required.");
      }

      if (input.sharePassword) {
        return {
          sharePasswordCiphertext: encryptProjectSharePassword(input.sharePassword),
          sharePasswordHash: await hashProjectSharePassword(input.sharePassword),
          shareStatus: ProjectShareStatus.PasswordRequired,
        } as const;
      }

      if (project.sharePasswordCiphertext && project.sharePasswordHash) {
        return {
          sharePasswordCiphertext: project.sharePasswordCiphertext,
          sharePasswordHash: project.sharePasswordHash,
          shareStatus: ProjectShareStatus.PasswordRequired,
        } as const;
      }

      if (project.sharePasswordHash || project.sharePasswordCiphertext) {
        throw new ValidationAppError(
          "The existing share password is unavailable. Regenerate the link to create a new password.",
        );
      }

      if (!input.sharePassword) {
        throw new ValidationAppError("Share password is required.");
      }
    }

    private async saveProjectShareRecord(
      project: ProjectRecord,
      input: ProjectShareLinkMutationInput,
      options?: { baseUrl?: string; regenerate?: boolean; expiryDays?: number },
    ) {
      const shouldRotateToken =
        options?.regenerate ||
        !hasPersistedProjectShareAccess(project) ||
        !project.shareToken ||
        !isSignedProjectShareToken(project.shareToken) ||
        project.shareExpiresAt == null ||
        project.shareExpiresAt.getTime() <= Date.now();

      const shareFields = shouldRotateToken
        ? createProjectShareAccessFields(
            options?.baseUrl,
            !hasPersistedProjectShareAccess(project) && !options?.regenerate
              ? input.shareToken
              : undefined,
            options?.expiryDays,
          )
        : {
            shareExpiresAt: project.shareExpiresAt!,
            shareToken: project.shareToken!,
            shareUrl: buildProjectShareUrl(project.shareToken!, options?.baseUrl),
          };

      const shareSecurityFields = await this.buildProjectShareSecurityFields(
        project,
        input,
        options,
      );

      const record = await this.repository.update(project.id, {
        ...shareFields,
        ...shareSecurityFields,
        shareFailedAttempts: 0,
        shareLockedUntil: null,
        updatedAt: new Date(),
      });

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return record;
    }

    private async syncProjectShareRecord(
      project: ProjectRecord,
      options?: { baseUrl?: string },
    ) {
      if (!hasPersistedProjectShareAccess(project)) {
        return project;
      }

      const nextShareStatus = resolveProjectShareStatus(project);
      const updates: Partial<ProjectRecord> & { updatedAt?: Date } = {};

      const nextShareUrl = buildProjectShareUrl(project.shareToken!, options?.baseUrl);
      if (project.shareUrl !== nextShareUrl) {
        updates.shareUrl = nextShareUrl;
      }

      if (
        project.shareLockedUntil &&
        project.shareLockedUntil.getTime() <= Date.now()
      ) {
        updates.shareFailedAttempts = 0;
        updates.shareLockedUntil = null;
      }

      if (nextShareStatus && project.shareStatus !== nextShareStatus) {
        updates.shareStatus = nextShareStatus;
      }

      if (Object.keys(updates).length === 0) {
        return project;
      }

      updates.updatedAt = new Date();

      const record = await this.repository.update(project.id, updates);

      if (!record) {
        throw new NotFoundAppError("Project not found.");
      }

      return record;
    }

    public async getPaidProjectsWithReviews() {
      return this.repository.findPaidProjectsWithReviews();
    }

    private assertProjectIsActive(status: string) {
      if (status !== ProjectStatus.Active) {
        throw new AppError(
          "Action not allowed: Project is no longer active.",
          400,
          "project_inactive"
        );
      }
    }
  }

  export const projectService = new ProjectService(
    new DrizzleProjectRepository(),
    new DrizzleFileRepository(),
  );
