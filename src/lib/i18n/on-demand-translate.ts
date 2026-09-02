
import type { AppLocale } from "@/i18n/config";
import type { OnDemandTranslationResultDTO } from "@/lib/dto/i18n";
import { detectDynamicTextLocale } from "@/lib/i18n/dynamic-locale";
import { translationProvider } from "@/lib/translation/provider";

export function detectTextLocale(text: string): AppLocale {
  return detectDynamicTextLocale(text);
}

function createOriginalResult(input: {
  sourceLocale: AppLocale;
  targetLocale: AppLocale;
  text: string;
}): OnDemandTranslationResultDTO {
  return {
    originalText: input.text,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    translated: false,
    translatedText: input.text,
  };
}

export async function translateOnDemand(input: {
  targetLocale: AppLocale;
  text: string;
}): Promise<OnDemandTranslationResultDTO> {
  const sourceLocale = detectTextLocale(input.text);

  if (input.text.trim().length === 0 || sourceLocale === input.targetLocale) {
    return createOriginalResult({
      sourceLocale,
      targetLocale: input.targetLocale,
      text: input.text,
    });
  }

  try {
    const [result] = await translationProvider.translateBatch([
      {
        context: {
          entityType: "on_demand_translation",
          fieldName: "text",
        },
        sourceLocale,
        targetLocale: input.targetLocale,
        text: input.text,
      },
    ]);

    if (
      result?.translationStatus !== "translated" ||
      !result.translatedText
    ) {
      return createOriginalResult({
        sourceLocale,
        targetLocale: input.targetLocale,
        text: input.text,
      });
    }

    return {
      originalText: input.text,
      sourceLocale,
      targetLocale: input.targetLocale,
      translated: true,
      translatedText: result.translatedText,
    };
  } catch (error) {
    console.error("[translation] On-demand translation failed", {
      error: error instanceof Error ? error.message : error,
      sourceLocale,
      targetLocale: input.targetLocale,
      textLength: input.text.length,
    });

    return createOriginalResult({
      sourceLocale,
      targetLocale: input.targetLocale,
      text: input.text,
    });
  }
}
