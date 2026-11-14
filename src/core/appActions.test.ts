import { expect, test } from 'vitest';
import { appActionForKey, isAppAction } from './appActions';
import { parseViewRegistry, validViewId, viewIdFromUrl, viewWorkspaceKey } from './views';

const key = (value: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent => ({ key: value, code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, ...modifiers } as KeyboardEvent);
test('R-17 R-69 配置履歴・枠追加はMacとCtrlで同じで、Shift+Dは⌘なら右に追加・Ctrlなら削除', () => {
  // R-69 reassigned ⌘⇧D to 「固定枠の右に追加」; deleting stays on Ctrl⇧D, the button, and the configurable command.
  expect(appActionForKey(key('D', { metaKey: true, shiftKey: true }))).toBe('split-right');
  expect(appActionForKey(key('D', { ctrlKey: true, shiftKey: true }))).toBe('close-pane');
  for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
    expect(appActionForKey(key('{', { ...mod, shiftKey: true }))).toBe('layout-undo');
    expect(appActionForKey(key(']', { ...mod, shiftKey: true }))).toBe('layout-redo');
    expect(appActionForKey(key('˜', { ...mod, altKey: true, code: 'KeyN' }))).toBe('split-add');
  }
});
test('R-17 ページ履歴は構造履歴と別のキーで戻る・進むを使う', () => {
  expect(appActionForKey(key('-', { ctrlKey: true, code: 'Minus' }), true)).toBe('page-back');
  expect(appActionForKey(key('_', { ctrlKey: true, shiftKey: true, code: 'Minus' }), true)).toBe('page-forward');
});
test('R-26 Macの拡大縮小だけを選択枠に割り当て、既存のCtrl操作を維持する', () => {
  expect(appActionForKey(key('+', { metaKey: true, shiftKey: true, code: 'Equal' }), true, true)).toBe('zoom-in');
  expect(appActionForKey(key('_', { metaKey: true, shiftKey: true, code: 'Minus' }), true, true)).toBe('zoom-out');
  expect(appActionForKey(key('=', { metaKey: true, shiftKey: true, code: 'Equal' }))).toBe('zoom-in');
  expect(appActionForKey(key('_', { ctrlKey: true, shiftKey: true, code: 'Minus' }), true)).toBe('page-forward');
  expect(appActionForKey(key('+', { metaKey: true, code: 'Equal' }))).toBeNull();
  expect(appActionForKey(key(';', { metaKey: true, shiftKey: true, code: 'Semicolon' }))).toBe('zoom-out');
  expect(appActionForKey(key('~', { metaKey: true, shiftKey: true, code: 'Equal' }))).toBeNull();
});
test('R-39 日本語配列のキー値と物理位置を区別し余分な修飾・IME・リピートを除外する', () => {
  const mac = { metaKey: true, shiftKey: true };
  expect(appActionForKey(key('+', { ...mac, code: 'Semicolon' }), true, true)).toBe('zoom-out');
  expect(appActionForKey(key('=', { ...mac, code: 'Minus' }), true, true)).toBe('zoom-out');
  expect(appActionForKey(key('~', { ...mac, code: 'Equal' }))).toBeNull();
  for (const extra of [
    { isComposing: true }, { repeat: true }, { ctrlKey: true }, { altKey: true },
    { getModifierState: (name: string) => name === 'AltGraph' },
  ]) {
    expect(appActionForKey(key('+', { ...mac, code: 'Semicolon', ...extra }), true, true)).toBeNull();
    expect(appActionForKey(key('=', { ...mac, code: 'Minus', ...extra }), true, true)).toBeNull();
  }
});
test('R-56 Cmd Shift の引用符キーで拡大しセミコロンキーで縮小する', () => {
  const mac = { metaKey: true, shiftKey: true };
  for (const value of ["'", '"', '‘', '’']) expect(appActionForKey(key(value, { ...mac, code: 'Quote' }), true, true)).toBe('zoom-in');
  expect(appActionForKey(key("'", { ...mac, code: 'Digit7' }), true, true)).toBe('zoom-in');
  for (const value of [';', ':', '+']) expect(appActionForKey(key(value, { ...mac, code: 'Semicolon' }), true, true)).toBe('zoom-out');
});
test('R-17 サイト内のN・B・上下と既存Kは横取りしない', () => {
  for (const value of ['n', 'b', 'ArrowUp', 'ArrowDown', 'k']) expect(appActionForKey(key(value, { metaKey: true }), true, true)).toBeNull();
  expect(appActionForKey(key('b', { metaKey: true }), false, true)).toBeNull();
  expect(appActionForKey(key('ArrowDown', { metaKey: true }), false, false)).toBe('view-down');
  expect(appActionForKey(key('n', { metaKey: true }), false)).toBe('new-view');
  expect(appActionForKey(key('b', { metaKey: true }), false)).toBe('toggle-sidebar');
  expect(isAppAction('__proto__')).toBe(false);
});
test('R-17 IMEとリピート、余分な修飾キーを操作にしない', () => {
  for (const extra of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }]) expect(appActionForKey(key('D', { metaKey: true, shiftKey: true, ...extra }))).toBeNull();
  expect(appActionForKey(key('n', { ctrlKey: true, altKey: true, getModifierState: value => value === 'AltGraph' }))).toBeNull();
});
test('R-18 保存ビューの入力を検証し、重複・別形式・不正IDを除外する', () => {
  const id = '12345678-1234-1234-1234-123456789012';
  const main = { id: 'main', title: 'ビュー1', createdAt: 1 };
  expect(parseViewRegistry({ schemaVersion: 1, views: [main, main, { id, title: '独立ビュー', createdAt: 2 }, { id: '../workspace', title: '', createdAt: 0 }, null] })).toEqual([main, { id, title: '独立ビュー', createdAt: 2 }]);
  expect(parseViewRegistry({ schemaVersion: 2, views: [main] })).toEqual([]);
  expect(validViewId('-'.repeat(36))).toBe(false);
  expect(viewIdFromUrl(`chrome-extension://id/split.html?view=${id}`)).toBe(id);
  expect(viewIdFromUrl('chrome-extension://id/split.html?view=bad')).toBe('main');
  expect(viewWorkspaceKey('main')).toBe('workspace');
  expect(viewWorkspaceKey(id)).toBe(`workspace:${id}`);
});

test('R-69 Cmd Shift W A S D は固定枠の四方向に追加し、サイト内でも同じ', () => {
  for (const [letter, action] of [['W', 'split-up'], ['A', 'split-left'], ['S', 'split-down'], ['D', 'split-right']] as const) {
    expect(appActionForKey(key(letter, { metaKey: true, shiftKey: true }))).toBe(action);
    expect(appActionForKey(key(letter, { metaKey: true, shiftKey: true }), true)).toBe(action);
  }
});

import { nextViewTitle, uniqueViewTitle } from './views';
test('R-95 新しいビューの名前は一覧にない最小の番号にし、複製名も重複させない', () => {
  const views = ['ビュー 1', 'ビュー 2', '趣味', 'ビュー 6', 'ビュー 6'].map(title => ({ title }));
  expect(nextViewTitle(views)).toBe('ビュー 3');
  expect(nextViewTitle([])).toBe('ビュー 1');
  expect(nextViewTitle(['ビュー 1', 'ビュー 2', 'ビュー 3'].map(title => ({ title })))).toBe('ビュー 4');
  expect(uniqueViewTitle(views, '趣味（コピー）')).toBe('趣味（コピー）');
  expect(uniqueViewTitle([...views, { title: '趣味（コピー）' }], '趣味（コピー）')).toBe('趣味（コピー） 2');
});
