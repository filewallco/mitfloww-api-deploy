import type { Request, Response, NextFunction } from "express";
import {
  detectPreferredLocale,
  localeCookieName,
  localeHeaderName,
  matchSupportedLocale,
  type AppLocale,
} from "@/i18n/config";

declare global {
  namespace Express {
    interface Request {
      locale?: AppLocale;
    }
  }
}

export function localeMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerLocale = matchSupportedLocale(req.header(localeHeaderName));
  if (headerLocale) {
    req.locale = headerLocale;
    return next();
  }

  const cookieLocale = req.cookies?.[localeCookieName] ?? null;
  const acceptLang = req.header("accept-language") ?? null;
  req.locale = detectPreferredLocale(acceptLang, cookieLocale);
  next();
}

export function getRequestLocale(req: Request): AppLocale {
  return req.locale || "en";
}
