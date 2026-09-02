const KB = 1024;
const MB = KB * 1024;
const MIN_MULTIPART_PART_SIZE_BYTES = 5 * MB;
export const standardUploadMaxSizeBytes = 500 * MB;
const GENERIC_BINARY_UPLOAD_MIME_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

type UploadFormatConfig = {
  readonly dangerous?: boolean;
  readonly extensions: readonly [string, ...string[]];
  readonly mimeTypes: readonly [string, ...string[]];
  readonly workerSupported?: boolean;
};

type UploadCategoryConfig = {
  readonly formats: readonly UploadFormatConfig[];
  readonly maxFileSizeBytes: number;
};

export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
] as const;

export const VIDEO_EXTENSIONS = [
  ".mp4",
  ".m4v",
  ".mov",
  ".mkv",
  ".webm",
  ".avi",
  ".wmv",
  ".flv",
  ".mpg",
  ".mpeg",
  ".m2v",
  ".ts",
  ".mts",
  ".m2ts",
  ".3gp",
  ".ogv",
  ".mxf",
] as const;

export const PDF_EXTENSIONS = [".pdf"] as const;
export const DESIGN_EXTENSIONS = [".fig"] as const;
export const ARCHIVE_EXTENSIONS = [".zip"] as const;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/vnd.avi",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/x-ms-asf",
  "video/x-flv",
  "video/mpeg",
  "video/mp2t",
  "video/3gpp",
  "video/3gpp2",
  "video/ogg",
  "application/ogg",
  "application/mxf",
  "video/matroska",
] as const;

export const PDF_MIME_TYPES = ["application/pdf"] as const;

export const SAFE_MEDIA_MIME_TO_EXTENSIONS = {
  "application/mxf": [".mxf"],
  "application/ogg": [".ogv"],
  "application/pdf": [".pdf"],
  "image/gif": [".gif"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/3gpp": [".3gp"],
  "video/matroska": [".mkv"],
  "video/mp2t": [".ts", ".mts", ".m2ts"],
  "video/mp4": [".mp4", ".m4v"],
  "video/mpeg": [".mpg", ".mpeg", ".m2v"],
  "video/ogg": [".ogv"],
  "video/quicktime": [".mov"],
  "video/vnd.avi": [".avi"],
  "video/webm": [".webm"],
  "video/x-flv": [".flv"],
  "video/x-matroska": [".mkv"],
  "video/x-ms-asf": [".wmv"],
  "video/x-ms-wmv": [".wmv"],
  "video/x-msvideo": [".avi"],
} as const satisfies Record<string, readonly string[]>;

export const DANGEROUS_UPLOAD_EXTENSIONS = [
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".exe",
  ".hta",
  ".htm",
  ".html",
  ".jar",
  ".js",
  ".jse",
  ".lnk",
  ".mjs",
  ".msi",
  ".php",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
  ".vbe",
  ".vbs",
  ".wsf",
] as const;

const DESIGN_MIME_TYPES = [
  "application/x-fig",
  "application/vnd.figma.file",
  "application/octet-stream",
] as const;

const ARCHIVE_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
] as const;

export const uploadCategoryConfig = {
  archive: {
    maxFileSizeBytes: 5000 * MB,
    formats: [
      {
        extensions: ARCHIVE_EXTENSIONS,
        mimeTypes: ARCHIVE_MIME_TYPES,
      },
    ],
  },
  design: {
    maxFileSizeBytes: 5000 * MB,
    formats: [
      {
        extensions: DESIGN_EXTENSIONS,
        mimeTypes: DESIGN_MIME_TYPES,
      },
    ],
  },
  document: {
    maxFileSizeBytes: 5000 * MB,
    formats: [
      {
        extensions: PDF_EXTENSIONS,
        mimeTypes: PDF_MIME_TYPES,
        workerSupported: true,
      },
    ],
  },
  image: {
    maxFileSizeBytes: 100 * MB,
    formats: [
      {
        extensions: [".jpg", ".jpeg"],
        mimeTypes: ["image/jpeg"],
        workerSupported: true,
      },
      {
        extensions: [".png"],
        mimeTypes: ["image/png"],
        workerSupported: true,
      },
      {
        extensions: [".webp"],
        mimeTypes: ["image/webp"],
        workerSupported: true,
      },
      {
        extensions: [".gif"],
        mimeTypes: ["image/gif"],
        workerSupported: true,
      },
    ],
  },
  video: {
    maxFileSizeBytes: 5000 * MB,
    formats: [
      {
        extensions: [".mp4", ".m4v"],
        mimeTypes: ["video/mp4"],
        workerSupported: true,
      },
      {
        extensions: [".mov"],
        mimeTypes: ["video/quicktime"],
        workerSupported: true,
      },
      {
        extensions: [".webm"],
        mimeTypes: ["video/webm"],
        workerSupported: true,
      },
      {
        extensions: [".mkv"],
        mimeTypes: ["video/x-matroska", "video/matroska"],
        workerSupported: true,
      },
      {
        extensions: [".avi"],
        mimeTypes: ["video/vnd.avi", "video/x-msvideo"],
        workerSupported: true,
      },
      {
        extensions: [".wmv"],
        mimeTypes: ["video/x-ms-wmv", "video/x-ms-asf"],
        workerSupported: true,
      },
      {
        extensions: [".flv"],
        mimeTypes: ["video/x-flv"],
        workerSupported: true,
      },
      {
        extensions: [".mpg", ".mpeg", ".m2v"],
        mimeTypes: ["video/mpeg"],
        workerSupported: true,
      },
      {
        extensions: [".ts", ".mts", ".m2ts"],
        mimeTypes: ["video/mp2t"],
        workerSupported: true,
      },
      {
        extensions: [".3gp"],
        mimeTypes: ["video/3gpp", "video/3gpp2"],
        workerSupported: true,
      },
      {
        extensions: [".ogv"],
        mimeTypes: ["video/ogg", "application/ogg"],
        workerSupported: true,
      },
      {
        extensions: [".mxf"],
        mimeTypes: ["application/mxf"],
        workerSupported: true,
      },
    ],
  },
} as const satisfies Record<string, UploadCategoryConfig>;

