import { expect, test } from 'vitest';
import { defaultTree, measureTree, validTree } from './splitTree';
import { flipDividers, moveDividers } from './dividerOperations';

const x = (tree: ReturnType<typeof defaultTree>, path: string) => measureTree(tree).dividers.find(node => node.path === path)!.x;
test('R-23 別の親を持つ同方向境界へ同じ画面上の移動量を適用する', () => {
  const tree = defaultTree(4, 'landscape');
  const original = structuredClone(tree);
  const moved = moveDividers(tree, ['0', '1'], .1);
  expect(x(moved, '0') - x(tree, '0')).toBeCloseTo(.1);
  expect(x(moved, '1') - x(tree, '1')).toBeCloseTo(.1);
  expect(validTree(moved, 4)).toBe(true);
  expect(tree).toEqual(original);
});
test('R-23 親子の境界も同じ移動量を保ち比率を正しく計算する', () => {
  const tree = defaultTree(3, 'landscape');
  const moved = moveDividers(tree, ['', '1'], .1);
  expect(x(moved, '') - x(tree, '')).toBeCloseTo(.1);
  expect(x(moved, '1') - x(tree, '1')).toBeCloseTo(.1);
  expect(validTree(moved, 3)).toBe(true);
});
test('R-23 端では選択全体を共通量で止め枠を潰さない', () => {
  const tree = defaultTree(3, 'landscape');
  for (const amount of [-100, 100]) {
    const moved = moveDividers(tree, ['', '1'], amount);
    const first = x(moved, '') - x(tree, '');
    expect(x(moved, '1') - x(tree, '1')).toBeCloseTo(first);
    expect(validTree(moved, 3)).toBe(true);
    for (const box of measureTree(moved).panes.values()) { expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0); }
  }
});
test('R-23 親子の反転は元の木の各対象に一度ずつ適用する', () => {
  const tree = defaultTree(3, 'landscape');
  const flipped = flipDividers(tree, ['', '1']);
  expect([...measureTree(flipped).panes].sort((a, b) => a[1].x - b[1].x).map(([id]) => id)).toEqual([2, 1, 0]);
  expect(validTree(flipped, 3)).toBe(true);
  expect([...measureTree(tree).panes.keys()]).toEqual([0, 1, 2]);
});
test('R-23 未選択の行や無効なパス・不正な移動量を変更しない', () => {
  const tree = defaultTree(4, 'landscape');
  expect(moveDividers(tree, [], .1)).toEqual(tree);
  expect(moveDividers(tree, ['missing'], .1)).toEqual(tree);
  expect(moveDividers(tree, ['0'], Number.NaN)).toEqual(tree);
  expect(flipDividers(tree, ['0', '0'])).toEqual(flipDividers(tree, ['0']));
  expect(measureTree(moveDividers(tree, ['0'], .1)).panes.get(2)).toEqual(measureTree(tree).panes.get(2));
});
