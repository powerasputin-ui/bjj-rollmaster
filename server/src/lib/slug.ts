// Generates a URL-safe, unique-enough slug for a tournament's public
// registration/display links. Not meant to be a faithful transliteration of
// non-Latin names — it's just an identifier, so any non a-z0-9 characters are
// dropped and a random suffix guarantees uniqueness without a DB round trip.
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'tournament'}-${suffix}`;
}
