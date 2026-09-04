import { AppError } from "@/lib/errors/app-error";

const WORKER_REQUEST_TIMEOUT_MS = 5_000;

type EnqueueWorkerJobInput = {
  jobId: string;
  fileId: string;
  fileVersionId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sourceBucket: string;
  sourceKey: string;
  outputBucket: string;
  outputKey: string;
  logKey: string;
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    tier: "free" | "standard" | "pro" | "studio" | "business";
  };
  // Optional processing hints for the worker. These are best-effort flags
  // describing final-draft behavior and preview-watermarking preferences.
  // The worker is free to ignore or honor them; they are provided so the
  // processor can apply consistent behavior for final-draft previews.
  isFinalDraft?: boolean;
  isLargeFile: boolean;
  forcePreviewGeneration?: boolean;
  applyPreviewWatermark?: boolean;
  chargeWatermarkCredits?: boolean;
  watermarkReason?: string | null;
};

function workerBaseUrl() {
  return (process.env.WORKER_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
}

function workerToken() {
  return process.env.WORKER_API_TOKEN || "";
}

function callbackBaseUrl() {
  return (
    process.env.PROCESSING_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function workerUnavailableError() {
  return new AppError(
    "Processing worker is unavailable. Upload was saved, but processing could not start.",
    503,
    "worker_unavailable",
  );
}

function createWorkerRequestSignal() {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  }).timeout;

  return timeout?.(WORKER_REQUEST_TIMEOUT_MS);
}

export async function enqueueProcessingJob(input: EnqueueWorkerJobInput) {
  let response: Response;

  try {
    response = await fetch(`${workerBaseUrl()}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerToken()}`,
      },
      body: JSON.stringify({
        ...input,
        callbackUrl: `${callbackBaseUrl()}/api/file-processing/callback`,
      }),
      signal: createWorkerRequestSignal(),
    });
  } catch {
    throw workerUnavailableError();
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      (payload as any)?.error || "Worker enqueue failed.",
      response.status,
      "worker_enqueue_failed",
    );
  }

  return payload as {
    jobId: string;
    status: string;
    queueName: string;
  };
}

export async function getWorkerJobStatus(jobId: string) {
  let response: Response;

  try {
    response = await fetch(`${workerBaseUrl()}/job/${encodeURIComponent(jobId)}`, {
      headers: {
        Authorization: `Bearer ${workerToken()}`,
      },
      signal: createWorkerRequestSignal(),
    });
  } catch {
    throw workerUnavailableError();
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      (payload as any)?.error || "Worker status failed.",
      response.status,
      "worker_status_failed",
    );
  }

  return payload;
}

export async function retryWorkerJob(jobId: string) {
  const response = await fetch(`${workerBaseUrl()}/admin/retry/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${workerToken()}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      (payload as any)?.error || "Worker retry failed.",
      response.status,
      "worker_retry_failed",
    );
  }

  return payload;
}

export async function cancelWorkerJob(jobId: string) {
  let response: Response;

  try {
    response = await fetch(
      `${workerBaseUrl()}/job/cancel/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${workerToken()}`,
        },
        signal: createWorkerRequestSignal(),
      },
    );
  } catch (error) {
    return {
      success: false,
      unreachable: true,
      error: error instanceof Error ? error.message : "Worker unavailable",
    };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: (payload as any)?.error || "Worker cancellation failed.",
    };
  }

  return payload as { success: boolean };
}
