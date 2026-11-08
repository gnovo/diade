/** "queijo fresco" -> "Queijo fresco". Leaves the rest of the text as typed. */
export function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

/** Lowercases, strips diacritics and collapses whitespace, so "Açúcar " matches "acucar". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
