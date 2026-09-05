import { Router } from "express";
import { z } from "zod";
import { resolveActiveActor } from "@/lib/auth/active-actor";
import { userService } from "@/lib/services/user-service";
import { asyncHandler } from "@/lib/api/route";
import { AppError } from "@/lib/errors/app-error";
import { Readable } from "node:stream";

export const profileRouter = Router();

const accountUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().min(1, "Email address is required").email("Invalid email address format"),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  countryCode: z.string().trim().min(1, "Country code is required").max(10),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().min(1, "State is required").max(100),
  postcode: z.string().trim().min(1, "Postcode is required").max(20),
  country: z.string().trim().min(1, "Country is required").max(100),
  roleTitle: z.string().trim().max(150).optional(),
  bio: z.string().trim().max(1000).optional(),
}).superRefine((data, ctx) => {
  const digits = data.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Phone number must contain between 7 and 15 digits",
    });
  }

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

  const updated = await userService.updateAccount(actor.id, parsed.data);
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
  return res.json({ success: true, message: "Account has been deactivated." });
}));

profileRouter.delete("/", asyncHandler(async (req, res) => {
  const actor = await resolveActiveActor(req);
  await userService.softDeleteAccount(actor.id);
  res.clearCookie("mitfloww_user_id", { path: "/" });
  return res.json({ success: true, message: "Account has been deleted." });
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

  if (result.contentType) {
    res.setHeader("Content-Type", result.contentType);
  }
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
