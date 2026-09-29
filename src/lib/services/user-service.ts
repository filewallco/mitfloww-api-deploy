import crypto from "node:crypto";
import { and, count, eq, isNull, or } from "drizzle-orm";

import type { CreditPlanKey } from "@/lib/credits";
import { db } from "@/lib/db/client";
import {
  companies,
  creatorWorkProfiles,
  files,
  fileVersions,
  projectClientReviews,
  projects,
  testimonials,
  users,
  UserStatus,
  type NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/lib/db/schema";
import type { CompanyRecord, CreatorWorkProfileRecord, UserRecord } from "@/lib/db/schema";
import { ProjectPaymentStatus, toProjectPaymentStatusDbValue } from "@/lib/dto/projects";
import { AppError } from "@/lib/errors/app-error";
import { getPasswordValidationError } from "@/lib/auth/password";
import { storage } from "@/lib/storage";
import {
  buildCompanyLogoStorageKey,
  buildUserProfileAvatarStorageKey,
} from "@/lib/uploads/final-storage-keys";
import { validateImageUpload } from "@/lib/uploads/validate-image";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export type ProfileStats = {
  projectsCompleted: number;
  testimonialsReceived: number;
  averageRating: number;
  reviewCount: number;
  responseRate: string;
  memberSince: string;
  isVerified: boolean;
};

export type FullUserProfile = {
  user: UserRecord;
  company: CompanyRecord | null;
  workProfile: CreatorWorkProfileRecord | null;
  stats: ProfileStats;
};

export class UserService {
  async getUser(id: string): Promise<UserRecord> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (result.length === 0) {
      throw new AppError("User not found", 404, "user_not_found");
    }

    return result[0];
  }

  async getProfile(userId: string): Promise<FullUserProfile> {
    const user = await this.getUser(userId);

    // Fetch company
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)))
      .limit(1);

    // Compute stats
    const [completedProjectsResult] = await db
      .select({ count: count() })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.paymentStatus, ProjectPaymentStatus.Paid),
          isNull(projects.deletedAt),
        ),
      );

    const [testimonialsResult] = await db
      .select({ count: count() })
      .from(testimonials)
      .where(
        and(
          eq(testimonials.userId, userId),
          isNull(testimonials.deletedAt),
        ),
      );

    const reviews = await db
      .select({ rating: projectClientReviews.rating })
      .from(projectClientReviews)
      .innerJoin(projects, eq(projectClientReviews.projectId, projects.id))
      .where(
        and(
          eq(projects.userId, userId),
          isNull(projects.deletedAt),
        ),
      );

    const reviewCount = reviews.length;
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = reviewCount > 0 ? Number((totalRating / reviewCount).toFixed(1)) : 0;

    const memberSince = user.createdAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const stats: ProfileStats = {
      projectsCompleted: completedProjectsResult?.count ?? 0,
      testimonialsReceived: testimonialsResult?.count ?? 0,
      averageRating,
      reviewCount,
      responseRate: "",
      memberSince,
      isVerified: user.isVerified,
    };

    const [workProfile] = await db
      .select()
      .from(creatorWorkProfiles)
      .where(eq(creatorWorkProfiles.userId, userId))
      .limit(1);

    return {
      user,
      company: company ?? null,
      workProfile: workProfile ?? null,
      stats,
    };
  }

  async updateAccount(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      countryCode?: string;
      city?: string;
      state?: string;
      postcode?: string;
      country?: string;
      roleTitle?: string;
      bio?: string;
    },
  ): Promise<UserRecord> {
    const displayName =
      data.firstName || data.lastName
        ? `${data.firstName || ""} ${data.lastName || ""}`.trim()
        : undefined;

    const [updated] = await db
      .update(users)
      .set({
        ...data,
        displayName: displayName || undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new AppError("User not found", 404, "user_not_found");
    }

    return updated;
  }

  async updateCompany(
    userId: string,
    data: {
      name?: string;
      tagline?: string;
      industry?: string;
      website?: string;
      email?: string;
      yearFounded?: string;
      companySize?: string;
    },
  ): Promise<CompanyRecord> {
    let [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)))
      .limit(1);

    if (!company) {
      if (!data.name?.trim()) {
        throw new AppError("Company name is required", 400, "company_name_required");
      }

      const [newCompany] = await db
        .insert(companies)
        .values({
          userId,
          name: data.name.trim(),
          tagline: data.tagline,
          industry: data.industry,
          website: data.website,
          email: data.email,
          yearFounded: data.yearFounded || "2024",
          companySize: data.companySize || "2 - 10 Members",
        })
        .returning();
      return newCompany;
    }

    const [updated] = await db
      .update(companies)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id))
      .returning();

    return updated;
  }

  async uploadAvatar(
    userId: string,
    input: { buffer: Buffer; filename: string; mimeType?: string | null },
  ): Promise<{ avatarUrl: string; storageKey: string }> {
    const validated = validateImageUpload(input);

    const [existingUser] = await db
      .select({ avatarStorageKey: users.avatarStorageKey })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const oldAvatarKey = existingUser?.avatarStorageKey;

    const storageKey = buildUserProfileAvatarStorageKey({
      userId,
      extension: validated.extension,
      timestamp: Date.now(),
    });

    await storage.uploadFile({
      key: storageKey,
      body: validated.buffer,
      contentType: validated.mimeType,
    });

    const publicBase = process.env.STORAGE_PROVIDER !== "local" ? process.env.R2_PUBLIC_BASE_URL : undefined;
    const avatarUrl = publicBase
      ? `${publicBase.replace(/\/+$/, "")}/${storageKey}`
      : `/api/profile/media?key=${encodeURIComponent(storageKey)}`;

    await db
      .update(users)
      .set({
        avatarStorageKey: storageKey,
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Delete old avatar and clean up any orphaned avatar files
    if (oldAvatarKey && oldAvatarKey !== storageKey) {
      try {
        await storage.deleteFile({ key: oldAvatarKey });
      } catch {
        // Non-fatal
      }
    }
    try {
      const existingFiles = await storage.listFiles({ prefix: `users/${userId}/userprofile/avatar_` });
      for (const obj of existingFiles.objects) {
        if (obj.key !== storageKey) {
          await storage.deleteFile({ key: obj.key }).catch(() => {});
        }
      }
    } catch {
      // Non-fatal
    }

    return { avatarUrl, storageKey };
  }

  async uploadCompanyLogo(
    userId: string,
    input: { buffer: Buffer; filename: string; mimeType?: string | null },
  ): Promise<{ logoUrl: string; storageKey: string }> {
    const validated = validateImageUpload(input);

    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)))
      .limit(1);

    if (!company) {
      throw new AppError("Company profile not found", 404, "company_not_found");
    }

    const oldLogoKey = company.logoStorageKey;

    const storageKey = buildCompanyLogoStorageKey({
      userId,
      extension: validated.extension,
      timestamp: Date.now(),
    });

    await storage.uploadFile({
      key: storageKey,
      body: validated.buffer,
      contentType: validated.mimeType,
    });

    const publicBase = process.env.STORAGE_PROVIDER !== "local" ? process.env.R2_PUBLIC_BASE_URL : undefined;
    const logoUrl = publicBase
      ? `${publicBase.replace(/\/+$/, "")}/${storageKey}`
      : `/api/profile/media?key=${encodeURIComponent(storageKey)}`;

    await db
      .update(companies)
      .set({
        logoStorageKey: storageKey,
        logoUrl,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, company.id));

    // Delete old logo and clean up any duplicate/orphaned company logo files
    if (oldLogoKey && oldLogoKey !== storageKey) {
      try {
        await storage.deleteFile({ key: oldLogoKey });
      } catch {
        // Non-fatal
      }
    }
    try {
      const existingCompanyFiles = await storage.listFiles({ prefix: `users/${userId}/company/` });
      for (const obj of existingCompanyFiles.objects) {
        if (obj.key !== storageKey) {
          await storage.deleteFile({ key: obj.key }).catch(() => {});
        }
      }
      const existingProfileLogos = await storage.listFiles({ prefix: `users/${userId}/userprofile/company_logo_` });
      for (const obj of existingProfileLogos.objects) {
        if (obj.key !== storageKey) {
          await storage.deleteFile({ key: obj.key }).catch(() => {});
        }
      }
    } catch {
      // Non-fatal
    }

    return { logoUrl, storageKey };
  }

  async removeCompanyLogo(userId: string): Promise<void> {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)))
      .limit(1);

    if (company && company.logoStorageKey) {
      try {
        await storage.deleteFile({ key: company.logoStorageKey });
      } catch {
        // Non-fatal
      }

      await db
        .update(companies)
        .set({
          logoStorageKey: null,
          logoUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, company.id));
    }
  }

  async deactivateAccount(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        status: "deactivated",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async softDeleteAccount(userId: string): Promise<void> {
    const now = new Date();

    // 1. Soft delete user
    await db
      .update(users)
      .set({
        status: UserStatus.Deactivated,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // 2. Soft delete company
    await db
      .update(companies)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)));

    // 3. Soft delete projects
    await db
      .update(projects)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)));

    // 4. Soft delete testimonials
    await db
      .update(testimonials)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(eq(testimonials.userId, userId), isNull(testimonials.deletedAt)));
  }

  async getMediaStream(storageKey: string) {
    return await storage.getFile({ key: storageKey });
  }

  async updateUserPlan(id: string, planKey: CreditPlanKey): Promise<UserRecord> {
    const [user] = await db
      .update(users)
      .set({ planKey, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new AppError("User not found", 404, "user_not_found");
    }

    return user;
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await this.getUser(userId);
    const prefs = user.notificationPreferences;
    if (!prefs) return DEFAULT_NOTIFICATION_PREFERENCES;
    return {
      email: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.email,
        ...(prefs.email || {}),
      },
      inApp: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.inApp,
        ...(prefs.inApp || {}),
      },
    };
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    const [user] = await db
      .update(users)
      .set({
        notificationPreferences: preferences,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new AppError("User not found", 404, "user_not_found");
    }

    return user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES;
  }

  async updateUserSettings(
    id: string,
    settings: { clientShareLinkExpiryDays?: number },
  ): Promise<UserRecord> {
    const updates: Partial<UserRecord> = { updatedAt: new Date() };
    if (settings.clientShareLinkExpiryDays !== undefined) {
      updates.clientShareLinkExpiryDays = settings.clientShareLinkExpiryDays;
    }

    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new AppError("User not found", 404, "user_not_found");
    }

    return user;
  }

  // Temporary lightweight auth methods
  async signup(input: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserRecord> {
    const passwordError = getPasswordValidationError(input.password);
    if (passwordError) {
      throw new AppError(passwordError, 400, "invalid_password");
    }

    const existing = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, input.email.toLowerCase().trim()),
          eq(users.username, input.username.toLowerCase().trim()),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError("User with this email or username already exists.", 400, "user_exists");
    }

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(input.password);
    const displayName =
      input.firstName || input.lastName
        ? `${input.firstName || ""} ${input.lastName || ""}`.trim()
        : input.username;

    const [newUser] = await db
      .insert(users)
      .values({
        id,
        email: input.email.toLowerCase().trim(),
        username: input.username.toLowerCase().trim(),
        passwordHash,
        firstName: input.firstName || "",
        lastName: input.lastName || "",
        displayName,
        planKey: "free",
        status: "active",
      })
      .returning();

    // Create default company
    await db.insert(companies).values({
      userId: id,
      name: `${displayName}'s Company`,
      tagline: "Designing Ideas, Delivering Impact",
      industry: "Design & Creative",
      yearFounded: new Date().getFullYear().toString(),
      companySize: "1 - 10 Members",
    });

    return newUser;
  }

  async login(input: {
    usernameOrEmail: string;
    password: string;
  }): Promise<UserRecord> {
    const lookup = input.usernameOrEmail.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          or(eq(users.email, lookup), eq(users.username, lookup)),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new AppError("Invalid credentials", 401, "invalid_credentials");
    }

    const isValid = verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new AppError("Invalid credentials", 401, "invalid_credentials");
    }

    if (user.status === UserStatus.Deactivated || user.status === UserStatus.Suspended) {
      throw new AppError("Account has been deleted.", 403, "account_deleted");
    }

    return user;
  }

  async resetPassword(input: {
    usernameOrEmail: string;
    newPassword: string;
  }): Promise<UserRecord> {
    const passwordError = getPasswordValidationError(input.newPassword);
    if (passwordError) {
      throw new AppError(passwordError, 400, "invalid_password");
    }

    const lookup = input.usernameOrEmail.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          or(eq(users.email, lookup), eq(users.username, lookup)),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (!user) {
      throw new AppError("User not found with this username or email.", 404, "user_not_found");
    }

    if (user.status === UserStatus.Deactivated || user.status === UserStatus.Suspended) {
      throw new AppError("Account has been deleted.", 403, "account_deleted");
    }

    const passwordHash = hashPassword(input.newPassword);
    const [updatedUser] = await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    return updatedUser;
  }

  async getWorkProfile(userId: string): Promise<CreatorWorkProfileRecord | null> {
    const [profile] = await db
      .select()
      .from(creatorWorkProfiles)
      .where(eq(creatorWorkProfiles.userId, userId))
      .limit(1);
    return profile || null;
  }

  async updateWorkProfile(
    userId: string,
    input: {
      primaryProfession: string;
      customProfession?: string | null;
      yearsOfExperience: string;
      companyAddress?: string | null;
    },
  ): Promise<CreatorWorkProfileRecord> {
    const [existing] = await db
      .select()
      .from(creatorWorkProfiles)
      .where(eq(creatorWorkProfiles.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(creatorWorkProfiles)
        .set({
          primaryProfession: input.primaryProfession,
          customProfession: input.customProfession ?? null,
          yearsOfExperience: input.yearsOfExperience,
          companyAddress: input.companyAddress ?? null,
          updatedAt: new Date(),
        })
        .where(eq(creatorWorkProfiles.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(creatorWorkProfiles)
      .values({
        userId,
        primaryProfession: input.primaryProfession,
        customProfession: input.customProfession ?? null,
        yearsOfExperience: input.yearsOfExperience,
        companyAddress: input.companyAddress ?? null,
      })
      .returning();
    return created;
  }
}

export const userService = new UserService();
