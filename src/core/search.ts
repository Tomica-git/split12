import { isOpenableUrl, normalizeUserUrl } from './url';

function searchUrl(query: string): string {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.href;
}

// Search remains explicit; invalid/non-web schemes never become a navigation or search URL.
export function googleSearchUrl(value: string): string | null {
  const input = value.trim();
  if (!input || /[\u0000-\u001f\u007f]/.test(input) || normalizeUserUrl(input)) return null;
  if (/^(?:https?|javascript|data|file|chrome|chrome-extension|about|blob|vbscript|mailto|ftp):/i.test(input) || /^[a-z][a-z\d+.-]*:\/\//i.test(input)) return null;
  return searchUrl(input);
}

export function googleHostnameSearchUrl(value: string): string | null {
  return isOpenableUrl(value) ? searchUrl(new URL(value).hostname) : null;
}
