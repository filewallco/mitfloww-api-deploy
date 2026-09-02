import { AppError } from "@/lib/errors/app-error";

export const CREDIT_ERROR_CODES = {
  creditAccountNotFound: "credit_account_not_found",
  creditConfigInvalid: "credit_config_invalid",
  creditIdempotencyConflict: "credit_idempotency_conflict",
  creditReservationInvalidState: "credit_reservation_invalid_state",
  creditReservationNotFound: "credit_reservation_not_found",
  insufficientCredits: "insufficient_credits",
  invalidCreditAmount: "invalid_credit_amount",
  unknownCreditFeature: "unknown_credit_feature",
  unknownCreditPlan: "unknown_credit_plan",
} as const;

export class CreditAppError extends AppError {
  readonly translationKey: string;

  constructor(input: {
    code: (typeof CREDIT_ERROR_CODES)[keyof typeof CREDIT_ERROR_CODES];
    details?: ConstructorParameters<typeof AppError>[3];
    message: string;
    statusCode: number;
    translationKey: string;
  }) {
    super(input.message, input.statusCode, input.code, input.details);
    this.name = "CreditAppError";
    this.translationKey = input.translationKey;
  }
}

export class InsufficientCreditsError extends CreditAppError {
  constructor(input?: {
    available?: number;
    message?: string;
    required?: number;
  }) {
    super({
      code: CREDIT_ERROR_CODES.insufficientCredits,
      details:
        input?.required != null || input?.available != null
          ? {
              available: input?.available ?? null,
              required: input?.required ?? null,
              translationKey: "creditsErrorsInsufficient",
            }
          : undefined,
      message:
        input?.message ??
        (input?.required != null && input?.available != null
          ? `Not enough credits. You need ${input.required} credits, but you only have ${input.available}.`
          : "You do not have enough credits for this action."),
      statusCode: 409,
      translationKey: "creditsErrorsInsufficient",
    });
  }
}

export class InvalidCreditAmountError extends CreditAppError {
  constructor(message = "Credit amounts must be valid positive integers.") {
    super({
      code: CREDIT_ERROR_CODES.invalidCreditAmount,
      message,
      statusCode: 400,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class UnknownCreditFeatureError extends CreditAppError {
  constructor(message = "Unknown credit feature.") {
    super({
      code: CREDIT_ERROR_CODES.unknownCreditFeature,
      message,
      statusCode: 400,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class UnknownCreditPlanError extends CreditAppError {
  constructor(message = "Unknown credit plan.") {
    super({
      code: CREDIT_ERROR_CODES.unknownCreditPlan,
      message,
      statusCode: 400,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class CreditAccountNotFoundError extends CreditAppError {
  constructor(message = "Credit account not found.") {
    super({
      code: CREDIT_ERROR_CODES.creditAccountNotFound,
      message,
      statusCode: 404,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class CreditIdempotencyConflictError extends CreditAppError {
  constructor(message = "A conflicting credit request already exists.") {
    super({
      code: CREDIT_ERROR_CODES.creditIdempotencyConflict,
      message,
      statusCode: 409,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class CreditReservationNotFoundError extends CreditAppError {
  constructor(message = "Credit reservation not found.") {
    super({
      code: CREDIT_ERROR_CODES.creditReservationNotFound,
      message,
      statusCode: 404,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class CreditReservationInvalidStateError extends CreditAppError {
  constructor(message = "Credit reservation is not in a valid state.") {
    super({
      code: CREDIT_ERROR_CODES.creditReservationInvalidState,
      message,
      statusCode: 409,
      translationKey: "creditsErrorsGeneric",
    });
  }
}

export class CreditConfigInvalidError extends CreditAppError {
  constructor(message = "Credit config is invalid.") {
    super({
      code: CREDIT_ERROR_CODES.creditConfigInvalid,
      message,
      statusCode: 500,
      translationKey: "creditsErrorsGeneric",
    });
  }
}
