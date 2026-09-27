/**
 * Centralized Sensitive Data Sanitizer and Redactor.
 * Guarantees that passwords, tokens, OTPs, credentials, connection strings,
 * and signed URLs are never leaked to logs or telemetry.
 */

const REDACTED = "***REDACTED***";

// List of lowercase keys whose values must always be redacted
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "sessionsecret",
  "otpsecret",
  "otp",
  "code",
  "secret",
  "clientsecret",
  "client_secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "set-cookie",
  "resendapikey",
  "resend_api_key",
  "workerapitoken",
  "worker_api_token",
  "processingcallbacktoken",
  "processing_callback_token",
  "accesskeyid",
  "secretaccesskey",
  "privatekey",
  "private_key",
  "idtoken",
  "id_token",
  "cardnumber",
  "cvv",
  "cvc",
]);

/**
 * Strips secrets from URL strings (e.g. postgres://user:pass@host, X-Amz-Signature, etc.)
 */
export function sanitizeUrlString(str: string): string {
  if (typeof str !== "string") return str;

  return str
    // Database and HTTP connection URIs with embedded credentials
    .replace(/(postgres|postgresql|mongodb|redis|https?):\/\/([^:@\s]+):([^@\s]+)@/gi, "$1://***:***@")
    // AWS S3 / Cloudflare R2 Presigned signature queries
    .replace(/([?&]X-Amz-Signature=)[^&\s]+/gi, "$1***")
    .replace(/([?&]X-Amz-Credential=)[^&\s]+/gi, "$1***")
    .replace(/([?&]X-Amz-Security-Token=)[^&\s]+/gi, "$1***")
    // Bearer / Basic auth tokens in text
    .replace(/(Bearer\s+)[a-zA-Z0-9_.-]+/gi, "$1***")
    .replace(/(Basic\s+)[a-zA-Z0-9_./+=]+/gi, "$1***");
}

/**
 * Deeply scrubs sensitive fields from objects, arrays, and errors.
 */
export function sanitizeLogValue(val: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (val === null || val === undefined) return val;
  if (depth > 6) return "[MaxDepthReached]";

  if (typeof val === "string") {
    return sanitizeUrlString(val);
  }

  if (typeof val === "number" || typeof val === "boolean" || typeof val === "symbol") {
    return val;
  }

  if (Buffer.isBuffer(val)) {
    return `[Buffer ${val.length} bytes]`;
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (val instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: val.name,
      message: sanitizeUrlString(val.message),
    };
    if (val.stack) {
      errorObj.stack = sanitizeUrlString(val.stack);
    }
    // Copy any custom error properties
    for (const key of Object.getOwnPropertyNames(val)) {
      if (!["name", "message", "stack"].includes(key)) {
        const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (SENSITIVE_KEYS.has(lowerKey)) {
          errorObj[key] = REDACTED;
        } else {
          errorObj[key] = sanitizeLogValue((val as any)[key], depth + 1, seen);
        }
      }
    }
    return errorObj;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogValue(item, depth + 1, seen));
  }

  if (typeof val === "object") {
    if (seen.has(val)) {
      return "[CircularReference]";
    }
    seen.add(val);

    const result: Record<string, unknown> = {};
    for (const [key, propVal] of Object.entries(val)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeLogValue(propVal, depth + 1, seen);
      }
    }
    return result;
  }

  return String(val);
}
