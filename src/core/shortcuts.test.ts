import { describe, expect, it } from 'vitest';
import { matchesShortcut } from './shortcuts';

const event = (key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent => ({
  key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  repeat: false, isComposing: false, ...modifiers,
} as KeyboardEvent);

describe('設定済みショートカット', () => {
  it('Chrome の文字列表記と Mac の記号表記を照合する', () => {
    const up = event('ArrowUp', { altKey: true, shiftKey: true });
    expect(matchesShortcut('Alt+Shift+Up', up)).toBe(true);
    expect(matchesShortcut('⌥⇧↑', up)).toBe(true);
    expect(matchesShortcut('Alt+Shift+Down', up)).toBe(false);
  });
  it('変更した文字キーと修飾キーを照合し、未設定や余分なキーを無視する', () => {
    const custom = event('K', { metaKey: true, shiftKey: true });
    expect(matchesShortcut('Command+Shift+K', custom)).toBe(true);
    expect(matchesShortcut('Alt+Shift+K', event('', { code: 'KeyK', altKey: true, shiftKey: true }))).toBe(true);
    expect(matchesShortcut('Command+K', custom)).toBe(false);
    expect(matchesShortcut('', custom)).toBe(false);
    expect(matchesShortcut('Command+Shift+K', event('K', { metaKey: true, shiftKey: true, repeat: true }))).toBe(false);
  });
});
