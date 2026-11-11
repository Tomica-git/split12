import { expect, test } from 'vitest';
import { addressSuggestions } from './suggestions';

test('R-21 開いているURLと保存URLを重複除外して候補にする', () => {
  const source = { url: 'https://example.com/docs', title: '資料' };
  const rows = addressSuggestions('example.com', [source, source, { url: 'https://example.com/other' }]);
  expect(rows.filter(row => row.url === source.url)).toHaveLength(1);
  expect(rows.some(row => row.url === 'https://example.com/other')).toBe(true);
});
test('R-21 ドメインの先頭とタイトルで候補を絞り込める', () => {
  expect(addressSuggestions('goo', []).some(row => row.url === 'https://www.google.com/')).toBe(true);
  expect(addressSuggestions('議事録', [{ url: 'https://example.com/meeting', title: '議事録一覧' }])[0]!.url).toBe('https://example.com/meeting');
  expect(addressSuggestions('unmatchedword', []).filter(row => row.kind === 'url')).toHaveLength(0);
});
test('R-21 R-22 検索候補はGoogle URLを生成し入力を勝手に送信しない', () => {
  const rows = addressSuggestions('日本語 検索', []);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.kind).toBe('search');
  expect(new URL(rows[0]!.url).searchParams.get('q')).toBe('日本語 検索');
});
test('R-21 S-06 不正スキームと資格情報を持つURLは候補にしない', () => {
  for (const query of ['', 'javascript:alert(1)', 'data:text/html,a', 'chrome://settings', 'file:///tmp/a']) expect(addressSuggestions(query, [])).toEqual([]);
  const rows = addressSuggestions('example', [{ url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.com/private' }]);
  expect(rows.some(row => row.url.includes('secret'))).toBe(false);
});
test('R-21 候補は最大6件で、完全なURLは直接開く候補になる', () => {
  const rows = addressSuggestions('example', Array.from({ length: 30 }, (_, i) => ({ url: `https://example.com/${i}` })));
  expect(rows).toHaveLength(6);
  expect(addressSuggestions('http://localhost:3000/test', [])[0]!.url).toBe('http://localhost:3000/test');
});
