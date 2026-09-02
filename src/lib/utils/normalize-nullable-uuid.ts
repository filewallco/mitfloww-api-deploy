/**
 * Normalizes one optional UUID value before it is persisted or forwarded.
 *
 * This helper returns internal-only data for DB/storage writes by converting
 * `undefined`, `null`, empty strings, and whitespace-only strings to `null`.
 * It does not log errors, mutate DB/storage by itself, delete any R2 prefixes,
 * or participate in deliverable delete eligibility.
 */
export function normalizeNullableUuid(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
