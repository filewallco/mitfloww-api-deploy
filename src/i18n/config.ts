export const locales = ["en", "hi"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";
export const localeCookieName = "mitfloww-locale";
export const localeHeaderName = "x-app-locale";

const cookieMaxAge = 60 * 60 * 24 * 365;

/** Type guard to check if a given string is a supported locale. */
export function isSupportedLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale);
}

/** Generates cookie options for setting the locale cookie.
 *
 * The function takes a locale value and returns an object containing the necessary options for setting a cookie.
 * The cookie is configured to have a name defined by `localeCookieName`, a value equal to the provided locale,
 * a maximum age of one year, a path of "/", and a SameSite attribute set to "lax" for security.
 *
 * @param locale - The locale value to be stored in the cookie.
 * @returns An object containing the options for setting the locale cookie.
 */
export function getLocaleCookieOptions(locale: AppLocale) {
  return {
    name: localeCookieName,
    value: locale,
    maxAge: cookieMaxAge,
    path: "/",
    sameSite: "lax" as const,
  };
}

/** Matches a given string against the list of supported locales.
 *
 * The function first checks if the input value is a valid supported locale.
 * If not, it attempts to match the base language by splitting the input on "-" and checking the first segment.
 * For example, "en-US" would match "en" if "en-US" is not directly supported.
 * If neither the full value nor the base language matches a supported locale, the function returns null.
 *
 * @param value - The input string to match against supported locales.
 * @returns The matched AppLocale if found, or null if no match is found.
 */
export function matchSupportedLocale(value?: string | null): AppLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const baseLanguage = normalized.split("-")[0];
  return isSupportedLocale(baseLanguage) ? baseLanguage : null;
}

/** Determines the preferred locale based on the Accept-Language header and a persisted cookie value.
 *
 * The function first checks if there is a persisted locale in the cookie and returns it if valid.
 * If not, it parses the Accept-Language header to determine the user's preferred languages and their quality values.
 * It then iterates through the requested locales in order of preference and returns the first supported locale it finds.
 * If no supported locale is found, it falls back to the default locale.
 *
 * @param acceptLanguageHeader - The value of the Accept-Language header from the HTTP request.
 * @param cookieLocale - The locale value stored in a cookie, if available.
 * @returns The determined preferred locale for the user.
 */
export function detectPreferredLocale(
  acceptLanguageHeader?: string | null,
  cookieLocale?: string | null,
) {
  const persistedLocale = matchSupportedLocale(cookieLocale);
  if (persistedLocale) {
    return persistedLocale;
  }

  if (!acceptLanguageHeader) {
    return defaultLocale;
  }

  const requestedLocales = acceptLanguageHeader
    .split(",")
    .map((entry) => {
      const [tag, qualityValue] = entry.trim().split(";q=");
      return {
        locale: tag?.trim().toLowerCase() ?? "",
        quality: Number(qualityValue ?? "1"),
      };
    })
    .filter((entry) => entry.locale)
    .sort((left, right) => right.quality - left.quality);

  for (const entry of requestedLocales) {
    const matchedLocale = matchSupportedLocale(entry.locale);
    if (matchedLocale) {
      return matchedLocale;
    }
  }

  return defaultLocale;
}

/**
 * Strips the locale prefix from a pathname if it exists.
 * For example, "/en/about" becomes "/about", and "/hi/contact" becomes "/contact".
 * If the pathname does not start with a supported locale, it is returned unchanged.
 * The root path "/" is returned as is.
 */
export function stripLocaleFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/";
  }

  if (!isSupportedLocale(segments[0])) {
    return pathname || "/";
  }

  const remainingPath = segments.slice(1).join("/");
  return remainingPath ? `/${remainingPath}` : "/";
}

/**
 * Keeps route generation locale-aware without exposing locale prefixes in URLs.
 * The locale argument is intentionally accepted so existing navigation code can
 * stay explicit about the active language.
 */
export function getLocalizedPathname(pathname: string, _locale: AppLocale) {
  void _locale;
  return stripLocaleFromPathname(pathname);
}

/**
 * Generates canonical alternates for pathless localization.
 * All locales intentionally point at the same public URL.
 */
export function getLanguageAlternates(pathname: string) {
  return Object.fromEntries(
    locales.map((locale) => [locale, getLocalizedPathname(pathname, locale)]),
  ) as Record<AppLocale, string>;
}

/**
 * Determines the text direction for a given locale.
 * Currently, all supported locales use left-to-right (LTR) text direction.
 * This function can be extended in the future to support right-to-left (RTL) languages if needed.
 */
export function getTextDirection(_locale: AppLocale) {
  void _locale;
  return "ltr" as const;
}
