/**
 * Buy Me a Coffee username (the part after buymeacoffee.com/).
 * Leave empty to hide the tip link entirely.
 */
export const BUYMEACOFFEE_USERNAME = 'dommyrock';

export const SOURCE_URL = 'https://github.com/dommyrock/VI-map';

/** Tip link URL, or null when no username is configured. */
export const supportUrl = (): string | null =>
  BUYMEACOFFEE_USERNAME ? `https://buymeacoffee.com/${encodeURIComponent(BUYMEACOFFEE_USERNAME)}` : null;
