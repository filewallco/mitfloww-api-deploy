import { eq } from "drizzle-orm";

import type { CreditPlanKey } from "@/lib/credits";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { UserRecord } from "@/lib/db/schema";

export class UserService {
  async getUser(id: string): Promise<UserRecord> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (result.length === 0) {
      // Create user if not exists since we are migrating from hardcoded ID
      const [newUser] = await db
        .insert(users)
        .values({
          id,
          planKey: "free",
        })
        .returning();

      return newUser;
    }

    return result[0];
  }

  async updateUserPlan(id: string, planKey: CreditPlanKey): Promise<UserRecord> {
    const [user] = await db
      .update(users)
      .set({ planKey, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      // If user doesn't exist yet, we create it with the requested plan
      const [newUser] = await db
        .insert(users)
        .values({
          id,
          planKey,
        })
        .returning();

      return newUser;
    }

    return user;
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
      throw new Error("User not found");
    }

    return user;
  }
}

export const userService = new UserService();
