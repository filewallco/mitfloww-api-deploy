import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  dashboardPresets,
  dashboardPresetItems,
  dashboardUserState,
  type DashboardPresetRecord,
  type DashboardPresetItemRecord,
  type DashboardUserStateRecord,
} from "@/lib/db/schema";
import {
  BUILT_IN_PRESET_KEYS,
  DEFAULT_PRESET_LAYOUTS,
  isValidWidgetKey,
  isBuiltInPresetKey,
  type BuiltInPresetKey,
  type DashboardWidgetKey,
  type PresetItemDefinition,
} from "@/lib/dashboard/widget-registry";
import { AppError, ValidationAppError, NotFoundAppError } from "@/lib/errors/app-error";
import { createScopedLogger } from "@/lib/logger";

const scopedLogger = createScopedLogger("dashboard-preset-service");

export interface PresetWithItems {
  id: string;
  name: string;
  presetKey: BuiltInPresetKey | null;
  isSystem: boolean;
  version: number;
  items: PresetItemDefinition[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserDashboardPresetsResponse {
  activePresetKey: string;
  activePresetId: string | null;
  version: number;
  presets: PresetWithItems[];
}

export class DashboardPresetService {
  async getOrCreateUserState(userId: string): Promise<DashboardUserStateRecord> {
    const [state] = await db
      .select()
      .from(dashboardUserState)
      .where(eq(dashboardUserState.userId, userId))
      .limit(1);

    if (state) return state;

    const [created] = await db
      .insert(dashboardUserState)
      .values({
        userId,
        activePresetKey: "all",
        activePresetId: null,
        version: 1,
      })
      .onConflictDoNothing()
      .returning();

    if (created) return created;

    const [fallback] = await db
      .select()
      .from(dashboardUserState)
      .where(eq(dashboardUserState.userId, userId))
      .limit(1);

    return fallback || {
      userId,
      activePresetKey: "all",
      activePresetId: null,
      version: 1,
      updatedAt: new Date(),
    };
  }

  async setActivePreset(
    userId: string,
    input: { activePresetKey: string; activePresetId?: string | null }
  ): Promise<DashboardUserStateRecord> {
    let resolvedId: string | null = null;
    let resolvedKey = input.activePresetKey;

    if (isBuiltInPresetKey(resolvedKey)) {
      resolvedId = null;
    } else if (resolvedKey === "custom" || input.activePresetId) {
      if (!input.activePresetId) {
        throw new ValidationAppError("Preset ID is required for custom presets.");
      }
      const [customPreset] = await db
        .select()
        .from(dashboardPresets)
        .where(
          and(
            eq(dashboardPresets.id, input.activePresetId),
            eq(dashboardPresets.userId, userId)
          )
        )
        .limit(1);

      if (!customPreset) {
        throw new NotFoundAppError("Custom preset not found.");
      }
      resolvedId = customPreset.id;
      resolvedKey = "custom";
    } else {
      resolvedKey = "all";
      resolvedId = null;
    }

    const [updated] = await db
      .insert(dashboardUserState)
      .values({
        userId,
        activePresetKey: resolvedKey,
        activePresetId: resolvedId,
        version: 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dashboardUserState.userId,
        set: {
          activePresetKey: resolvedKey,
          activePresetId: resolvedId,
          version: sql`${dashboardUserState.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return updated;
  }

  async getUserPresets(userId: string): Promise<UserDashboardPresetsResponse> {
    const userState = await this.getOrCreateUserState(userId);

    const userPresetRows = await db
      .select()
      .from(dashboardPresets)
      .where(eq(dashboardPresets.userId, userId));

    const presetIds = userPresetRows.map((p) => p.id);
    let allItems: DashboardPresetItemRecord[] = [];
    if (presetIds.length > 0) {
      allItems = await db
        .select()
        .from(dashboardPresetItems)
        .orderBy(dashboardPresetItems.position);
    }

    const itemsByPresetId = new Map<string, PresetItemDefinition[]>();
    for (const item of allItems) {
      if (!itemsByPresetId.has(item.presetId)) {
        itemsByPresetId.set(item.presetId, []);
      }
      if (isValidWidgetKey(item.widgetKey)) {
        itemsByPresetId.get(item.presetId)!.push({
          widgetKey: item.widgetKey,
          position: item.position,
          isVisible: item.isVisible,
        });
      }
    }

    const builtInOverrides = new Map<string, DashboardPresetRecord>();
    const customPresets: PresetWithItems[] = [];

    for (const row of userPresetRows) {
      if (row.presetKey && isBuiltInPresetKey(row.presetKey)) {
        builtInOverrides.set(row.presetKey, row);
      } else {
        const items = itemsByPresetId.get(row.id) || [...DEFAULT_PRESET_LAYOUTS.all];
        customPresets.push({
          id: row.id,
          name: row.name,
          presetKey: null,
          isSystem: false,
          version: row.version,
          items,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    const builtInPresets: PresetWithItems[] = (["all", "project", "assets"] as const).map(
      (key) => {
        const override = builtInOverrides.get(key);
        const name = key === "all" ? "All" : key === "project" ? "Project" : "Assets";
        if (override) {
          const items = itemsByPresetId.get(override.id) || [...DEFAULT_PRESET_LAYOUTS[key]];
          return {
            id: override.id,
            name,
            presetKey: key,
            isSystem: true,
            version: override.version,
            items,
            createdAt: override.createdAt.toISOString(),
            updatedAt: override.updatedAt.toISOString(),
          };
        }
        return {
          id: `builtin-${key}`,
          name,
          presetKey: key,
          isSystem: true,
          version: 1,
          items: [...DEFAULT_PRESET_LAYOUTS[key]],
        };
      }
    );

    return {
      activePresetKey: userState.activePresetKey,
      activePresetId: userState.activePresetId,
      version: userState.version,
      presets: [...builtInPresets, ...customPresets],
    };
  }

  async savePresetLayout(
    userId: string,
    presetIdOrKey: string,
    items: PresetItemDefinition[]
  ): Promise<PresetWithItems> {
    this.validateItems(items);

    return await db.transaction(async (tx) => {
      let targetPreset: DashboardPresetRecord;

      if (isBuiltInPresetKey(presetIdOrKey)) {
        const [existing] = await tx
          .select()
          .from(dashboardPresets)
          .where(
            and(
              eq(dashboardPresets.userId, userId),
              eq(dashboardPresets.presetKey, presetIdOrKey)
            )
          )
          .limit(1);

        if (existing) {
          const [updated] = await tx
            .update(dashboardPresets)
            .set({
              version: sql`${dashboardPresets.version} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(dashboardPresets.id, existing.id))
            .returning();
          targetPreset = updated;
        } else {
          const name =
            presetIdOrKey === "all"
              ? "All"
              : presetIdOrKey === "project"
              ? "Project"
              : "Assets";
          const [created] = await tx
            .insert(dashboardPresets)
            .values({
              userId,
              name,
              presetKey: presetIdOrKey,
              isSystem: true,
              version: 1,
            })
            .returning();
          targetPreset = created;
        }
      } else {
        const [existing] = await tx
          .select()
          .from(dashboardPresets)
          .where(
            and(
              eq(dashboardPresets.id, presetIdOrKey),
              eq(dashboardPresets.userId, userId)
            )
          )
          .limit(1);

        if (!existing) {
          throw new NotFoundAppError("Preset not found.");
        }

        const [updated] = await tx
          .update(dashboardPresets)
          .set({
            version: sql`${dashboardPresets.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(dashboardPresets.id, existing.id))
          .returning();
        targetPreset = updated;
      }

      await tx
        .delete(dashboardPresetItems)
        .where(eq(dashboardPresetItems.presetId, targetPreset.id));

      const sortedItems = [...items].sort((a, b) => a.position - b.position);
      await tx.insert(dashboardPresetItems).values(
        sortedItems.map((item, index) => ({
          presetId: targetPreset.id,
          widgetKey: item.widgetKey,
          position: index,
          isVisible: item.isVisible,
        }))
      );

      await tx
        .insert(dashboardUserState)
        .values({
          userId,
          activePresetKey: targetPreset.presetKey || "custom",
          activePresetId: targetPreset.presetKey ? null : targetPreset.id,
          version: 1,
        })
        .onConflictDoUpdate({
          target: dashboardUserState.userId,
          set: {
            version: sql`${dashboardUserState.version} + 1`,
            updatedAt: new Date(),
          },
        });

      return {
        id: targetPreset.id,
        name: targetPreset.name,
        presetKey: (targetPreset.presetKey as BuiltInPresetKey) || null,
        isSystem: targetPreset.isSystem,
        version: targetPreset.version,
        items: sortedItems.map((item, index) => ({
          widgetKey: item.widgetKey,
          position: index,
          isVisible: item.isVisible,
        })),
        createdAt: targetPreset.createdAt.toISOString(),
        updatedAt: targetPreset.updatedAt.toISOString(),
      };
    });
  }

  async createCustomPreset(
    userId: string,
    input: { name: string; items?: PresetItemDefinition[] }
  ): Promise<PresetWithItems> {
    const trimmedName = input.name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      throw new ValidationAppError("Preset name must be between 1 and 100 characters.");
    }
    const lower = trimmedName.toLowerCase();
    if (lower === "all" || lower === "project" || lower === "assets") {
      throw new ValidationAppError("Preset name cannot match built-in preset names.");
    }

    const [existing] = await db
      .select({ id: dashboardPresets.id })
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.userId, userId),
          sql`lower(${dashboardPresets.name}) = ${lower}`
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationAppError(`A preset named "${trimmedName}" already exists.`);
    }

    const rawItems = input.items && input.items.length > 0 ? input.items : DEFAULT_PRESET_LAYOUTS.all;
    this.validateItems(rawItems);
    const sortedItems = [...rawItems].sort((a, b) => a.position - b.position);

    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(dashboardPresets)
        .values({
          userId,
          name: trimmedName,
          presetKey: null,
          isSystem: false,
          version: 1,
        })
        .returning();

      await tx.insert(dashboardPresetItems).values(
        sortedItems.map((item, index) => ({
          presetId: created.id,
          widgetKey: item.widgetKey,
          position: index,
          isVisible: item.isVisible,
        }))
      );

      await tx
        .insert(dashboardUserState)
        .values({
          userId,
          activePresetKey: "custom",
          activePresetId: created.id,
          version: 1,
        })
        .onConflictDoUpdate({
          target: dashboardUserState.userId,
          set: {
            activePresetKey: "custom",
            activePresetId: created.id,
            version: sql`${dashboardUserState.version} + 1`,
            updatedAt: new Date(),
          },
        });

      return {
        id: created.id,
        name: created.name,
        presetKey: null,
        isSystem: false,
        version: created.version,
        items: sortedItems.map((item, index) => ({
          widgetKey: item.widgetKey,
          position: index,
          isVisible: item.isVisible,
        })),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async deleteCustomPreset(userId: string, presetId: string): Promise<{ deletedId: string }> {
    const [preset] = await db
      .select()
      .from(dashboardPresets)
      .where(
        and(
          eq(dashboardPresets.id, presetId),
          eq(dashboardPresets.userId, userId)
        )
      )
      .limit(1);

    if (!preset) {
      throw new NotFoundAppError("Preset not found.");
    }

    if (preset.isSystem || preset.presetKey) {
      throw new ValidationAppError("Cannot delete built-in presets.");
    }

    await db.transaction(async (tx) => {
      await tx.delete(dashboardPresets).where(eq(dashboardPresets.id, presetId));

      const [state] = await tx
        .select()
        .from(dashboardUserState)
        .where(eq(dashboardUserState.userId, userId))
        .limit(1);

      if (state && state.activePresetId === presetId) {
        await tx
          .update(dashboardUserState)
          .set({
            activePresetKey: "all",
            activePresetId: null,
            version: sql`${dashboardUserState.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(dashboardUserState.userId, userId));
      }
    });

    return { deletedId: presetId };
  }

  async resetBuiltInPreset(
    userId: string,
    presetKey: BuiltInPresetKey
  ): Promise<PresetItemDefinition[]> {
    if (!isBuiltInPresetKey(presetKey)) {
      throw new ValidationAppError("Invalid built-in preset key.");
    }

    await db.transaction(async (tx) => {
      const [override] = await tx
        .select()
        .from(dashboardPresets)
        .where(
          and(
            eq(dashboardPresets.userId, userId),
            eq(dashboardPresets.presetKey, presetKey)
          )
        )
        .limit(1);

      if (override) {
        await tx.delete(dashboardPresets).where(eq(dashboardPresets.id, override.id));
      }

      await tx
        .insert(dashboardUserState)
        .values({
          userId,
          activePresetKey: presetKey,
          activePresetId: null,
          version: 1,
        })
        .onConflictDoUpdate({
          target: dashboardUserState.userId,
          set: {
            version: sql`${dashboardUserState.version} + 1`,
            updatedAt: new Date(),
          },
        });
    });

    return [...DEFAULT_PRESET_LAYOUTS[presetKey]];
  }

  private validateItems(items: PresetItemDefinition[]): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationAppError("Layout items must be a non-empty array.");
    }

    const seenKeys = new Set<string>();
    for (const item of items) {
      if (!item.widgetKey || !isValidWidgetKey(item.widgetKey)) {
        throw new ValidationAppError(`Invalid widget key: ${String(item.widgetKey)}`);
      }
      if (seenKeys.has(item.widgetKey)) {
        throw new ValidationAppError(`Duplicate widget key: ${item.widgetKey}`);
      }
      seenKeys.add(item.widgetKey);

      if (typeof item.position !== "number" || item.position < 0) {
        throw new ValidationAppError("Item position must be a non-negative number.");
      }
      if (typeof item.isVisible !== "boolean") {
        throw new ValidationAppError("Item isVisible must be a boolean.");
      }
    }
  }
}

export const dashboardPresetService = new DashboardPresetService();
