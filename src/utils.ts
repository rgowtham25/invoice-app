/**
 * Normalize a string: lowercase, collapse whitespace, remove punctuation variations
 */
export function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[&,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * String similarity score 0-1 (1 = identical)
 */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Check if two numbers are close within a tolerance
 */
export function numbersMatch(a: number | null | undefined, b: number | null | undefined, tolerance = 0.01): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

/**
 * Round to 2 decimal places
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What fraction of words in `query` appear in `text`.
 * Words shorter than 3 chars are ignored (articles, prepositions, etc.)
 * Returns 0-1.
 */
export function wordCoverage(query: string, text: string): number {
  const queryWords = normalizeString(query).split(' ').filter(w => w.length > 2);
  if (queryWords.length === 0) return 0;
  const textWords = new Set(normalizeString(text).split(' '));
  const matched = queryWords.filter(w => textWords.has(w)).length;
  return matched / queryWords.length;
}

/**
 * Combined similarity for product descriptions.
 * Returns the max of:
 *   - Levenshtein-based similarity
 *   - fraction of reference words found in extracted (catches long extracted titles)
 *   - fraction of extracted words found in reference (symmetric)
 */
export function descriptionSimilarity(a: string, b: string): number {
  return Math.max(
    stringSimilarity(a, b),
    wordCoverage(a, b),
    wordCoverage(b, a)
  );
}
