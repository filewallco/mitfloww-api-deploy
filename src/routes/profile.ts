import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { userService } from "@/lib/services/user-service";
import { sessionService } from "@/lib/auth/session";
import { emailService } from "@/lib/email/email-service";
import { asyncHandler } from "@/lib/api/route";
import { AppError } from "@/lib/errors/app-error";
import { Readable } from "node:stream";

export const profileRouter = Router();

const COUNTRY_PHONE_CONFIG: Record<string, { lengths: number[]; allowedPrefixes?: string[]; label: string }> = {
  "+91": { lengths: [10], allowedPrefixes: ["6", "7", "8", "9"], label: "Indian" },
  "+1": { lengths: [10], allowedPrefixes: ["2", "3", "4", "5", "6", "7", "8", "9"], label: "US/Canada" },
  "+971": { lengths: [9], allowedPrefixes: ["5"], label: "UAE" },
  "+966": { lengths: [9], allowedPrefixes: ["5"], label: "Saudi Arabia" },
  "+974": { lengths: [8], label: "Qatar" },
  "+965": { lengths: [8], label: "Kuwait" },
  "+973": { lengths: [8], label: "Bahrain" },
  "+968": { lengths: [8], label: "Oman" },
  "+962": { lengths: [9], label: "Jordan" },
  "+20": { lengths: [10], label: "Egyptian" },
  "+44": { lengths: [10], allowedPrefixes: ["7"], label: "UK" },
  "+61": { lengths: [9], label: "Australian" },
  "+65": { lengths: [8], allowedPrefixes: ["8", "9"], label: "Singapore" },
  "+49": { lengths: [10, 11], label: "German" },
  "+33": { lengths: [9], label: "French" },
  "+39": { lengths: [10], label: "Italian" },
  "+34": { lengths: [9], label: "Spanish" },
  "+31": { lengths: [9], label: "Netherlands" },
  "+41": { lengths: [9], label: "Swiss" },
  "+81": { lengths: [10], label: "Japanese" },
  "+86": { lengths: [11], label: "Chinese" },
  "+55": { lengths: [10, 11], label: "Brazilian" },
  "+52": { lengths: [10], label: "Mexican" },
  "+27": { lengths: [9], label: "South African" },
  "+64": { lengths: [8, 9, 10], label: "New Zealand" },
};

const accountUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Invalid email address format").optional(),
  phone: z.string().trim().max(30).optional(),
  countryCode: z.string().trim().max(10).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
  roleTitle: z.string().trim().max(150).optional(),
  bio: z.string().trim().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.phone) {
    const raw = data.phone.trim();
    // 1. Strictly verify no alphanumeric letters or invalid symbols
    if (/[^\d\s-]/.test(raw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone number can only contain numbers",
      });
      return;
    }

    let digits = raw.replace(/\D/g, "");
    if (!digits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone number cannot be empty",
      });
      return;
    }

    // Determine dial code from countryCode or country name
    let dialCode = data.countryCode ? (data.countryCode.startsWith("+") ? data.countryCode : `+${data.countryCode}`) : "";
    if (!dialCode && data.country) {
      const c = data.country.toLowerCase();
      if (c === "india" || c === "in") dialCode = "+91";
      else if (c === "united states" || c === "us" || c === "canada" || c === "ca") dialCode = "+1";
      else if (c === "united arab emirates" || c === "uae" || c === "ae") dialCode = "+971";
      else if (c === "united kingdom" || c === "uk" || c === "gb") dialCode = "+44";
      else if (c === "saudi arabia" || c === "sa") dialCode = "+966";
      else if (c === "qatar" || c === "qa") dialCode = "+974";
      else if (c === "kuwait" || c === "kw") dialCode = "+965";
      else if (c === "singapore" || c === "sg") dialCode = "+65";
      else if (c === "australia" || c === "au") dialCode = "+61";
    }
    if (!dialCode) dialCode = "+91";

    const codeDigits = dialCode.replace(/\D/g, "");
    if (digits.startsWith(codeDigits) && digits.length > codeDigits.length) {
      digits = digits.slice(codeDigits.length);
    }
    if (digits.startsWith("0") && digits.length > 7) {
      digits = digits.slice(1);
    }

    const config = COUNTRY_PHONE_CONFIG[dialCode];
    if (config) {
      if (!config.lengths.includes(digits.length)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: `${config.label} phone number must be ${config.lengths.join(" or ")} digits`,
        });
        return;
      }

      if (config.allowedPrefixes && config.allowedPrefixes.length > 0) {
        const hasValidPrefix = config.allowedPrefixes.some((p) => digits.startsWith(p));
        if (!hasValidPrefix) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phone"],
            message: `${config.label} mobile number must start with ${config.allowedPrefixes.join(", ")}`,
          });
          return;
        }
      }
    } else {
      if (digits.length < 7 || digits.length > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "Phone number must contain between 7 and 15 digits",
        });
        return;
      }
    }
  }

  if (data.country && data.postcode) {
    const country = data.country.toLowerCase();
    if (country === "india" || country === "in") {
      if (!/^\d{6}$/.test(data.postcode.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["postcode"],
          message: "Indian PIN code must be exactly 6 numerical digits",
        });
      }
    }
  }
});

