import type { AppLocale } from "@/i18n/config";

export type OnDemandTranslationResultDTO = {
  originalText: string;
  sourceLocale: AppLocale;
  targetLocale: AppLocale;
  translated: boolean;
  translatedText: string;
};
