import {
  defaultLocale,
  matchSupportedLocale,
  type AppLocale,
} from "@/i18n/config";

const DEVANAGARI_CHARACTER_PATTERN = /[\u0900-\u097F]/;
const LATIN_CHARACTER_PATTERN = /[A-Za-z]/;

function detectHighConfidenceDynamicLocale(text: string): AppLocale | null {
  if (DEVANAGARI_CHARACTER_PATTERN.test(text)) {
    return "hi";
  }

  if (LATIN_CHARACTER_PATTERN.test(text)) {
    return "en";
  }

  return null;
}

export function detectDynamicTextLocale(text: string): AppLocale {
  if (text.trim().length === 0) {
    return defaultLocale;
  }

  return detectHighConfidenceDynamicLocale(text) ?? defaultLocale;
}

export function resolveDynamicTextTargetLocale(
  locale?: string | null,
): AppLocale {
  return matchSupportedLocale(locale) ?? defaultLocale;
}

export function resolveDynamicTextSourceLocale(input: {
  storedSourceLocale?: string | null;
  text: string;
}): AppLocale {
  if (input.text.trim().length === 0) {
    return defaultLocale;
  }

  return (
    detectHighConfidenceDynamicLocale(input.text) ??
    matchSupportedLocale(input.storedSourceLocale) ??
    defaultLocale
  );
}

export function shouldTranslateDynamicText(input: {
  sourceLocale?: string | null;
  targetLocale?: string | null;
  text: string;
}) {
  if (input.text.trim().length === 0) {
    return false;
  }

  const sourceLocale = resolveDynamicTextSourceLocale({
    storedSourceLocale: input.sourceLocale,
    text: input.text,
  });
  const targetLocale = resolveDynamicTextTargetLocale(input.targetLocale);

  return sourceLocale !== targetLocale;
}
