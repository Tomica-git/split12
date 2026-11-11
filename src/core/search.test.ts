import { expect, test } from 'vitest';
import { googleHostnameSearchUrl, googleSearchUrl } from './search';

test('R-04 URL ではない語句を Google の通常検索 URL にする', () => {
  for (const query of ['Gmail', 'note ログイン', 'site:note.com Gmail']) {
    const url = new URL(googleSearchUrl(query)!);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('q')).toBe(query);
  }
});
test('R-04 S-06 URL と禁止スキームは検索へ変換しない', () => {
  for (const input of ['', 'example.com', 'http://localhost:3000', 'javascript:alert(1)', 'data:text/html,a', 'file:///tmp/a', 'chrome://settings', 'https://bad space']) expect(googleSearchUrl(input)).toBeNull();
});

test('R-08 DNS 失敗の検索にはホスト名だけを使い資格情報やクエリを含めない', () => {
  const url = new URL(googleHostnameSearchUrl('https://user:private@missing.test/path?token=private#fragment')!);
  expect(url.searchParams.get('q')).toBe('missing.test');
  expect(googleHostnameSearchUrl('javascript:alert(1)')).toBeNull();
});
