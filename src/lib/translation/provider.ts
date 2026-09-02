
export type TranslationProviderContext = {
  entityType: string;
  fieldName: string;
};

export type TranslateTextInput = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  context?: TranslationProviderContext;
};

export type TranslateTextResult = {
  translatedText: string | null;
  translationStatus: "translated" | "unavailable";
};

export interface TranslationProvider {
  translateBatch(input: TranslateTextInput[]): Promise<TranslateTextResult[]>;
}

function logTranslationProviderError(
  message: string,
  input: {
    context?: TranslationProviderContext;
    error?: unknown;
    sourceLocale?: string;
    status?: number;
    statusText?: string;
    targetLocale?: string;
    textLength?: number;
  },
) {
  console.error(message, {
    context: input.context,
    error:
      input.error instanceof Error ? input.error.message : input.error,
    sourceLocale: input.sourceLocale,
    status: input.status,
    statusText: input.statusText,
    targetLocale: input.targetLocale,
    textLength: input.textLength,
  });
}

function normalizeEnvValue(value?: string | null) {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeBaseUrl(value?: string | null) {
  const normalized = normalizeEnvValue(value);

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, "");
}

function toProviderLocale(locale: string, options?: { allowAuto?: boolean }) {
  const normalized = locale.trim().toLowerCase();

  if (!normalized || normalized === "und") {
    return options?.allowAuto ? "auto" : null;
  }

  const primarySubtag = normalized.split("-")[0];

  return primarySubtag && /^[a-z]{2,3}$/.test(primarySubtag)
    ? primarySubtag
    : null;
}

function unavailable(): TranslateTextResult {
  return {
    translatedText: null,
    translationStatus: "unavailable",
  };
}

class DisabledTranslationProvider implements TranslationProvider {
  async translateBatch(input: TranslateTextInput[]) {
    return input.map(() => unavailable());
  }
}

class LibreTranslateProvider implements TranslationProvider {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(input: {
    apiKey?: string | null;
    baseUrl: string;
    requestTimeoutMs?: number;
  }) {
    this.apiKey = normalizeEnvValue(input.apiKey);
    this.baseUrl = input.baseUrl;
    this.requestTimeoutMs = input.requestTimeoutMs ?? 8_000;
  }

  async translateBatch(input: TranslateTextInput[]) {
    return Promise.all(input.map((entry) => this.translateOne(entry)));
  }

  private async translateOne(input: TranslateTextInput): Promise<TranslateTextResult> {
    const originalText = input.text;

    if (originalText.trim().length === 0) {
      return unavailable();
    }

    const source = toProviderLocale(input.sourceLocale, { allowAuto: true });
    const target = toProviderLocale(input.targetLocale);

    if (!source || !target || source === target) {
      return unavailable();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/translate`, {
        body: JSON.stringify({
          format: "text",
          q: originalText,
          source,
          target,
          ...(this.apiKey ? { api_key: this.apiKey } : {}),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        logTranslationProviderError(
          "[translation] LibreTranslate request failed",
          {
            context: input.context,
            sourceLocale: input.sourceLocale,
            status: response.status,
            statusText: response.statusText,
            targetLocale: input.targetLocale,
            textLength: originalText.length,
          },
        );
        return unavailable();
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            translatedText?: unknown;
          }
        | null;

      const translatedText =
        typeof payload?.translatedText === "string"
          ? payload.translatedText.trim()
          : "";

      if (!translatedText) {
        return unavailable();
      }

      return {
        translatedText,
        translationStatus: "translated",
      };
    } catch (error) {
      logTranslationProviderError("[translation] LibreTranslate request error", {
        context: input.context,
        error,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        textLength: originalText.length,
      });
      return unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createTranslationProvider(): TranslationProvider {
  const provider = normalizeEnvValue(process.env.TRANSLATION_PROVIDER)?.toLowerCase();

  if (provider !== "libretranslate") {
    return new DisabledTranslationProvider();
  }

  const baseUrl = normalizeBaseUrl(process.env.LIBRETRANSLATE_URL);

  if (!baseUrl) {
    return new DisabledTranslationProvider();
  }

  const requestTimeoutMs = Number(process.env.TRANSLATION_REQUEST_TIMEOUT_MS);

  return new LibreTranslateProvider({
    apiKey: process.env.LIBRETRANSLATE_API_KEY,
    baseUrl,
    requestTimeoutMs:
      Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
        ? requestTimeoutMs
        : undefined,
  });
}

export const translationProvider: TranslationProvider = createTranslationProvider();
