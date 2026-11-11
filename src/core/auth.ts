import { isOpenableUrl } from './url';

const AUTH_HOSTS = new Set(['accounts.google.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com']);

export function isAuthenticationHost(value: string): boolean {
  if (!isOpenableUrl(value)) return false;
  return AUTH_HOSTS.has(new URL(value).hostname);
}

export function isAuthenticationUrl(value: string): boolean {
  if (!isOpenableUrl(value)) return false;
  const url = new URL(value);
  return isAuthenticationHost(value) || /(?:^|\/)(?:auth|oauth2?|authorize|login|log-in|signin|sign-in|sso)(?:\/|$)/i.test(url.pathname);
}

// Start a fresh login at the service, without carrying OAuth state or credentials into another tab.
export function loginServiceUrl(value: string): string | null {
  if (!isOpenableUrl(value)) return null;
  const url = new URL(value);
  if (url.username || url.password) return null;
  return url.origin + url.pathname;
}

export function isNoteLoginPage(value: string): boolean {
  if (!isOpenableUrl(value)) return false;
  const url = new URL(value);
  return url.origin === 'https://note.com' && /^\/login\/?$/.test(url.pathname);
}

export function loginStartUrl(value: string): string | null {
  const service = loginServiceUrl(value);
  if (!service) return null;
  return new URL(service).origin === 'https://note.com' ? 'https://note.com/login' : service;
}
