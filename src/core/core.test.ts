import { describe, expect, test } from 'vitest';
import { computeLayout, type Orientation } from './layout';
import { isOpenableUrl, lacksDomain, normalizeUserUrl } from './url';
import { normalizeHost } from './host';
import { buildSessionRules } from './rules';
import { defaultWorkspace, parseWorkspace } from './workspace';
import { canGoBack, canGoForward, emptyHistory, paneHistory } from './paneHistory';
import { targetPane } from './targetPane';

describe('R-02 レイアウト', () => {
  for (const orientation of ['landscape', 'portrait'] as Orientation[]) {
    for (let count = 1; count <= 12; count++) {
      test(`${count} 枚 / ${orientation} は全セルを一度だけ覆う`, () => {
        const layout = computeLayout(count, orientation);
        const cells = Array.from({ length: layout.rows }, () => Array(layout.cols).fill(0) as number[]);
        expect(layout.panes).toHaveLength(count);
        for (const p of layout.panes) {
          for (let row = p.row - 1; row < p.row - 1 + p.rowSpan; row++) {
            for (let col = p.col - 1; col < p.col - 1 + p.colSpan; col++) cells[row]![col]!++;
          }
        }
        expect(cells.flat().every(n => n === 1)).toBe(true);
      });
    }
  }
});

describe('R-04 S-06 URL の入口', () => {
  test.each([
    ['example.com', 'https://example.com/'], ['  example.com  ', 'https://example.com/'],
    ['localhost:3000', 'http://localhost:3000/'], ['127.0.0.1:80', 'http://127.0.0.1/'],
    ['http://example.com/a', 'http://example.com/a'], ['localhost', 'http://localhost/'], ['http://intranet/', 'http://intranet/'],
  ])('%s を正規化', (input, expected) => expect(normalizeUserUrl(input)).toBe(expected));
  test.each(['javascript:alert(1)', 'data:text/html,a', 'file:///etc/a', 'chrome://settings', 'chrome-extension://abc/a', '', '   ', 'two words', 'http://bad space'])('%s を拒否', input => {
    expect(normalizeUserUrl(input)).toBeNull();
    expect(isOpenableUrl(input)).toBe(false);
  });
  test.each(['muse', 'muse/', 'foo/bar', 'muse?q=1'])('スキームの無い1語 %s はドメイン不足として拒否', input => {
    expect(normalizeUserUrl(input)).toBeNull();
    expect(lacksDomain(input)).toBe(true);
  });
  test.each(['example.com', 'localhost', 'localhost:3000', 'two words', 'javascript:alert(1)'])('%s はドメイン不足として扱わない', input => {
    expect(lacksDomain(input)).toBe(false);
  });
  test('http と https のみ受け付ける', () => {
    expect(isOpenableUrl('https://example.com/')).toBe(true);
    expect(isOpenableUrl('http://localhost:3000/')).toBe(true);
    expect(isOpenableUrl('example.com')).toBe(false);
  });
});

describe('許可ホスト', () => {
  test.each([
    ['HTTPS://WWW.Example.COM.:443/a', 'example.com'], ['www.example.com', 'example.com'],
    ['https://日本語.jp:8080/', 'xn--wgv71a119e.jp'], ['http://[::1]:8080', null], ['', null],
  ])('%s を正規化する', (input, expected) => expect(normalizeHost(input)).toBe(expected));
});

describe('S-01 S-04 セッションルール', () => {
  test('タブとホストのどちらかが空なら作らない', () => {
    expect(buildSessionRules({ tabIds: [], hosts: ['a.test'] })).toEqual([]);
    expect(buildSessionRules({ tabIds: [1], hosts: [] })).toEqual([]);
  });
  test('対象タブとサブフレームに限定し frame-ancestors の CSP のみ除去', () => {
    const rules = buildSessionRules({ tabIds: [42], hosts: ['a.test'] });
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.condition.tabIds).toEqual([42]);
      expect(rule.condition.resourceTypes).toEqual(['sub_frame']);
      expect(rule.condition.requestDomains).toEqual(['a.test']);
    }
    expect(rules[1]!.condition.responseHeaders).toEqual([{ header: 'content-security-policy', values: ['*frame-ancestors*'] }]);
  });
});

