export type ApiMetaPrimitive =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface ApiMeta {
  [key: string]: ApiMetaValue;
}

export type ApiMetaValue = ApiMetaPrimitive | ApiMeta | ApiMetaValue[];

export type ApiErrorDetail = {
  code?: string;
  message: string;
  path?: string;
};

export type ApiErrorDetails = ApiErrorDetail[] | Record<string, unknown>;

export type ApiErrorParamValue =
  | string
  | number
  | boolean
  | null;

export type ApiErrorParams = Record<string, ApiErrorParamValue>;

export type ApiSuccessResponse<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    details?: ApiErrorDetails;
    message?: string;
    messageKey: string;
    params?: ApiErrorParams;
    requestId?: string;
  };
};
