import { AppError } from "@/lib/errors/app-error";

const WORKER_REQUEST_TIMEOUT_MS = Number(process.env.WORKER_REQUEST_TIMEOUT_MS) || 10_000;

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
  isFinalDraft?: boolean;
  isLargeFile: boolean;
  forcePreviewGeneration?: boolean;
  applyPreviewWatermark?: boolean;
  chargeWatermarkCredits?: boolean;
  watermarkReason?: string | null;
};

function workerBaseUrl() {
  return (process.env.WORKER_API_BASE_URL || process.env.WORKER_URL || "http://localhost:4000").replace(/\/+$/, "");
}

function workerToken() {
  return process.env.WORKER_API_TOKEN || "";
}

function callbackBaseUrl() {
  return (
    process.env.PROCESSING_CALLBACK_BASE_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function createWorkerRequestSignal() {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  }).timeout;

  return timeout ? timeout(WORKER_REQUEST_TIMEOUT_MS) : undefined;
}

export async function enqueueProcessingJob(input: EnqueueWorkerJobInput) {
  let response: Response;
  const targetUrl = `${workerBaseUrl()}/jobs`;

  try {
    response = await fetch(targetUrl, {
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
  } catch (error: any) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    const detailMsg = isTimeout
      ? `Worker request timed out after ${WORKER_REQUEST_TIMEOUT_MS}ms (${targetUrl})`
      : `Failed to connect to worker (${targetUrl}): ${error instanceof Error ? error.message : String(error)}`;

    const appError = new AppError(detailMsg, 503, "worker_unavailable");
    (appError as any).cause = error;
    (appError as any).targetUrl = targetUrl;
    throw appError;
  }

  const rawText = await response.text().catch(() => "");
  let payload: any = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorDetail =
      payload?.error ||
      payload?.message ||
      rawText.slice(0, 500) ||
      `HTTP ${response.status} ${response.statusText}`;

    const appError = new AppError(
      `Worker enqueue rejected (HTTP ${response.status} from ${targetUrl}): ${errorDetail}`,
      response.status,
      "worker_enqueue_failed",
    );
    (appError as any).status = response.status;
    (appError as any).responseBody = rawText;
    (appError as any).targetUrl = targetUrl;
    throw appError;
  }

  return payload as {
    jobId: string;
    status: string;
    queueName: string;
  };
}

export async function getWorkerJobStatus(jobId: string) {
  let response: Response;
  const targetUrl = `${workerBaseUrl()}/job/${encodeURIComponent(jobId)}`;

  try {
    response = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${workerToken()}`,
      },
      signal: createWorkerRequestSignal(),
    });
  } catch (error: any) {
    const appError = new AppError(
      `Worker status unreachable (${targetUrl}): ${error instanceof Error ? error.message : String(error)}`,
      503,
      "worker_unavailable",
    );
    (appError as any).cause = error;
    throw appError;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      (payload as any)?.error || `Worker status failed with HTTP ${response.status}`,
      response.status,
      "worker_status_failed",
    );
  }

  return payload;
}

export async function retryWorkerJob(jobId: string) {
  const targetUrl = `${workerBaseUrl()}/admin/retry/${encodeURIComponent(jobId)}`;
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${workerToken()}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AppError(
      (payload as any)?.error || `Worker retry failed with HTTP ${response.status}`,
      response.status,
      "worker_retry_failed",
    );
  }

  return payload;
}

export async function cancelWorkerJob(jobId: string) {
  let response: Response;
  const targetUrl = `${workerBaseUrl()}/job/cancel/${encodeURIComponent(jobId)}`;

  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken()}`,
      },
      signal: createWorkerRequestSignal(),
    });
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
      error: (payload as any)?.error || `Worker cancellation failed with HTTP ${response.status}`,
    };
  }

  return payload as { success: boolean };
}

export async function deleteWorkerCachedSource(fileVersionId: string, sourceKey?: string) {
  let response: Response;
  const targetUrl = `${workerBaseUrl()}/sources/delete`;

  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerToken()}`,
      },
      body: JSON.stringify({ fileVersionId, sourceKey }),
      signal: createWorkerRequestSignal(),
    });
  } catch (error) {
    return {
      success: false,
      unreachable: true,
      error: error instanceof Error ? error.message : "Worker unavailable",
    };
  }

  return { success: response.ok };
}
