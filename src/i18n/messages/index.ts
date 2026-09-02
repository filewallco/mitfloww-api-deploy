import type { AppLocale } from "../config";
import { enMessages, type AppMessages } from "./en";
import { hiMessages } from "./hi";

const messages = {
  en: enMessages,
  hi: hiMessages,
} satisfies Record<AppLocale, AppMessages>;

export function getMessages(locale: AppLocale) {
  return messages[locale];
}

export type { AppMessages };
