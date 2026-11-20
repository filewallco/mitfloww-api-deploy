import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userBankDetails, AppNotificationCategory, type UserBankDetailsRecord } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { notificationService } from "./notification-service";

const SESSION_SECRET =
  process.env.BANK_DETAILS_ENCRYPTION_KEY ||
  process.env.ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  "mitfloww_bank_details_secure_key_2026";

const ENCRYPTION_KEY = crypto.scryptSync(SESSION_SECRET, "mitfloww-bank-salt", 32);
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;
const VERIFICATION_DELAY_MS = 60 * 1000; // 1 minute auto-verification timer

export interface SafeBankDetailsResponse {
  isConfigured: boolean;
  paymentType: "bank" | "upi";
  accountHolderName: string;
  bankName: string;
  accountNumberLast4: string;
  maskedAccountNumber: string;
  routingCode: string;
  accountType: string;
  country: string | null;
  currency: string | null;
  upiId: string | null;
  bankBranchAddress: string | null;
  verificationStatus: "pending" | "verified";
  verifiedAt: string | null;
  updatedAt: string;
}

export interface SaveBankDetailsInput {
  paymentType?: "bank" | "upi" | null;
  accountHolderName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  routingCode?: string | null;
  accountType?: string | null;
  country?: string | null;
  currency?: string | null;
  upiId?: string | null;
  bankBranchAddress?: string | null;
}