const companyUpdateSchema = z.object({
  name: z.string().trim().max(150).optional(),
  tagline: z.string().trim().max(255).optional(),
  industry: z.string().trim().max(100).optional(),
  website: z.string().trim().max(255).optional(),
  email: z.string().trim().email("Invalid company email format").optional().or(z.literal("")),
  yearFounded: z.string().trim().max(10).optional(),
  companySize: z.string().trim().max(50).optional(),
}).superRefine((data, ctx) => {
  if (data.name && data.name.trim().length > 0) {
    if (!data.website || !data.website.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["website"],
        message: "Company website is required when company name is provided",
      });
    }
    if (!data.email || !data.email.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Company email is required when company name is provided",
      });
    }
  }

  if (data.yearFounded && data.yearFounded.trim()) {
    const currentYear = new Date().getFullYear();
    const yearNum = parseInt(data.yearFounded.trim(), 10);
    if (!/^\d{4}$/.test(data.yearFounded.trim()) || isNaN(yearNum) || yearNum < 1800 || yearNum > currentYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["yearFounded"],
        message: `Year founded must be a valid 4-digit calendar year between 1800 and ${currentYear}`,
      });
    }
  }
});

const workProfileUpdateSchema = z.object({
  primaryProfession: z.string().trim().min(1, "Primary profession is required").max(100),
  customProfession: z.string().trim().max(255).nullable().optional(),
  yearsOfExperience: z.string().trim().min(1, "Years of experience is required").max(50),
  companyAddress: z.string().trim().max(1000).nullable().optional(),
});

// Helper to extract file buffer from multipart/binary or JSON base64
function extractUploadBuffer(req: any): { buffer: Buffer; filename: string; mimeType: string } {
  if (req.body && typeof req.body === "object" && typeof req.body.fileBase64 === "string") {
    const filename = req.body.filename || "upload.png";
    const mimeType = req.body.mimeType || "image/png";
    const base64Data = req.body.fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    return { buffer, filename, mimeType };
  }

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    const filename = (req.query.filename as string) || "upload.png";
    const mimeType = req.headers["content-type"] || "image/png";
    return { buffer: req.body, filename, mimeType };
  }

  throw new AppError("No file data provided in request.", 400, "missing_file_payload");
}

profileRouter.get("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const profile = await userService.getProfile(actor.id);
  return res.json(profile);
}));

profileRouter.patch("/account", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const parsed = accountUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid account input", details: parsed.error.issues });
  }

  const payload = { ...parsed.data };
  if (payload.phone) {
    payload.phone = payload.phone.replace(/\D/g, "");
  }

  const updated = await userService.updateAccount(actor.id, payload);
  return res.json({ user: updated });
}));

profileRouter.patch("/company", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const parsed = companyUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid company input", details: parsed.error.issues });
  }

  const updated = await userService.updateCompany(actor.id, parsed.data);
  return res.json({ company: updated });
}));

profileRouter.get("/work-profile", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const workProfile = await userService.getWorkProfile(actor.id);
  return res.json({ workProfile });
}));

profileRouter.patch("/work-profile", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const parsed = workProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid work profile input", details: parsed.error.issues });
  }

  const updated = await userService.updateWorkProfile(actor.id, parsed.data);
  return res.json({ workProfile: updated });
}));

profileRouter.post("/avatar", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const file = extractUploadBuffer(req);
  const result = await userService.uploadAvatar(actor.id, file);
  return res.json(result);
}));

profileRouter.post("/logo", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  const file = extractUploadBuffer(req);
  const result = await userService.uploadCompanyLogo(actor.id, file);
  return res.json(result);
}));

profileRouter.delete("/logo", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  await userService.removeCompanyLogo(actor.id);
  return res.json({ success: true });
}));

profileRouter.post("/deactivate", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  await userService.deactivateAccount(actor.id);

  if (actor.email) {
    await emailService.sendAccountDeactivatedEmail({
      email: actor.email,
      name: actor.name || "Creator",
    });
  }

  await sessionService.revokeAllSessions(actor.id);
  sessionService.clearCookies(res);
  return res.json({ success: true, message: "Account has been deactivated." });
}));

profileRouter.delete("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  await userService.softDeleteAccount(actor.id);

  const deletionDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (actor.email) {
    await emailService.sendAccountScheduledForDeletionEmail({
      email: actor.email,
      name: actor.name || "Creator",
      deletionDeadline,
    });
  }

  await sessionService.revokeAllSessions(actor.id);
  sessionService.clearCookies(res);
  return res.json({ success: true, message: "Account has been scheduled for deletion (30 days recovery period)." });
}));

profileRouter.get("/media", asyncHandler(async (req, res) => {
  const storageKey = req.query.key as string;
  if (!storageKey) {
    return res.status(400).json({ error: "Missing key query parameter." });
  }

  const result = await userService.getMediaStream(storageKey);
  if (!result || !result.body) {
    return res.status(404).json({ error: "Media not found." });
  }

  const contentType = result.contentType || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");

  if (result.body instanceof Readable) {
    return result.body.pipe(res);
  } else if (Buffer.isBuffer(result.body) || result.body instanceof Uint8Array) {
    return res.send(Buffer.from(result.body));
  } else if (result.body && typeof (result.body as any).getReader === "function") {
    return Readable.fromWeb(result.body as any).pipe(res);
  } else {
    return res.send(result.body);
  }
}));
