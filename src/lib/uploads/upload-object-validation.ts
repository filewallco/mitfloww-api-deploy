import {
  getUploadRuleForExtension,
  isDangerousUploadExtension,
  normalizeUploadExtension,
  normalizeUploadMimeType,
} from "@/config/upload";

const HEADER_BYTES_TO_READ = 4096;

type SupportedSignatureKind =
  | "asf"
  | "avi"
  | "ebml"
  | "flv"
  | "gif"
  | "isobmff"
  | "jpeg"
  | "mpeg"
  | "mxf"
  | "ogg"
  | "pdf"
  | "png"
  | "ts"
  | "webm"
  | "webp"
  | "zip";

type StoredUploadValidationResult =
  | {
      ok: true;
    }
  | {
      code: string;
      details?: Record<string, string>;
      message: string;
      ok: false;
    };

const SIGNATURE_KIND_BY_EXTENSION: Partial<Record<string, SupportedSignatureKind>> = {
  ".3gp": "isobmff",
  ".avi": "avi",
  ".flv": "flv",
  ".gif": "gif",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".m2ts": "ts",
  ".m2v": "mpeg",
  ".m4v": "isobmff",
  ".mkv": "ebml",
  ".mov": "isobmff",
  ".mp4": "isobmff",
  ".mpeg": "mpeg",
  ".mpg": "mpeg",
  ".mts": "ts",
  ".mxf": "mxf",
  ".ogv": "ogg",
  ".pdf": "pdf",
  ".png": "png",
  ".ts": "ts",
  ".webm": "webm",
  ".webp": "webp",
  ".wmv": "asf",
  ".zip": "zip",
};

export function getStoredUploadValidationHeaderByteCount() {
  return HEADER_BYTES_TO_READ;
}

export function validateStoredUploadObject(input: {
  extension: string;
  headerBytes: Uint8Array;
  mimeType: string;
  storedContentType: string | null;
}): StoredUploadValidationResult {
  const normalizedExtension = normalizeUploadExtension(input.extension);
  const rule = getUploadRuleForExtension(normalizedExtension);

  if (!rule || isDangerousUploadExtension(normalizedExtension)) {
    return {
      code: "uploaded_object_extension_invalid",
      message: "Uploaded object has an unsupported file extension.",
      ok: false,
    };
  }

  const expectedMimeType = normalizeUploadMimeType(input.mimeType);

  if (!rule.mimeTypes.includes(expectedMimeType)) {
    return {
      code: "uploaded_object_mime_type_invalid",
      message: "Uploaded object MIME type does not match the file extension.",
      ok: false,
    };
  }

  const storedContentType = input.storedContentType
    ? normalizeUploadMimeType(input.storedContentType)
    : null;

  if (storedContentType && storedContentType !== expectedMimeType) {
    return {
      code: "uploaded_object_content_type_mismatch",
      details: {
        expectedMimeType,
        storedContentType,
      },
      message: "Uploaded object content type does not match the requested file type.",
      ok: false,
    };
  }

  if (input.headerBytes.length > 0 && hasBlockedMagic(input.headerBytes)) {
    return {
      code: "uploaded_object_blocked_content",
      message: "Uploaded object content is not allowed.",
      ok: false,
    };
  }

  const signatureKind = SIGNATURE_KIND_BY_EXTENSION[normalizedExtension];

  if (!signatureKind) {
    return { ok: true };
  }

  if (input.headerBytes.length === 0) {
    return {
      code: "uploaded_object_header_missing",
      message: "Uploaded object content could not be validated.",
      ok: false,
    };
  }

  if (!matchesExpectedSignature(input.headerBytes, signatureKind)) {
    return {
      code: "uploaded_object_signature_mismatch",
      message: "Uploaded object content does not match its file type.",
      ok: false,
    };
  }

  return {
    ok: true,
  };
}

function hasBlockedMagic(bytes: Uint8Array) {
  if (startsWith(bytes, [0x4d, 0x5a])) return true;
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true;
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return true;
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce])) return true;
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf])) return true;
  if (startsWith(bytes, [0x23, 0x21])) return true;

  const textHead = ascii(bytes.slice(0, Math.min(bytes.length, 512))).trimStart().toLowerCase();
  return (
    textHead.startsWith("<!doctype html") ||
    textHead.startsWith("<html") ||
    textHead.startsWith("<script") ||
    textHead.startsWith("<svg")
  );
}

function matchesExpectedSignature(bytes: Uint8Array, signatureKind: SupportedSignatureKind) {
  switch (signatureKind) {
    case "asf":
      return startsWith(bytes, [
        0x30,
        0x26,
        0xb2,
        0x75,
        0x8e,
        0x66,
        0xcf,
        0x11,
        0xa6,
        0xd9,
        0x00,
        0xaa,
        0x00,
        0x62,
        0xce,
        0x6c,
      ]);
    case "avi":
      return asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "AVI ";
    case "ebml":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "flv":
      return asciiAt(bytes, 0, 3) === "FLV";
    case "gif":
      return asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a";
    case "isobmff":
      return isIsoBaseMedia(bytes);
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "mpeg":
      return startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3]);
    case "mxf":
      return startsWith(bytes, [0x06, 0x0e, 0x2b, 0x34]);
    case "ogg":
      return asciiAt(bytes, 0, 4) === "OggS";
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "ts":
      return bytes.length > 376 && bytes[0] === 0x47 && bytes[188] === 0x47;
    case "webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && includesAscii(bytes, "webm");
    case "webp":
      return asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP";
    case "zip":
      return (
        startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
        startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
        startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
      );
  }
}

function isIsoBaseMedia(bytes: Uint8Array) {
  return bytes.length >= 12 && asciiAt(bytes, 4, 4) === "ftyp";
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((value, index) => bytes[index] === value);
}

function includesAscii(bytes: Uint8Array, needle: string) {
  return ascii(bytes).toLowerCase().includes(needle.toLowerCase());
}

function asciiAt(bytes: Uint8Array, start: number, length: number) {
  if (bytes.length < start + length) {
    return "";
  }

  return ascii(bytes.slice(start, start + length));
}

function ascii(bytes: Uint8Array) {
  return String.fromCharCode(...bytes);
}
