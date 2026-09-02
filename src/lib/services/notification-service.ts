import { defaultLocale, matchSupportedLocale, type AppLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { NotFoundAppError } from "@/lib/errors/app-error";
import {
  buildPaginationMeta,
  buildPaginationParams,
  type PaginatedResult,
} from "@/lib/query/pagination";
import {
  DrizzleFileRepository,
  type FileRepository,
} from "@/lib/repositories/file-repository";
import {
  DrizzleNotificationRepository,
  type CreateNotificationRecordInput,
  type NotificationRepository,
} from "@/lib/repositories/notification-repository";
import {
  DrizzleProjectRepository,
  type ProjectRepository,
} from "@/lib/repositories/project-repository";
import type {
  MarkAllNotificationsReadResultDTO,
  NotificationDTO,
} from "@/lib/dto/notifications";
import type { NotificationRecord } from "@/lib/db/schema";
import type { NotificationListQueryParams } from "@/lib/validation/notifications";

type NotificationTranslationDependencies = {
  fileNamesById: Map<string, string>;
  projectTitlesById: Map<string, string>;
};

function resolveAppLocale(locale?: string | null): AppLocale {
  return matchSupportedLocale(locale) ?? defaultLocale;
}

function replaceTemplate(
  template: string,
  variables: Record<string, string>,
) {
  return Object.entries(variables).reduce(
    (value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement),
    template,
  );
}

function getNotificationProjectSuffix(locale: AppLocale, projectTitle: string) {
  if (!projectTitle) {
    return "";
  }

  const messages = getMessages(locale).common;
  return replaceTemplate(messages.notificationProjectSuffix, {
    projectTitle,
  });
}

function resolveNotificationText(input: {
  dependencies: NotificationTranslationDependencies;
  locale: AppLocale;
  notification: NotificationRecord;
  rawTextById: Map<string, { description: string; title: string }>;
}) {
  const { dependencies, locale, notification, rawTextById } = input;
  const rawText = rawTextById.get(notification.id);
  const rawDescription = rawText?.description ?? notification.description ?? "";
  const rawTitle = rawText?.title ?? notification.title ?? "";

  if (!notification.titleKey && !notification.descriptionKey) {
    return {
      description: rawDescription,
      title: rawTitle,
    };
  }

  const messages = getMessages(locale).common;
  const fileName = notification.fileId
    ? dependencies.fileNamesById.get(notification.fileId) ??
      messages.notificationFileFallbackLabel
    : messages.notificationFileFallbackLabel;
  const projectTitle = notification.projectId
    ? dependencies.projectTitlesById.get(notification.projectId) ?? ""
    : "";
  const projectSuffix = getNotificationProjectSuffix(locale, projectTitle);

  const resolveKey = (key: string | null | undefined) => {
    switch (key) {
      case "notification.fileProcessingCompletedTitle":
        return messages.notificationFileProcessingCompletedTitle;
      case "notification.fileProcessingFailedTitle":
        return messages.notificationFileProcessingFailedTitle;
      case "notification.fileProcessingCompletedDescription":
        return replaceTemplate(
          messages.notificationFileProcessingCompletedDescription,
          { fileName, projectSuffix },
        );
      case "notification.fileProcessingFailedDescription":
        return replaceTemplate(
          messages.notificationFileProcessingFailedDescription,
          { fileName, projectSuffix },
        );
      case "notification.fileProcessingStartFailedDescription":
        return replaceTemplate(
          messages.notificationFileProcessingStartFailedDescription,
          { fileName, projectSuffix },
        );
      case "notification.clientRevisionMessageTitle":
        return messages.notificationClientRevisionMessageTitle;
      case "notification.clientRevisionMessageDescription":
        return replaceTemplate(
          messages.notificationClientRevisionMessageDescription,
          { fileName, projectSuffix },
        );
      case "notification.clientRevisionReportedTitle":
        return messages.notificationClientRevisionReportedTitle;
      case "notification.clientRevisionReportedDescription":
        return replaceTemplate(
          messages.notificationClientRevisionReportedDescription,
          { fileName, projectSuffix },
        );
      case "notification.clientFinalDraftReportedTitle":
        return messages.notificationClientFinalDraftReportedTitle;
      case "notification.clientFinalDraftReportedDescription":
        return replaceTemplate(
          messages.notificationClientFinalDraftReportedDescription,
          { fileName, projectSuffix },
        );
      case "notification.clientRevisionApprovedTitle":
        return messages.notificationClientRevisionApprovedTitle;
      case "notification.clientRevisionApprovedDescription":
        return replaceTemplate(
          messages.notificationClientRevisionApprovedDescription,
          { fileName, projectSuffix },
        );
      case "notification.clientApprovalCanceledTitle":
        return messages.notificationClientApprovalCanceledTitle;
      case "notification.clientApprovalCanceledDescription":
        return replaceTemplate(
          messages.notificationClientApprovalCanceledDescription,
          { fileName, projectSuffix },
        );
      default:
        return null;
    }
  };

  return {
    description:
      resolveKey(notification.descriptionKey) ??
      rawDescription,
    title:
      resolveKey(notification.titleKey) ??
      rawTitle,
  };
}

function toNotificationDTO(
  notification: NotificationRecord,
  text: { description: string; title: string },
): NotificationDTO {
  return {
    category: notification.category,
    createdAt: notification.createdAt.toISOString(),
    description: text.description,
    fileId: notification.fileId,
    href: notification.fileId && notification.projectId
      ? `/projects/${notification.projectId}/files/${notification.fileId}`
      : notification.projectId
        ? `/projects/${notification.projectId}`
        : null,
    id: notification.id,
    metadata: notification.metadata,
    projectId: notification.projectId,
    read: notification.readAt != null,
    readAt: notification.readAt?.toISOString() ?? null,
    title: text.title,
    updatedAt: notification.updatedAt.toISOString(),
  };
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly fileRepository: FileRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async createNotification(
    input: CreateNotificationRecordInput,
  ): Promise<NotificationDTO | null> {
    const record = await this.repository.create(input);
    return record
      ? this.resolveNotificationDTO(record, defaultLocale)
      : null;
  }

  async listNotifications(
    params: NotificationListQueryParams,
    viewerLocale: string,
  ): Promise<
    PaginatedResult<NotificationDTO> & {
      unreadCount: number | null;
    }
  > {
    const pagination = buildPaginationParams({
      limit: params.limit,
      page: params.page,
    });
    const [result, unreadCount] = await Promise.all([
      this.repository.findManyPaginated({
        ...params,
        ...pagination,
      }),
      params.includeTotal === false
        ? Promise.resolve(null)
        : this.repository.count({ unreadOnly: true }),
    ]);
    const items = await this.resolveNotificationDTOs(
      result.records,
      viewerLocale,
    );

    return {
      items,
      pagination:
        result.total == null
          ? null
          : buildPaginationMeta({
              limit: pagination.limit,
              page: pagination.page,
              total: result.total,
            }),
      unreadCount,
    };
  }

  async markAllNotificationsRead(): Promise<MarkAllNotificationsReadResultDTO> {
    const markedCount = await this.repository.markAllRead(new Date());

    return {
      markedCount,
    };
  }

  async markNotificationRead(
    id: string,
    viewerLocale: string,
  ): Promise<NotificationDTO> {
    const record = await this.repository.markRead(id, new Date());

    if (!record) {
      throw new NotFoundAppError("Notification not found.");
    }

    return this.resolveNotificationDTO(record, viewerLocale);
  }

  private async resolveNotificationDTO(
    record: NotificationRecord,
    viewerLocale: string,
  ) {
    const [dto] = await this.resolveNotificationDTOs([record], viewerLocale);

    if (!dto) {
      throw new Error("Notification translation mapping failed.");
    }

    return dto;
  }

  private async resolveNotificationDTOs(
    records: NotificationRecord[],
    viewerLocale: string,
  ) {
    const locale = resolveAppLocale(viewerLocale);
    const dependencies = await this.resolveNotificationDependencies(records);
    const rawTextById = this.resolveNotificationRawText(records);

    return records.map((record) =>
      toNotificationDTO(
        record,
        resolveNotificationText({
          dependencies,
          locale,
          notification: record,
          rawTextById,
        }),
      ),
    );
  }

  private async resolveNotificationDependencies(
    records: NotificationRecord[],
  ): Promise<NotificationTranslationDependencies> {
    const fileIds = Array.from(
      new Set(records.map((record) => record.fileId).filter(Boolean)),
    ) as string[];
    const projectIds = Array.from(
      new Set(records.map((record) => record.projectId).filter(Boolean)),
    ) as string[];
    const [files, projects] = await Promise.all([
      Promise.all(fileIds.map((id) => this.fileRepository.findById(id))),
      Promise.all(projectIds.map((id) => this.projectRepository.findById(id))),
    ]);

    return {
      fileNamesById: new Map(
        files
          .filter((record): record is NonNullable<(typeof files)[number]> => Boolean(record))
          .map((record) => [record.id, record.name] as const),
      ),
      projectTitlesById: new Map(
        projects
          .filter(
            (record): record is NonNullable<(typeof projects)[number]> =>
              Boolean(record),
          )
          .map((record) => [record.id, record.title] as const),
      ),
    };
  }

  private resolveNotificationRawText(records: NotificationRecord[]) {
    return new Map<string, { description: string; title: string }>(
      records.map((record) => [
        record.id,
        {
          description: record.description ?? "",
          title: record.title ?? "",
        },
      ]),
    );
  }
}

export const notificationService = new NotificationService(
  new DrizzleNotificationRepository(),
  new DrizzleFileRepository(),
  new DrizzleProjectRepository(),
);