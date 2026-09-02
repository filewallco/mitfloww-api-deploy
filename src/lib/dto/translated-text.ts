export const TRANSLATION_STATUSES = [
  "original",
  "translated",
  "unavailable",
] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export type TranslatedTextDTO = {
  originalText: string;
  sourceLocale: string;
  displayText: string;
  displayLocale: string;
  isTranslated: boolean;
  translationStatus: TranslationStatus;
};
