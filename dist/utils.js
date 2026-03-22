"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeString = normalizeString;
exports.levenshtein = levenshtein;
exports.stringSimilarity = stringSimilarity;
exports.numbersMatch = numbersMatch;
exports.round2 = round2;
/**
 * Normalize a string: lowercase, collapse whitespace, remove punctuation variations
 */
function normalizeString(s) {
    return s
        .toLowerCase()
        .replace(/[&,\.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Levenshtein distance between two strings
 */
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
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
function stringSimilarity(a, b) {
    const na = normalizeString(a);
    const nb = normalizeString(b);
    if (na === nb)
        return 1;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0)
        return 1;
    return 1 - levenshtein(na, nb) / maxLen;
}
/**
 * Check if two numbers are close within a tolerance
 */
function numbersMatch(a, b, tolerance = 0.01) {
    if (a == null || b == null)
        return false;
    return Math.abs(a - b) <= tolerance;
}
/**
 * Round to 2 decimal places
 */
function round2(n) {
    return Math.round(n * 100) / 100;
}