export type UploadCategory = keyof typeof uploadCategoryConfig;

export type UploadFileLike = {
  name: string;
  type?: string | null;
};

export type UploadExtensionRule = {
  readonly category: UploadCategory;
  readonly extension: string;
  readonly maxFileSizeBytes: number;
  readonly mimeTypes: readonly string[];
  readonly workerSupported: boolean;
};

export function normalizeUploadMimeType(value: string) {
  return value.trim().toLowerCase();
}

function uniqueNormalizedValues(
  values: Iterable<string>,
  normalizer: (value: string) => string,
) {
  const uniqueValues = new Set<string>();

  for (const value of values) {
    const normalizedValue = normalizer(value);

    if (normalizedValue.length > 0) {
      uniqueValues.add(normalizedValue);
    }
  }

  return [...uniqueValues];
}

export function normalizeUploadExtension(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

export function getUploadExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? normalizeUploadExtension(fileName.slice(dotIndex)) : "";
}

const uploadExtensionRules: UploadExtensionRule[] = Object.entries(
  uploadCategoryConfig,
).flatMap(([category, categoryConfig]) =>
  categoryConfig.formats.flatMap((format) => {
    const normalizedMimeTypes = uniqueNormalizedValues(
      format.mimeTypes,
      normalizeUploadMimeType,
    );

    return uniqueNormalizedValues(
      format.extensions,
      normalizeUploadExtension,
    ).map((extension) => ({
      category: category as UploadCategory,
      extension,
      maxFileSizeBytes: categoryConfig.maxFileSizeBytes,
      mimeTypes: normalizedMimeTypes,
      workerSupported:
        "workerSupported" in format ? Boolean(format.workerSupported) : false,
    }));
  }),
);

const uploadRuleByExtension = new Map<string, UploadExtensionRule>(
  uploadExtensionRules.map((rule) => [rule.extension, rule]),
);

export const acceptedUploadExtensions = uniqueNormalizedValues(
  uploadExtensionRules.map((rule) => rule.extension),
  normalizeUploadExtension,
);

export const acceptedUploadMimeTypes = uniqueNormalizedValues(
  uploadExtensionRules.flatMap((rule) => rule.mimeTypes),
  normalizeUploadMimeType,
);

export const maxSingleUploadFileSizeBytes = Math.max(
  ...Object.values(uploadCategoryConfig).map(
    (categoryConfig) => categoryConfig.maxFileSizeBytes,
  ),
);

export const uploadConfig = {
  acceptedExtensions: acceptedUploadExtensions,
  acceptedMimeTypes: acceptedUploadMimeTypes,
  categories: uploadCategoryConfig,
  largeFileProcessingThresholdBytes: standardUploadMaxSizeBytes,
  maxFiles: 20,
  maxRetriesPerPart: 3,
  maxTotalFileSizeBytes: maxSingleUploadFileSizeBytes,
  multipartLargeFilePartSizeBytes: 50 * MB,
  multipartLargeFileThresholdBytes: 100 * MB,
  multipartPartSizeBytes: 10 * MB,
  multipartThresholdBytes: 10 * MB,
  multipartUploadConcurrency: 8,
  standardUploadMaxSizeBytes,
} as const;

