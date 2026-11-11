import { describe, expect, it } from 'vitest';
import { measureTree, movePaneToSide, type SplitTree } from './splitTree';

const viewport = { width: 1200, height: 800 };
const tree: SplitTree = { axis: 'x', ratio: .5, first: { axis: 'y', ratio: 1 / 3, first: { pane: 0 }, second: { axis: 'y', ratio: .5, first: { pane: 3 }, second: { pane: 1 } } }, second: { pane: 2 } };

describe('R-55 枠の辺と外周への移動', () => {
  it('2を4の左に置き、1の下に2と4を並べて右の3を保つ', () => {
    const original = structuredClone(tree);
    const result = movePaneToSide(tree, 1, { kind: 'pane', slot: 3, side: 'left' }, viewport)!;
    const boxes = measureTree(result).panes;
    expect(boxes.get(0)).toEqual({ x: 0, y: 0, width: .5, height: 1 / 3 });
    expect(boxes.get(1)).toMatchObject({ x: 0, y: 1 / 3, width: .25 });
    expect(boxes.get(3)).toMatchObject({ x: .25, y: 1 / 3, width: .25 });
    expect(boxes.get(1)!.height).toBeCloseTo(2 / 3);
    expect(boxes.get(3)!.height).toBeCloseTo(2 / 3);
    expect(boxes.get(2)).toEqual({ x: .5, y: 0, width: .5, height: 1 });
    expect(tree).toEqual(original);
  });
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    it(`${side}の外周に移動する`, () => {
      const result = movePaneToSide(tree, 1, { kind: 'outer', side }, viewport)!;
      const b = measureTree(result).panes.get(1)!;
      if (side === 'left') { expect(b.x).toBe(0); expect(b.width).toBeCloseTo(1 / 3); }
      if (side === 'right') { expect(b.x).toBeCloseTo(2 / 3); expect(b.width).toBeCloseTo(1 / 3); }
      if (side === 'top') { expect(b.y).toBe(0); expect(b.height).toBeCloseTo(1 / 3); }
      if (side === 'bottom') { expect(b.y).toBeCloseTo(2 / 3); expect(b.height).toBeCloseTo(1 / 3); }
    });
    it(`${side}の枠の辺に移動する`, () => {
      const result = movePaneToSide(tree, 1, { kind: 'pane', slot: 0, side }, viewport)!;
      const boxes = measureTree(result).panes, a = boxes.get(1)!, b = boxes.get(0)!;
      if (side === 'left') expect(a.x + a.width).toBeCloseTo(b.x);
      if (side === 'right') expect(b.x + b.width).toBeCloseTo(a.x);
      if (side === 'top') expect(a.y + a.height).toBeCloseTo(b.y);
      if (side === 'bottom') expect(b.y + b.height).toBeCloseTo(a.y);
    });
  }
  it('自分自身、存在しない枠、極小の表示領域は拒否する', () => {
    expect(movePaneToSide(tree, 1, { kind: 'pane', slot: 1, side: 'left' }, viewport)).toBeNull();
    expect(movePaneToSide(tree, 1, { kind: 'pane', slot: 9, side: 'left' }, viewport)).toBeNull();
    expect(movePaneToSide(tree, 1, { kind: 'pane', slot: 3, side: 'left' }, { width: 200, height: 100 })).toBeNull();
  });
});
