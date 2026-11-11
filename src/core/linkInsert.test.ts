import { describe, expect, it } from 'vitest';
import { defaultTree, insertPaneAt, measureTree } from './splitTree';

describe('R-79 リンク追加の配置', () => {
  const tree = defaultTree(4, 'landscape');
  const viewport = { width: 1200, height: 800 };
  it('既存境界の間に1枠を追加し全既存枠を残す', () => {
    const result = insertPaneAt(tree, 4, { kind: 'divider', path: '' }, viewport)!;
    expect([...measureTree(result).panes.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(tree).toEqual(defaultTree(4, 'landscape'));
  });
  it('指定した枠の辺だけを分割する', () => {
    const result = insertPaneAt(tree, 4, { kind: 'pane', slot: 2, side: 'right' }, viewport)!;
    const before = measureTree(tree).panes, after = measureTree(result).panes;
    expect(after.get(0)).toEqual(before.get(0));
    expect(after.get(1)).toEqual(before.get(1));
    expect(after.get(4)!.x).toBeGreaterThan(after.get(2)!.x);
  });
  it('外周に追加し無効な境界と狭すぎる配置を拒否する', () => {
    const result = insertPaneAt(tree, 4, { kind: 'outer', side: 'left' }, viewport)!;
    expect(measureTree(result).panes.get(4)!.x).toBe(0);
    expect(insertPaneAt(tree, 4, { kind: 'divider', path: 'xxx' }, viewport)).toBeNull();
    expect(insertPaneAt(tree, 4, { kind: 'pane', slot: 2, side: 'right' }, { width: 100, height: 80 })).toBeNull();
  });
});
