export function isOpenableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}

export function normalizeUserUrl(value: string): string | null {
  const input = value.trim();
  if (!input || /\s/.test(input)) return null;
  const hasHttpScheme = /^https?:\/\//i.test(input);
  const looksLikeHostWithPort = /^(?:localhost|127\.0\.0\.1|[^/:?#]+\.[^/:?#]+):\d+(?:[/?#]|$)/i.test(input);
  if (!hasHttpScheme && /^[a-z][a-z\d+.-]*:/i.test(input) && !looksLikeHostWithPort) return null;
  const local = /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#]|$)/i.test(input);
  const candidate = hasHttpScheme ? input : `${local ? 'http' : 'https'}://${input}`;
  if (!isOpenableUrl(candidate)) return null;
  const url = new URL(candidate);
  // Without a scheme, a single word such as "muse" is a typo or a search term, not an intranet host.
  if (!hasHttpScheme && !url.hostname.includes('.') && !local) return null;
  return url.href;
}

export function lacksDomain(value: string): boolean {
  const input = value.trim();
  return /^[^\s/:?#.]+(?:[/?#]|$)/.test(input) && !/^localhost(?:[/?#]|$)/i.test(input);
}
