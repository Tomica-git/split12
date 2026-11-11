import { isOpenableUrl } from './url';

export function normalizeHost(value: string): string | null {
  if (!value || /\s/.test(value)) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (!isOpenableUrl(candidate)) return null;
  const host = new URL(candidate).hostname.replace(/\.$/, '').replace(/^www\./, '');
  return !host || host.startsWith('[') || host.includes(':') ? null : host;
}
