import type {
  TranslatedTextDTO,
  TranslationStatus,
} from "@/lib/dto/translated-text";
import { resolveDynamicTextSourceLocale } from "@/lib/i18n/dynamic-locale";

export function createTranslatedTextDTO(input: {
  originalText: string;
  sourceLocale?: string | null;
  status?: Extract<TranslationStatus, "original" | "unavailable">;
}): TranslatedTextDTO {
  const sourceLocale = resolveDynamicTextSourceLocale({
    storedSourceLocale: input.sourceLocale,
    text: input.originalText,
  });
  const status = input.status ?? "original";

  return {
    displayLocale: sourceLocale,
    displayText: input.originalText,
    isTranslated: false,
    originalText: input.originalText,
    sourceLocale,
    translationStatus: status,
  };
}
