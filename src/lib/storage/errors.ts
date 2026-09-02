import { AppError } from "@/lib/errors/app-error";

export const STORAGE_ERROR_CODES = {
  accountNotFound: "storage_account_not_found",
  idempotencyConflict: "storage_idempotency_conflict",
  invalidStorageAmount: "invalid_storage_amount",
  limitExceeded: "storage_limit_exceeded",
} as const;

export class StorageAppError extends AppError {
  readonly translationKey: string;

  constructor(input: {
    code: (typeof STORAGE_ERROR_CODES)[keyof typeof STORAGE_ERROR_CODES];
    details?: ConstructorParameters<typeof AppError>[3];
    message: string;
    statusCode: number;
    translationKey: string;
  }) {
    super(input.message, input.statusCode, input.code, input.details);
    this.name = "StorageAppError";
    this.translationKey = input.translationKey;
  }
}

export class StorageLimitExceededError extends StorageAppError {
  constructor(input: {
    availableBytes: number;
    message?: string;
    requiredBytes: number;
  }) {
    super({
      code: STORAGE_ERROR_CODES.limitExceeded,
      details: {
        availableBytes: input.availableBytes,
        requiredBytes: input.requiredBytes,
        translationKey: "storageErrorsNotEnough",
      },
      message:
        input.message ??
        `Not enough storage. This upload needs ${input.requiredBytes} bytes, but only ${input.availableBytes} bytes remain.`,
      statusCode: 409,
      translationKey: "storageErrorsNotEnough",
    });
  }
}

export class StorageAccountNotFoundError extends StorageAppError {
  constructor(message = "Storage account not found.") {
    super({
      code: STORAGE_ERROR_CODES.accountNotFound,
      message,
      statusCode: 404,
      translationKey: "storageErrorsFull",
    });
  }
}

export class InvalidStorageAmountError extends StorageAppError {
  constructor(message = "Storage amounts must be valid positive integers.") {
    super({
      code: STORAGE_ERROR_CODES.invalidStorageAmount,
      message,
      statusCode: 400,
      translationKey: "storageErrorsFull",
    });
  }
}

export class StorageIdempotencyConflictError extends StorageAppError {
  constructor(message = "A conflicting storage request already exists.") {
    super({
      code: STORAGE_ERROR_CODES.idempotencyConflict,
      message,
      statusCode: 409,
      translationKey: "storageErrorsFull",
    });
  }
}
