import { and, asc, eq, not, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientMasters, type ClientMasterRecord, type NewClientMasterRecord } from "@/lib/db/schema";
import { ConflictAppError, NotFoundAppError, ValidationAppError } from "@/lib/errors/app-error";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_CLIENT_NAME_LENGTH = 60;
const MAX_EMAIL_LENGTH = 255;

export interface ClientMasterInput {
  id?: string;
  clientName: string;
  companyEmail?: string | null;
  _isNew?: boolean;
  _isDeleted?: boolean;
}

export class ClientService {
  async listClientMasters(userId: string): Promise<ClientMasterRecord[]> {
    return db
      .select()
      .from(clientMasters)
      .where(eq(clientMasters.userId, userId))
      .orderBy(asc(clientMasters.clientName));
  }

  async getClientMasterById(userId: string, id: string): Promise<ClientMasterRecord> {
    const [record] = await db
      .select()
      .from(clientMasters)
      .where(and(eq(clientMasters.id, id), eq(clientMasters.userId, userId)))
      .limit(1);

    if (!record) {
      throw new NotFoundAppError("Client master record not found.");
    }
    return record;
  }

  private validateClientData(clientName: string, companyEmail?: string | null) {
    const trimmedName = (clientName || "").trim();
    if (!trimmedName) {
      throw new ValidationAppError("Client name is required.");
    }
    if (trimmedName.length > MAX_CLIENT_NAME_LENGTH) {
      throw new ValidationAppError(`Client name cannot exceed ${MAX_CLIENT_NAME_LENGTH} characters.`);
    }

    let cleanEmail: string | null = null;
    if (companyEmail && companyEmail.trim()) {
      cleanEmail = companyEmail.trim();
      if (cleanEmail.length > MAX_EMAIL_LENGTH) {
        throw new ValidationAppError(`Company email cannot exceed ${MAX_EMAIL_LENGTH} characters.`);
      }
      if (!EMAIL_REGEX.test(cleanEmail)) {
        throw new ValidationAppError("Please enter a valid email address.");
      }
    }

    return { trimmedName, cleanEmail };
  }

  async createClientMaster(
    userId: string,
    data: { clientName: string; companyEmail?: string | null }
  ): Promise<ClientMasterRecord> {
    const { trimmedName, cleanEmail } = this.validateClientData(data.clientName, data.companyEmail);

    const [existing] = await db
      .select({ id: clientMasters.id })
      .from(clientMasters)
      .where(
        and(
          eq(clientMasters.userId, userId),
          sql`lower(${clientMasters.clientName}) = lower(${trimmedName})`
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictAppError("A client with this name already exists.");
    }

    const [created] = await db
      .insert(clientMasters)
      .values({
        userId,
        clientName: trimmedName,
        companyEmail: cleanEmail,
      })
      .returning();

    return created;
  }

  async updateClientMaster(
    userId: string,
    id: string,
    data: { clientName?: string; companyEmail?: string | null }
  ): Promise<ClientMasterRecord> {
    const existingRecord = await this.getClientMasterById(userId, id);

    const clientName = data.clientName !== undefined ? data.clientName : existingRecord.clientName;
    const companyEmail = data.companyEmail !== undefined ? data.companyEmail : existingRecord.companyEmail;

    const { trimmedName, cleanEmail } = this.validateClientData(clientName, companyEmail);

    const [duplicate] = await db
      .select({ id: clientMasters.id })
      .from(clientMasters)
      .where(
        and(
          eq(clientMasters.userId, userId),
          not(eq(clientMasters.id, id)),
          sql`lower(${clientMasters.clientName}) = lower(${trimmedName})`
        )
      )
      .limit(1);

    if (duplicate) {
      throw new ConflictAppError("A client with this name already exists.");
    }

    const [updated] = await db
      .update(clientMasters)
      .set({
        clientName: trimmedName,
        companyEmail: cleanEmail,
        updatedAt: new Date(),
      })
      .where(and(eq(clientMasters.id, id), eq(clientMasters.userId, userId)))
      .returning();

    return updated;
  }

  async deleteClientMaster(userId: string, id: string): Promise<void> {
    await this.getClientMasterById(userId, id);
    await db
      .delete(clientMasters)
      .where(and(eq(clientMasters.id, id), eq(clientMasters.userId, userId)));
  }

  async batchSaveClientMasters(
    userId: string,
    items: ClientMasterInput[]
  ): Promise<ClientMasterRecord[]> {
    // Validate duplicates within the batch payload itself
    const seenNames = new Set<string>();
    for (const item of items) {
      if (item._isDeleted) continue;
      const { trimmedName } = this.validateClientData(item.clientName, item.companyEmail);
      const lower = trimmedName.toLowerCase();
      if (seenNames.has(lower)) {
        throw new ConflictAppError(`Duplicate client name in submission: "${trimmedName}".`);
      }
      seenNames.add(lower);
    }

    for (const item of items) {
      if (item._isDeleted && item.id && !item._isNew) {
        await db
          .delete(clientMasters)
          .where(and(eq(clientMasters.id, item.id), eq(clientMasters.userId, userId)));
      } else if (item._isNew) {
        const { trimmedName, cleanEmail } = this.validateClientData(item.clientName, item.companyEmail);
        // Check DB collision
        const [collision] = await db
          .select({ id: clientMasters.id })
          .from(clientMasters)
          .where(
            and(
              eq(clientMasters.userId, userId),
              sql`lower(${clientMasters.clientName}) = lower(${trimmedName})`
            )
          )
          .limit(1);
        if (collision) {
          throw new ConflictAppError(`A client with name "${trimmedName}" already exists.`);
        }
        await db.insert(clientMasters).values({
          userId,
          clientName: trimmedName,
          companyEmail: cleanEmail,
        });
      } else if (item.id) {
        const { trimmedName, cleanEmail } = this.validateClientData(item.clientName, item.companyEmail);
        const [collision] = await db
          .select({ id: clientMasters.id })
          .from(clientMasters)
          .where(
            and(
              eq(clientMasters.userId, userId),
              not(eq(clientMasters.id, item.id)),
              sql`lower(${clientMasters.clientName}) = lower(${trimmedName})`
            )
          )
          .limit(1);
        if (collision) {
          throw new ConflictAppError(`A client with name "${trimmedName}" already exists.`);
        }
        await db
          .update(clientMasters)
          .set({
            clientName: trimmedName,
            companyEmail: cleanEmail,
            updatedAt: new Date(),
          })
          .where(and(eq(clientMasters.id, item.id), eq(clientMasters.userId, userId)));
      }
    }

    return this.listClientMasters(userId);
  }
}

export const clientService = new ClientService();
