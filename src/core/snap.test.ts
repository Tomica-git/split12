import { expect, test } from 'vitest';
import { moveDividers } from './dividerOperations';
import { findJunctions } from './junctions';
import { snapDividers, snapJunction } from './snap';
import { defaultTree, measureTree, validTree, type SplitTree } from './splitTree';

const position = (tree: SplitTree, path: string) => measureTree(tree).dividers.find(item => item.path === path)!;
test('R-32 一次元スナップはCSSピクセルの閾値とAlt無効を守る', () => {
  const tree = moveDividers(defaultTree(4, 'landscape'), ['0'], .1);
  const near = snapDividers(tree, ['0'], -.095, 1000, 800);
  expect(position(near.tree, '0').x).toBeCloseTo(position(tree, '1').x, 10);
  expect(near.guides).toEqual([{ axis: 'x', position: .5 }]);
  expect(snapDividers(tree, ['0'], -.091, 1000, 800).guides).toEqual([]);
  expect(snapDividers(tree, ['0'], -.095, 1000, 800, true).guides).toEqual([]);
  expect(snapDividers(tree, ['0'], -.09, 640, 800).guides).toHaveLength(1);
});
test('R-32 接しない離れた境界へ吸着しない', () => {
  const tree: SplitTree = { axis: 'y', ratio: 1 / 3, first: { axis: 'x', ratio: .4, first: { pane: 0 }, second: { pane: 1 } }, second: { axis: 'y', ratio: .5, first: { pane: 2 }, second: { axis: 'x', ratio: .5, first: { pane: 3 }, second: { pane: 4 } } } };
  const result = snapDividers(tree, ['0'], .095, 1000, 800);
  expect(result.guides).toEqual([]); expect(position(result.tree, '0').x).toBeCloseTo(.495);
});
test('R-32 交点では片軸を吸着しながらもう片軸を同時に動かす', () => {
  const tree = moveDividers(defaultTree(4, 'landscape'), ['0'], .1);
  const point = findJunctions(tree).find(item => item.x > .55)!;
  const result = snapJunction(tree, point, -.095, .1, 1000, 800);
  expect(position(result.tree, '0').x).toBeCloseTo(position(result.tree, '1').x, 10);
  expect(position(result.tree, '').y).toBeCloseTo(.6);
  expect(result.guides).toEqual([{ axis: 'x', position: .5 }]);
});
test('R-32 枠の最小寸法と元から小さい枠をこれ以上縮めない制約を守る', () => {
  const tree = defaultTree(4, 'landscape');
  const moved = snapDividers(tree, ['0'], -10, 1000, 800);
  expect(measureTree(moved.tree).panes.get(0)!.width * 1000).toBeGreaterThanOrEqual(96 - 1e-4);
  expect(validTree(moved.tree, 4)).toBe(true);
  const small = snapDividers(tree, ['0'], -.1, 150, 800);
  expect(measureTree(small.tree).panes.get(0)!.width * 150).toBeCloseTo(75);
});
