import { AppError } from "@/lib/errors/app-error";

export const MAX_PROFILE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export type ValidatedImage = {
  buffer: Buffer;
  extension: string;
  mimeType: string;
  sizeBytes: number;
};

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".svg",
]);

/**
 * Validates magic bytes (file signature) to ensure the uploaded file
 * matches its declared image MIME type and is not an executable or malicious payload.
 */
function validateMagicBytes(buffer: Buffer): "jpeg" | "png" | "webp" | "svg" {
  if (buffer.length < 4) {
    throw new AppError("File is too small to be a valid image.", 400, "invalid_image_data");
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // SVG detection: text starting with <?xml or <svg
  const textHeader = buffer.slice(0, 1024).toString("utf8").trim().toLowerCase();
  if (textHeader.startsWith("<?xml") || textHeader.startsWith("<svg") || textHeader.includes("<svg")) {
    return "svg";
  }

  throw new AppError(
    "Invalid file content: The file does not match an allowed image format (JPG, PNG, WebP, SVG).",
    400,
    "invalid_image_signature",
  );
}

/**
 * Sanitizes SVG content by inspecting and stripping/blocking dangerous vectors:
 * scripts, onload/onerror event handlers, embedded iframes/objects, external entities (XXE).
 */
function sanitizeSvg(buffer: Buffer): Buffer {
  const content = buffer.toString("utf8");

  // Check for dangerous patterns
  const dangerousPatterns = [
    /<script[\s>]/i,
    /<\/script>/i,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /\bon[a-z]+\s*=/i, // onload=, onclick=, onerror=, etc.
    /<!entity/i,       // XXE
    /<!doctype[\s\S]*?\[/i, // DTD subset with potential entities
    /<foreignobject[\s>]/i,
    /<iframe[\s>]/i,
    /<embed[\s>]/i,
    /<object[\s>]/i,
    /<applet[\s>]/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      throw new AppError(
        "SVG file contains prohibited or potentially malicious content (scripts, event handlers, or external entities).",
        400,
        "malicious_svg_detected",
      );
    }
  }

  // Must contain an actual <svg tag
  if (!/<svg[\s>]/i.test(content)) {
    throw new AppError("Invalid SVG file: missing <svg> element.", 400, "invalid_svg");
  }

  return Buffer.from(content, "utf8");
}

/**
 * Enforces strict security validation for uploaded profile avatars and company logos:
 * - Maximum file size 2MB
 * - Extension and MIME type check
 * - Magic bytes verification
 * - SVG sanitization (blocking XSS and XML attacks)
 */
export function validateImageUpload(input: {
  buffer: Buffer;
  filename: string;
  mimeType?: string | null;
}): ValidatedImage {
  const { buffer, filename, mimeType } = input;

  if (!buffer || buffer.length === 0) {
    throw new AppError("No file data received.", 400, "empty_file");
  }

  if (buffer.length > MAX_PROFILE_IMAGE_SIZE_BYTES) {
    throw new AppError(
      `File exceeds the maximum allowed size of 2MB (${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`,
      400,
      "file_too_large",
    );
  }

  // Verify file extension
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(
      `Unsupported file extension "${ext}". Allowed: .jpg, .jpeg, .png, .webp, .svg`,
      400,
      "unsupported_file_extension",
    );
  }

  // Verify declared MIME type if provided
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new AppError(
      `Unsupported MIME type "${mimeType}". Allowed: image/jpeg, image/png, image/webp, image/svg+xml`,
      400,
      "unsupported_mime_type",
    );
  }

  // Inspect actual magic bytes
  const detectedFormat = validateMagicBytes(buffer);

  let finalBuffer = buffer;
  let finalMimeType = "image/jpeg";
  let finalExtension = ext;

  switch (detectedFormat) {
    case "jpeg":
      finalMimeType = "image/jpeg";
      if (![".jpg", ".jpeg"].includes(finalExtension)) finalExtension = ".jpg";
      break;
    case "png":
      finalMimeType = "image/png";
      finalExtension = ".png";
      break;
    case "webp":
      finalMimeType = "image/webp";
      finalExtension = ".webp";
      break;
    case "svg":
      finalBuffer = sanitizeSvg(buffer);
      finalMimeType = "image/svg+xml";
      finalExtension = ".svg";
      break;
  }

  return {
    buffer: finalBuffer,
    extension: finalExtension,
    mimeType: finalMimeType,
    sizeBytes: finalBuffer.length,
  };
}
