/**
 * Phones are stored as bare digits (US numbers as 10 digits, others as given
 * with a leading country code) so "(813) 555-1234" and "813.555.1234" match.
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  let digits = String(input).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `+${digits}`;
}

export function telHref(digits: string): string {
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
}

export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
