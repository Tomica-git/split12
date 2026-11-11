import { measureTree, type SplitTree } from './splitTree';
import { moveDividers } from './dividerOperations';

export type Junction = { x: number; y: number; vertical: string[]; horizontal: string[] };

// A junction is where a vertical and a horizontal divider meet, including a T.
// Group coincident segments so the two sides of a cross move together.
export function findJunctions(tree: SplitTree): Junction[] {
  const dividers = measureTree(tree).dividers;
  const vertical = dividers.filter(item => item.axis === 'x');
  const horizontal = dividers.filter(item => item.axis === 'y');
  const points = new Map<string, Junction>();
  const epsilon = 1e-7;
  for (const v of vertical) for (const h of horizontal) {
    if (v.x < h.x - epsilon || v.x > h.x + h.width + epsilon || h.y < v.y - epsilon || h.y > v.y + v.height + epsilon) continue;
    if (v.x <= epsilon || v.x >= 1 - epsilon || h.y <= epsilon || h.y >= 1 - epsilon) continue;
    const key = `${Math.round(v.x / epsilon)}:${Math.round(h.y / epsilon)}`;
    let point = points.get(key);
    if (!point) { point = { x: v.x, y: h.y, vertical: [], horizontal: [] }; points.set(key, point); }
    if (!point.vertical.includes(v.path)) point.vertical.push(v.path);
    if (!point.horizontal.includes(h.path)) point.horizontal.push(h.path);
  }
  return [...points.values()];
}

export function moveJunction(tree: SplitTree, junction: Junction, dx: number, dy: number): SplitTree {
  return moveDividers(moveDividers(tree, junction.vertical, dx), junction.horizontal, dy);
}
