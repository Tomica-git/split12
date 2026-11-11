import { expect, test } from 'vitest';
import { isAuthenticationHost, isAuthenticationUrl, isNoteLoginPage, loginServiceUrl, loginStartUrl } from './auth';

test('R-05 認証ホストと認証用パスだけを通常タブに残す', () => {
  for (const url of ['https://accounts.google.com/ServiceLogin', 'https://example.com/oauth/authorize', 'https://example.com/login', 'https://example.com/signin/continue']) expect(isAuthenticationUrl(url)).toBe(true);
  for (const url of ['https://accounts.google.com.evil.test/page', 'https://example.com/auth-help', 'https://example.com/page?next=/login', 'javascript:alert(1)']) expect(isAuthenticationUrl(url)).toBe(false);
  expect(isAuthenticationHost('https://example.com/login')).toBe(false);
});

test('R-05 S-06 ログイン開始先にクエリ・フラグメント・資格情報を持ち込まない', () => {
  expect(loginServiceUrl('https://example.com/article?state=secret#token')).toBe('https://example.com/article');
  expect(loginServiceUrl('https://name:password@example.com/path')).toBeNull();
  expect(loginServiceUrl('javascript:alert(1)')).toBeNull();
});

test('R-05 note は元記事ではなく専用ログインページから始める', () => {
  expect(loginStartUrl('https://note.com/example/n/article?state=private')).toBe('https://note.com/login');
  expect(loginStartUrl('https://note.com.evil.test/article')).toBe('https://note.com.evil.test/article');
  expect(isNoteLoginPage('https://note.com/login?redirectPath=/example')).toBe(true);
  expect(isNoteLoginPage('https://note.com/example/n/login')).toBe(false);
  expect(loginStartUrl('javascript:alert(1)')).toBeNull();
});
