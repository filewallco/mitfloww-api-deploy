import { normalizeProjectCurrency } from "@/lib/constants/currencies";

export type FormatCurrencyOptions = {
  locale: string;
  currency: string;
};

export function formatCurrency(
  cents: number,
  { locale, currency }: FormatCurrencyOptions
) {
  const resolvedCurrency = normalizeProjectCurrency(currency);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: resolvedCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
