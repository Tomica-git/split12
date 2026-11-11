import { expect, test } from 'vitest';
import { defaultTree, measureTree, validTree } from './splitTree';
import { findJunctions, moveJunction } from './junctions';

test('R-25 十字の交点は上下の縦境界と横境界をまとめる', () => {
  const tree = defaultTree(4, 'landscape');
  const points = findJunctions(tree);
  expect(points).toHaveLength(1);
  expect(points[0]!.x).toBeCloseTo(.5); expect(points[0]!.y).toBeCloseTo(.5);
  expect(points[0]!.vertical.sort()).toEqual(['0', '1']); expect(points[0]!.horizontal).toEqual(['']);
});
test('R-25 3+1のT字2か所と交点のない横並びを検出する', () => {
  const t = findJunctions(defaultTree(4, 'landscape', true));
  expect(t).toHaveLength(2);
  expect(t.every(point => point.vertical.length === 1 && point.horizontal.length === 1)).toBe(true);
  expect(findJunctions(defaultTree(3, 'landscape'))).toHaveLength(0);
});
test('R-25 十字を同時移動し生存タブの形状と有効な配置を維持する', () => {
  const tree = defaultTree(4, 'landscape'), initial = structuredClone(tree), point = findJunctions(tree)[0]!;
  const moved = moveJunction(tree, point, .1, .2);
  const before = measureTree(tree).panes.get(0)!, after = measureTree(moved).panes.get(0)!;
  expect(after.width - before.width).toBeCloseTo(.1); expect(after.height - before.height).toBeCloseTo(.2);
  expect(validTree(moved, 4)).toBe(true); expect(tree).toEqual(initial);
});
test('R-25 一方が端に達しても他方向は動き、枠をつぶさない', () => {
  const tree = defaultTree(4, 'landscape'), point = findJunctions(tree)[0]!;
  const moved = moveJunction(tree, point, 100, .1), box = measureTree(moved).panes.get(0)!;
  expect(box.height).toBeCloseTo(.6); expect(box.width).toBeLessThan(1); expect(validTree(moved, 4)).toBe(true);
});
