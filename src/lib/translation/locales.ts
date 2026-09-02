export const UNKNOWN_TRANSLATION_LOCALE = "und";

const TRANSLATION_LOCALE_MAX_LENGTH = 16;
const TRANSLATION_LOCALE_PATTERN = /^[A-Za-z0-9-]+$/;

export function normalizeTranslationLocale(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/_/g, "-");

  if (
    normalized.length === 0 ||
    normalized.length > TRANSLATION_LOCALE_MAX_LENGTH ||
    !TRANSLATION_LOCALE_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized.toLowerCase();
}

export function resolveTranslationLocale(value?: string | null) {
  return normalizeTranslationLocale(value) ?? UNKNOWN_TRANSLATION_LOCALE;
}

export function areTranslationLocalesEqual(
  left?: string | null,
  right?: string | null,
) {
  return resolveTranslationLocale(left) === resolveTranslationLocale(right);
}