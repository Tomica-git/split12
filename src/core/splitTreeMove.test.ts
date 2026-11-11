import { describe, expect, it } from 'vitest';
import { defaultTree, measureTree, movePaneToDivider, validTree, type SplitTree } from './splitTree';

const viewport = { width: 1200, height: 800 };
const box = (tree: SplitTree, slot: number) => measureTree(tree).panes.get(slot)!;

describe('R-35 既存の枠を境界へ移動', () => {
  it('2番を3番と4番の境界に置き、上1つ・下3つの均等配置にする', () => {
    const original = defaultTree(4, 'landscape');
    const snapshot = structuredClone(original);
    const result = movePaneToDivider(original, 1, '1', viewport);
    expect(result).not.toBeNull();
    expect(original).toEqual(snapshot);
    expect(validTree(result, 4)).toBe(true);
    expect(box(result!, 0)).toEqual({ x: 0, y: 0, width: 1, height: .5 });
    for (const [slot, x] of [[2, 0], [1, 1 / 3], [3, 2 / 3]] as const) {
      const area = box(result!, slot);
      expect(area.x).toBeCloseTo(x);
      expect(area.y).toBeCloseTo(.5);
      expect(area.width).toBeCloseTo(1 / 3);
      expect(area.height).toBeCloseTo(.5);
    }
  });

  it('非均等な境界では両側の比を保ち間に親領域の3分の1を挿入する', () => {
    const tree: SplitTree = { axis: 'y', ratio: .5, first: { axis: 'x', ratio: .5, first: { pane: 0 }, second: { pane: 1 } },
      second: { axis: 'x', ratio: .25, first: { pane: 2 }, second: { pane: 3 } } };
    const result = movePaneToDivider(tree, 1, '1', viewport)!;
    expect(box(result, 2).width).toBeCloseTo(1 / 6);
    expect(box(result, 1).width).toBeCloseTo(1 / 3);
    expect(box(result, 3).width).toBeCloseTo(1 / 2);
  });

  it('上下の境界にも挿入でき、残るIDを保つ', () => {
    const tree = defaultTree(4, 'portrait');
    const result = movePaneToDivider(tree, 1, '1', viewport)!;
    expect(validTree(result, 4)).toBe(true);
    expect(box(result, 0).height).toBeCloseTo(1);
    expect(box(result, 2).y).toBeCloseTo(0);
    expect(box(result, 1).y).toBeCloseTo(1 / 3);
    expect(box(result, 3).y).toBeCloseTo(2 / 3);
  });

  it('元の親が消えても別の対象境界を正しく追跡する', () => {
    const tree: SplitTree = { axis: 'x', ratio: .5, first: { axis: 'x', ratio: .5, first: { pane: 0 }, second: { pane: 1 } },
      second: { axis: 'y', ratio: .5, first: { pane: 2 }, second: { pane: 3 } } };
    const result = movePaneToDivider(tree, 1, '1', viewport)!;
    expect(validTree(result, 4)).toBe(true);
    expect(box(result, 0).width).toBeCloseTo(.5);
    expect(box(result, 2).y).toBeCloseTo(0);
    expect(box(result, 1).y).toBeCloseTo(1 / 3);
    expect(box(result, 3).y).toBeCloseTo(2 / 3);
  });

  it('移動元が対象境界の子孫でも生き残る境界なら正しく挿入する', () => {
    const tree: SplitTree = { axis: 'x', ratio: .5, first: { axis: 'y', ratio: .5, first: { pane: 0 }, second: { pane: 1 } }, second: { pane: 2 } };
    const result = movePaneToDivider(tree, 1, '', viewport)!;
    expect(validTree(result, 3)).toBe(true);
    expect(box(result, 0).width).toBeCloseTo(1 / 3);
    expect(box(result, 1).x).toBeCloseTo(1 / 3);
    expect(box(result, 2).x).toBeCloseTo(2 / 3);
  });

  it('存在しない枠・境界や移動元の削除で消える境界は変更しない', () => {
    const tree = defaultTree(4, 'landscape');
    expect(movePaneToDivider(tree, 9, '1', viewport)).toBeNull();
    expect(movePaneToDivider(tree, 1, '10', viewport)).toBeNull();
    expect(movePaneToDivider(tree, 1, '2', viewport)).toBeNull();
    expect(movePaneToDivider(tree, 1, '0', viewport)).toBeNull();
    expect(movePaneToDivider(tree, 1, '1', { width: 0, height: 800 })).toBeNull();
  });

  it('最小サイズに収まらない場合は移動しない', () => {
    const tree = defaultTree(4, 'landscape');
    expect(movePaneToDivider(tree, 1, '1', { width: 240, height: 800 })).toBeNull();
    expect(movePaneToDivider(defaultTree(4, 'portrait'), 1, '1', { width: 1200, height: 150 })).toBeNull();
  });
});
