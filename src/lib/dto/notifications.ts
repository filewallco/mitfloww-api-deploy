import type { AppNotificationCategory, NotificationMetadata } from "@/lib/db/schema";

export type NotificationDTO = {
  category: AppNotificationCategory;
  createdAt: string;
  description: string;
  fileId: string | null;
  href: string | null;
  id: string;
  metadata: NotificationMetadata;
  projectId: string | null;
  read: boolean;
  readAt: string | null;
  title: string;
  updatedAt: string;
};

export type MarkAllNotificationsReadResultDTO = {
  markedCount: number;
};