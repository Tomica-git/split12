import { moveDividersWithin } from './dividerOperations';
import { measureTree, type Divider, type SplitTree } from './splitTree';
import type { Junction } from './junctions';

export const SNAP_PX = 8;
export const MIN_PANE_WIDTH = 96;
export const MIN_PANE_HEIGHT = 64;
export type SnapGuide = { axis: 'x' | 'y'; position: number };
export type SnapResult = { tree: SplitTree; guides: SnapGuide[] };

function position(divider: Divider): number { return divider.axis === 'x' ? divider.x : divider.y; }
function touches(a: Divider, b: Divider): boolean {
  const [aStart, aEnd] = a.axis === 'x' ? [a.y, a.y + a.height] : [a.x, a.x + a.width];
  const [bStart, bEnd] = b.axis === 'x' ? [b.y, b.y + b.height] : [b.x, b.x + b.width];
  return aStart <= bEnd + 1e-7 && bStart <= aEnd + 1e-7;
}
function clampMove(tree: SplitTree, baseline: SplitTree, paths: readonly string[], delta: number, width: number, height: number): SplitTree {
  const original = measureTree(baseline).panes;
  return moveDividersWithin(tree, paths, delta, next => {
    for (const [id, box] of measureTree(next).panes) {
      const before = original.get(id);
      if (!before || box.width * width + 1e-6 < Math.min(MIN_PANE_WIDTH, before.width * width)
        || box.height * height + 1e-6 < Math.min(MIN_PANE_HEIGHT, before.height * height)) return false;
    }
    return true;
  });
}

export function snapDividers(tree: SplitTree, paths: readonly string[], delta: number, width: number, height: number, disabled = false, baseline: SplitTree = tree): SnapResult {
  const dividers = measureTree(tree).dividers, selected = dividers.filter(item => paths.includes(item.path));
  if (!selected.length || !Number.isFinite(delta) || width <= 0 || height <= 0) return { tree, guides: [] };
  const axis = selected[0]!.axis;
  if (!selected.every(item => item.axis === axis) || selected.length !== new Set(paths).size) return { tree, guides: [] };
  const size = axis === 'x' ? width : height;
  const candidates = dividers.filter(item => item.axis === axis && !paths.includes(item.path) && !paths.some(path => item.path.startsWith(path)));
  const choices = selected.flatMap(moving => candidates.filter(candidate => touches(moving, candidate)).map(candidate => ({ moving, candidate, distance: Math.abs((position(moving) + delta - position(candidate)) * size) })));
  choices.sort((a, b) => a.distance - b.distance || position(a.candidate) - position(b.candidate) || a.candidate.path.localeCompare(b.candidate.path) || a.moving.path.localeCompare(b.moving.path));
  const best = choices[0];
  if (!disabled && best && best.distance <= SNAP_PX + 1e-8) {
    const snapped = clampMove(tree, baseline, paths, position(best.candidate) - position(best.moving), width, height);
    const moved = measureTree(snapped).dividers.find(item => item.path === best.moving.path);
    if (moved && Math.abs(position(moved) - position(best.candidate)) * size < 0.01) return { tree: snapped, guides: [{ axis, position: position(best.candidate) }] };
  }
  return { tree: clampMove(tree, baseline, paths, delta, width, height), guides: [] };
}

export function snapJunction(tree: SplitTree, point: Junction, dx: number, dy: number, width: number, height: number, disabled = false): SnapResult {
  const x = snapDividers(tree, point.vertical, dx, width, height, disabled);
  const y = snapDividers(x.tree, point.horizontal, dy, width, height, disabled, tree);
  return { tree: y.tree, guides: [...x.guides, ...y.guides] };
}
