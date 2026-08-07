/**
 * Converts an ISO country code to a flag emoji.
 * @param isoCode - The ISO country code (e.g., 'US', 'GB', 'FR').
 * @returns The corresponding flag emoji.
 */
export function getFlagEmoji(isoCode: string): string {
  return isoCode
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)))
}
