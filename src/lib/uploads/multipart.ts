import { uploadConfig } from "@/config/upload";

export type MultipartPartRange = {
  contentLength: number;
  end: number;
  isLastPart: boolean;
  start: number;
  totalParts: number;
};

export function resolveMultipartPartSizeBytes(sizeBytes: number) {
  if (sizeBytes >= uploadConfig.multipartLargeFileThresholdBytes) {
    return uploadConfig.multipartLargeFilePartSizeBytes;
  }

  return uploadConfig.multipartPartSizeBytes;
}

export function shouldUseMultipartUpload(
  sizeBytes: number,
  multipartThresholdBytes = uploadConfig.multipartThresholdBytes,
) {
  return sizeBytes >= multipartThresholdBytes;
}

export function getMultipartPartCount(
  sizeBytes: number,
  partSizeBytes = resolveMultipartPartSizeBytes(sizeBytes),
) {
  return Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
}

export function getMultipartPartRange(
  sizeBytes: number,
  partNumber: number,
  partSizeBytes = resolveMultipartPartSizeBytes(sizeBytes),
): MultipartPartRange | null {
  if (!Number.isInteger(partNumber) || partNumber < 1) {
    return null;
  }

  const totalParts = getMultipartPartCount(sizeBytes, partSizeBytes);

  if (partNumber > totalParts) {
    return null;
  }

  const start = (partNumber - 1) * partSizeBytes;
  const end = Math.min(sizeBytes, start + partSizeBytes);

  return {
    contentLength: end - start,
    end,
    isLastPart: partNumber === totalParts,
    start,
    totalParts,
  };
}

export function getMultipartProgress(completedParts: number, totalParts: number) {
  if (totalParts <= 0) {
    return 0;
  }

  const startProgress = 30;
  const endProgress = 90;
  return startProgress + ((endProgress - startProgress) * completedParts) / totalParts;
}
