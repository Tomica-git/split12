import { describe, expect, it } from 'vitest';
import { linkSideFromDirection, pickDroppedUrl } from './linkDrop';

describe('R-79 ドロップされたリンクの解釈', () => {
  it('URL一覧のコメント行を飛ばして最初のURLを使う', () => {
    expect(pickDroppedUrl({ uriList: '# title\r\nhttps://example.com/a\r\nhttps://example.com/b', plain: 'x' })).toEqual({ url: 'https://example.com/a' });
  });
  it('URL一覧がなければHTMLのリンク先、次に本文を使う', () => {
    expect(pickDroppedUrl({ html: '<a href="https://example.com/card?a=1&amp;b=2"><img src="https://img.example/p.jpg"></a>' })).toEqual({ url: 'https://example.com/card?a=1&b=2' });
    expect(pickDroppedUrl({ plain: 'example.com/plain' })).toEqual({ url: 'https://example.com/plain' });
  });
  it('リンク付き画像はURL一覧のリンク先を使い、画像だけの場合は拒否する', () => {
    // Chrome writes <img> markup for a linked thumbnail while the URL list holds the link (YouTube video cards).
    expect(pickDroppedUrl({ uriList: 'https://www.youtube.com/watch?v=abc', html: '<img src="https://i.ytimg.com/vi/abc/hq720.jpg">' })).toEqual({ url: 'https://www.youtube.com/watch?v=abc' });
    expect(pickDroppedUrl({ uriList: 'https://img.example/p.jpg', html: '<img src="https://img.example/p.jpg">' })).toEqual({ url: null, reason: 'image' });
    expect(pickDroppedUrl({ html: '<img src="https://img.example/p.jpg">' })).toEqual({ url: null, reason: 'image' });
    expect(pickDroppedUrl({ plain: 'javascript:alert(1)' })).toEqual({ url: null, reason: 'invalid' });
    expect(pickDroppedUrl({})).toEqual({ url: null, reason: 'invalid' });
  });
  it('保存した追加方向を枠の辺に変換し未設定は右にする', () => {
    expect(['left', 'right', 'up', 'down', '', undefined].map(linkSideFromDirection)).toEqual(['left', 'right', 'top', 'bottom', 'right', 'right']);
  });
});
