/**
 * Core text summarization functions for normalizing and truncating text.
 */

/**
 * Normalizes and optionally truncates a text string.
 * Replaces multiple whitespace characters with a single space, trims the result,
 * and truncates with an ellipsis if it exceeds maxLength.
 * @param text - The text to summarize
 * @param maxLength - Maximum length before truncation (default: 72)
 * @returns The normalized and optionally truncated text
 */
export function summarizeText(text: string, maxLength: number = 72): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

/**
 * Summarizes text with a fallback value for undefined or empty text.
 * @param text - The text to summarize (or undefined)
 * @param fallback - The value to return if text is undefined or empty
 * @param maxLength - Maximum length before truncation (default: 56)
 * @returns The summarized text or the fallback value
 */
export function summarizeTextWithFallback(
  text: string | undefined,
  fallback: string,
  maxLength: number = 56,
): string {
  if (!text) return fallback
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return fallback
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
