/**
 * Reading form fields.
 *
 * FormData hands back `string | File | null`, and every write in this app then has to decide
 * what an empty box means. These helpers make that decision once: a blank optional field is
 * null rather than the empty string, so the database holds "not answered" instead of
 * "answered with nothing", and a page can tell the difference later.
 */

export interface FieldError {
  field: string;
  message: string;
}

export function text(form: FormData, name: string, max = 4000): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function optionalText(form: FormData, name: string, max = 4000): string | null {
  const value = text(form, name, max);
  return value.length > 0 ? value : null;
}

/** Comma or newline separated input, deduplicated, order preserved. */
export function list(form: FormData, name: string, options: { upper?: boolean } = {}): string[] {
  const raw = text(form, name, 1000);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of raw.split(/[,\n]/)) {
    const entry = options.upper ? part.trim().toUpperCase() : part.trim();
    if (!entry || seen.has(entry.toLowerCase())) continue;
    seen.add(entry.toLowerCase());
    result.push(entry.slice(0, 60));
  }

  return result.slice(0, 12);
}

export function number(
  form: FormData,
  name: string,
  bounds: { min?: number; max?: number } = {},
): number | null {
  const raw = text(form, name, 20);
  if (!raw) return null;

  // Units and stray characters are stripped, because "65%" and "3 days" are what people type.
  // If nothing numeric survives that, the field is unanswered rather than zero: Number('')
  // is 0, and a 0 here would be published as a measured saving of none.
  const digits = raw.replace(/[^0-9.\-]/g, '');
  if (!/[0-9]/.test(digits)) return null;

  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  if (bounds.min !== undefined && value < bounds.min) return bounds.min;
  if (bounds.max !== undefined && value > bounds.max) return bounds.max;
  return value;
}

export function checkbox(form: FormData, name: string): boolean {
  return form.get(name) === 'on';
}

/** A date the person typed, kept as YYYY-MM-DD and never in the future. */
export function day(form: FormData, name: string, today = new Date()): string {
  const raw = text(form, name, 10);
  const iso = today.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return iso;
  return raw > iso ? iso : raw;
}

/** Only http(s) links are stored, so nothing rendered as a link can carry a script URL. */
export function url(form: FormData, name: string): string | null {
  const raw = optionalText(form, name, 500);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
