import type { NotificationDTO } from "@/lib/dto/notifications";

export function resolveNotificationDestination(
  notification: NotificationDTO,
): string | null {
  const { fileId, projectId, href } = notification;

  // 1. File specific notifications (e.g., Client comment, Revision request)
  if (fileId && projectId) {
    return `/projects/${projectId}/files/${fileId}`;
  }

  // 2. Project specific notifications (e.g., File processing failure, New file uploaded)
  // Routes to the project's page which contains the deliverables/files list.
  if (projectId) {
    return `/projects/${projectId}`;
  }

  // 3. Generic system notifications or ones with a specific backend-provided href
  return href ?? null;
}