if (uploadConfig.multipartPartSizeBytes < MIN_MULTIPART_PART_SIZE_BYTES) {
  throw new Error(
    `uploadConfig.multipartPartSizeBytes must be at least ${MIN_MULTIPART_PART_SIZE_BYTES} bytes.`,
  );
}

if (
  uploadConfig.multipartLargeFilePartSizeBytes <
  uploadConfig.multipartPartSizeBytes
) {
  throw new Error(
    "uploadConfig.multipartLargeFilePartSizeBytes must be at least multipartPartSizeBytes.",
  );
}

if (
  uploadConfig.multipartLargeFileThresholdBytes <
  uploadConfig.multipartThresholdBytes
) {
  throw new Error(
    "uploadConfig.multipartLargeFileThresholdBytes must be at least multipartThresholdBytes.",
  );
}

if (uploadConfig.multipartThresholdBytes < uploadConfig.multipartPartSizeBytes) {
  throw new Error(
    "uploadConfig.multipartThresholdBytes must be at least multipartPartSizeBytes.",
  );
}

if (uploadConfig.standardUploadMaxSizeBytes > maxSingleUploadFileSizeBytes) {
  throw new Error(
    "uploadConfig.standardUploadMaxSizeBytes must not exceed maxSingleUploadFileSizeBytes.",
  );
}

const workerSupportedUploadExtensions = new Set(
  uploadExtensionRules
    .filter((rule) => rule.workerSupported)
    .map((rule) => rule.extension),
);
const dangerousUploadExtensionSet = new Set(
  DANGEROUS_UPLOAD_EXTENSIONS.map(normalizeUploadExtension),
);

export const uploadAcceptAttribute = [
  ...uploadConfig.acceptedExtensions,
  ...uploadConfig.acceptedMimeTypes,
].join(",");

export function getUploadRuleForExtension(extension: string) {
  return uploadRuleByExtension.get(normalizeUploadExtension(extension));
}

export function getUploadRuleForFileName(fileName: string) {
  return getUploadRuleForExtension(getUploadExtension(fileName));
}

export function getUploadCategoryForExtension(extension: string) {
  return getUploadRuleForExtension(extension)?.category;
}

export function getUploadMimeTypesForExtension(extension: string) {
  return getUploadRuleForExtension(extension)?.mimeTypes ?? [];
}

export function getPreferredUploadMimeTypeForExtension(extension: string) {
  return getUploadRuleForExtension(extension)?.mimeTypes[0];
}

export function getMaxUploadSizeBytesForExtension(extension: string) {
  return getUploadRuleForExtension(extension)?.maxFileSizeBytes;
}

export function isAcceptedUploadExtension(extension: string) {
  return uploadRuleByExtension.has(normalizeUploadExtension(extension));
}

export function isAllowedUploadMimeTypeForExtension(
  extension: string,
  mimeType: string,
) {
  const rule = getUploadRuleForExtension(extension);

  if (!rule) {
    return false;
  }

  return rule.mimeTypes.includes(normalizeUploadMimeType(mimeType));
}

export function isDangerousUploadExtension(extension: string) {
  return dangerousUploadExtensionSet.has(normalizeUploadExtension(extension));
}

export function isWorkerSupportedUploadExtension(extension: string) {
  return workerSupportedUploadExtensions.has(normalizeUploadExtension(extension));
}

export function isWatermarkSupportedUploadExtension(extension: string) {
  return isWorkerSupportedUploadExtension(extension);
}

export function inferUploadMimeType(file: UploadFileLike) {
  const extension = getUploadExtension(file.name);

  if (typeof file.type === "string") {
    const normalizedMimeType = normalizeUploadMimeType(file.type);

    if (normalizedMimeType.length > 0) {
      if (GENERIC_BINARY_UPLOAD_MIME_TYPES.has(normalizedMimeType)) {
        return (
          getPreferredUploadMimeTypeForExtension(extension) ??
          normalizedMimeType
        );
      }

      return normalizedMimeType;
    }
  }

  return getPreferredUploadMimeTypeForExtension(extension) ?? "";
}

export function isAcceptedUploadFileType(file: UploadFileLike) {
  const extension = getUploadExtension(file.name);

  if (!isAcceptedUploadExtension(extension)) {
    return false;
  }

  if (typeof file.type !== "string" || file.type.trim().length === 0) {
    return true;
  }

  const normalizedMimeType = normalizeUploadMimeType(file.type);

  if (GENERIC_BINARY_UPLOAD_MIME_TYPES.has(normalizedMimeType)) {
    return true;
  }

  return isAllowedUploadMimeTypeForExtension(extension, normalizedMimeType);
}
