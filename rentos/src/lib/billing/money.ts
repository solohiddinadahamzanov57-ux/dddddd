/**
 * Formats integer minor units (e.g. cents) as a localized currency string.
 * Never do money math with the result.
 *
 * Assumes 2 decimal digits (cents), true for every currency in the
 * onboarding currency list (USD/EUR/GBP/RUB/AED/KZT). A 0- or 3-decimal
 * currency (JPY, KWD, ...) would need Intl.NumberFormat's own minor-unit
 * count here instead of a flat /100 -- not needed until one of those is
 * actually offered.
 */
export function formatMinor(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