describe('R-09 S-06 保存データ', () => {
  test.each([null, 'a', [], { ...defaultWorkspace(), count: 0 }, { ...defaultWorkspace(), count: 13 },
    { ...defaultWorkspace(), count: '4' }, { ...defaultWorkspace(), schemaVersion: 2 },
    { ...defaultWorkspace(), panes: Array(7).fill({ url: '', zoom: 1 }) },
    { ...defaultWorkspace(), panes: Array(9).fill({ url: '', zoom: 1 }) },
  ])('不正な全体データを既定値に戻す', input => expect(parseWorkspace(input)).toEqual(defaultWorkspace()));
  test('不正 URL は当該ペインだけ空にする', () => {
    const value = defaultWorkspace();
    value.panes[0]!.url = 'javascript:alert(1)';
    value.panes[1]!.url = 'https://example.com/';
    const parsed = parseWorkspace(value);
    expect(parsed.panes[0]!.url).toBe('');
    expect(parsed.panes[1]!.url).toBe('https://example.com/');
  });
  test('旧8ペインの保存内容を保持して12ペインに移行する', () => {
    const old = defaultWorkspace();
    old.panes = old.panes.slice(0, 8);
    old.panes[7]!.url = 'https://example.com/';
    const parsed = parseWorkspace(old);
    expect(parsed.panes).toHaveLength(12);
    expect(parsed.panes[7]!.url).toBe('https://example.com/');
    expect(parsed.panes[8]!.url).toBe('');
  });
});

describe('R-05 ペイン別履歴', () => {
  test('重複、戻る、先の履歴の破棄、リダイレクトを扱う', () => {
    let state = emptyHistory();
    state = paneHistory(state, { type: 'commit', url: 'a' });
    state = paneHistory(state, { type: 'commit', url: 'a' });
    state = paneHistory(state, { type: 'commit', url: 'b' });
    expect(canGoBack(state)).toBe(true);
    state = paneHistory(state, { type: 'commit', url: 'a', traverseIndex: 0 });
    expect(canGoForward(state)).toBe(true);
    state = paneHistory(state, { type: 'commit', url: 'redirect', traverseIndex: 1 });
    expect(state).toEqual({ entries: ['a', 'redirect'], index: 1 });
    state = paneHistory(state, { type: 'commit', url: 'a', forwardBack: true });
    state = paneHistory(state, { type: 'commit', url: 'c' });
    expect(state).toEqual({ entries: ['a', 'c'], index: 1 });
  });
  test('古い項目から最大 50 件に制限', () => {
    let state = emptyHistory();
    for (let i = 0; i < 60; i++) state = paneHistory(state, { type: 'commit', url: String(i) });
    expect(state.entries).toHaveLength(50);
    expect(state.entries[0]).toBe('10');
  });
});

describe('R-11 R-12 空きペインの選択', () => {
  test('空き、数の拡張、満杯を区別する', () => {
    const panes = defaultWorkspace().panes;
    panes[0]!.url = 'https://a.test/';
    expect(targetPane(1, panes)).toEqual({ index: 1, count: 2 });
    expect(targetPane(2, panes)).toEqual({ index: 1, count: 2 });
    panes.forEach(pane => { pane.url = 'https://a.test/'; });
    expect(targetPane(8, panes)).toBeNull();
    panes[3]!.url = '';
    expect(targetPane(1, panes)).toEqual({ index: 3, count: 4 });
    panes[3]!.url = 'https://a.test/';
    expect(targetPane(1, panes)).toBeNull();
  });
});