export class BankDetailsService {
  /**
   * Encrypts plaintext data using AES-256-GCM with a random IV and 128-bit authentication tag.
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
  }

  /**
   * Authenticates and decrypts AES-256-GCM ciphertext. Throws AppError if tampered with.
   */
  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, "base64url");
    if (buffer.length < GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH) {
      throw new AppError("Malformed encrypted bank credential.", 500, "bank_decrypt_failed");
    }
    const iv = buffer.subarray(0, GCM_IV_LENGTH);
    const tag = buffer.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  /**
   * Masks a bank account number showing only the last 4 digits (e.g. •••• •••• •••• 1234).
   */
  maskAccountNumber(last4: string): string {
    return `•••• •••• •••• ${last4}`;
  }

  /**
   * Fetches the safe, masked bank details for a user.
   * Automatically completes verification and dispatches in-app notification after 1 minute.
   */
  async getBankDetails(userId: string): Promise<SafeBankDetailsResponse | null> {
    const [record] = await db
      .select()
      .from(userBankDetails)
      .where(eq(userBankDetails.userId, userId))
      .limit(1);

    if (!record) return null;

    let verificationStatus = (record.verificationStatus as "pending" | "verified") || "pending";
    let verifiedAt = record.verifiedAt;

    // Check if 1-minute timer has elapsed for verification
    if (verificationStatus === "pending" && Date.now() - record.updatedAt.getTime() >= VERIFICATION_DELAY_MS) {
      verificationStatus = "verified";
      verifiedAt = new Date();
      await db
        .update(userBankDetails)
        .set({
          verificationStatus: "verified",
          verifiedAt,
        })
        .where(eq(userBankDetails.userId, userId));

      // Create in-app system notification
      try {
        await notificationService.createNotification({
          category: AppNotificationCategory.System,
          title: "Payout Details Verified",
          description: "Your payout details have been verified successfully. You can now receive client payments.",
          titleKey: "notification.bankDetailsVerifiedTitle",
          descriptionKey: "notification.bankDetailsVerifiedDescription",
          eventKey: `bank-verified:${userId}:${record.updatedAt.getTime()}`,
          metadata: {
            userId,
            href: "/profile?tab=bank",
          },
        });
      } catch (err) {
        console.warn("Failed to create bank verification notification:", err);
      }
    }

    let routingCode = "";
    if (record.routingCodeCiphertext) {
      try {
        routingCode = this.decrypt(record.routingCodeCiphertext);
      } catch {
        routingCode = record.routingCodeLast4 ? `••••${record.routingCodeLast4}` : "";
      }
    }

    return {
      isConfigured: true,
      paymentType: (record.paymentType as "bank" | "upi") || "bank",
      accountHolderName: record.accountHolderName || "",
      bankName: record.bankName || "",
      accountNumberLast4: record.accountNumberLast4 || "",
      maskedAccountNumber: record.accountNumberLast4 ? this.maskAccountNumber(record.accountNumberLast4) : "",
      routingCode,
      accountType: record.accountType || "savings",
      country: record.country || null,
      currency: record.currency || null,
      upiId: record.upiId || null,
      bankBranchAddress: record.bankBranchAddress || null,
      verificationStatus,
      verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Saves or updates bank details for a user, securely encrypting sensitive credentials.
   */
  async saveBankDetails(userId: string, input: SaveBankDetailsInput): Promise<SafeBankDetailsResponse> {
    const [existing] = await db
      .select()
      .from(userBankDetails)
      .where(eq(userBankDetails.userId, userId))
      .limit(1);

    const now = new Date();
    const paymentType = input.paymentType === "upi" ? "upi" : "bank";
    const cleanCountry = input.country?.trim() || null;
    const cleanCurrency = input.currency?.trim() || null;
    const cleanUpiId = input.upiId?.trim() || null;

    let cleanAccountHolder = input.accountHolderName?.trim() || "";
    let cleanBankName = input.bankName?.trim() || "";
    let cleanAccountType = (input.accountType || "savings").toLowerCase().trim();
    let cleanBranch = input.bankBranchAddress?.trim() || null;
    let accountNumberCiphertext = existing?.accountNumberCiphertext || null;
    let accountNumberLast4 = existing?.accountNumberLast4 || null;
    let routingCodeCiphertext = existing?.routingCodeCiphertext || null;
    let routingCodeLast4 = existing?.routingCodeLast4 || null;

    if (paymentType === "upi") {
      if (!cleanUpiId) {
        throw new AppError("UPI ID is required.", 400, "missing_upi_id");
      }
    } else {
      // Bank transfer
      if (!cleanAccountHolder) {
        throw new AppError("Account holder name cannot be empty.", 400, "missing_account_holder");
      }
      if (!cleanBankName) {
        throw new AppError("Bank name cannot be empty.", 400, "missing_bank_name");
      }

      const rawAccount = input.accountNumber?.trim();
      if (rawAccount) {
        const sanitized = rawAccount.replace(/\s+/g, "");
        if (sanitized.length < 6 || sanitized.length > 40) {
          throw new AppError("Account number must be between 6 and 40 characters.", 400, "invalid_account_number");
        }
        accountNumberCiphertext = this.encrypt(sanitized);
        accountNumberLast4 = sanitized.slice(-4);
      } else if (!existing || !existing.accountNumberCiphertext) {
        throw new AppError("Account number is required.", 400, "missing_account_number");
      }

      const rawRouting = input.routingCode?.trim();
      if (rawRouting) {
        const sanitized = rawRouting.replace(/\s+/g, "");
        if (sanitized.length < 3 || sanitized.length > 30) {
          throw new AppError("Routing / IFSC code must be between 3 and 30 characters.", 400, "invalid_routing_code");
        }
        routingCodeCiphertext = this.encrypt(sanitized);
        routingCodeLast4 = sanitized.slice(-4);
      } else if (!existing || !existing.routingCodeCiphertext) {
        throw new AppError("Routing / IFSC code is required.", 400, "missing_routing_code");
      }
    }

    await db
      .insert(userBankDetails)
      .values({
        userId,
        paymentType,
        accountHolderName: cleanAccountHolder || null,
        bankName: cleanBankName || null,
        accountNumberCiphertext,
        accountNumberLast4,
        routingCodeCiphertext,
        routingCodeLast4,
        accountType: cleanAccountType,
        country: cleanCountry,
        currency: cleanCurrency,
        upiId: cleanUpiId,
        bankBranchAddress: cleanBranch,
        verificationStatus: "pending",
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userBankDetails.userId,
        set: {
          paymentType,
          accountHolderName: cleanAccountHolder || null,
          bankName: cleanBankName || null,
          accountNumberCiphertext,
          accountNumberLast4,
          routingCodeCiphertext,
          routingCodeLast4,
          accountType: cleanAccountType,
          country: cleanCountry,
          currency: cleanCurrency,
          upiId: cleanUpiId,
          bankBranchAddress: cleanBranch,
          verificationStatus: "pending",
          verifiedAt: null,
          updatedAt: now,
        },
      });

    let routingCode = "";
    if (routingCodeCiphertext) {
      try {
        routingCode = this.decrypt(routingCodeCiphertext);
      } catch {
        routingCode = routingCodeLast4 ? `••••${routingCodeLast4}` : "";
      }
    }

    return {
      isConfigured: true,
      paymentType,
      accountHolderName: cleanAccountHolder,
      bankName: cleanBankName,
      accountNumberLast4: accountNumberLast4 || "",
      maskedAccountNumber: accountNumberLast4 ? this.maskAccountNumber(accountNumberLast4) : "",
      routingCode,
      accountType: cleanAccountType,
      country: cleanCountry,
      currency: cleanCurrency,
      upiId: cleanUpiId,
      bankBranchAddress: cleanBranch,
      verificationStatus: "pending",
      verifiedAt: null,
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Deletes a user's bank details from the system.
   */
  async deleteBankDetails(userId: string): Promise<boolean> {
    await db.delete(userBankDetails).where(eq(userBankDetails.userId, userId));
    return true;
  }
}

export const bankDetailsService = new BankDetailsService();
