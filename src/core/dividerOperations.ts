import { measureTree, validTree, type Box, type SplitTree } from './splitTree';

function targets(tree: SplitTree, paths: readonly string[]): Set<string> {
  const unique = new Set(paths);
  const dividers = measureTree(tree).dividers.filter(node => unique.has(node.path));
  return dividers.length === unique.size && dividers.every(node => node.axis === dividers[0]!.axis) ? unique : new Set();
}
export function moveDividers(tree: SplitTree, paths: readonly string[], delta: number): SplitTree {
  return moveDividersWithin(tree, paths, delta, () => true);
}
// All selected dividers keep the same absolute movement while additional
// display constraints participate in the same common clamp.
export function moveDividersWithin(tree: SplitTree, paths: readonly string[], delta: number, allowed: (value: SplitTree) => boolean): SplitTree {
  const selected = targets(tree, paths);
  if (!selected.size || !Number.isFinite(delta) || delta === 0) return tree;
  const measured = measureTree(tree);
  const start = new Map(measured.dividers.filter(node => selected.has(node.path)).map(node => [node.path, node.axis === 'x' ? node.x : node.y]));
  function moved(amount: number): SplitTree {
    function walk(node: SplitTree, box: Box, path: string): SplitTree {
      if ('pane' in node) return node;
      const [origin, size] = node.axis === 'x' ? [box.x, box.width] : [box.y, box.height];
      const target = start.get(path);
      const ratio = target === undefined ? node.ratio : (target + amount - origin) / size;
      const length = size * ratio;
      const first = node.axis === 'x' ? { ...box, width: length } : { ...box, height: length };
      const second = node.axis === 'x' ? { ...box, x: origin + length, width: size - length } : { ...box, y: origin + length, height: size - length };
      return { ...node, ratio, first: walk(node.first, first, path + '0'), second: walk(node.second, second, path + '1') };
    }
    return walk(tree, { x: 0, y: 0, width: 1, height: 1 }, '');
  }
  const slots = [...measured.panes.keys()];
  const valid = (value: SplitTree) => validTree(value, slots.length, slots) && allowed(value);
  const requested = moved(delta);
  if (valid(requested)) return requested;
  // All constraints share an interval containing zero. Clamp the whole group, never individual ratios.
  let lower = 0, upper = 1, result = tree;
  for (let i = 0; i < 36; i++) {
    const fraction = (lower + upper) / 2, candidate = moved(delta * fraction);
    if (valid(candidate)) { lower = fraction; result = candidate; } else upper = fraction;
  }
  return result;
}
export function flipDividers(tree: SplitTree, paths: readonly string[]): SplitTree {
  const selected = targets(tree, paths);
  function walk(node: SplitTree, path: string): SplitTree {
    if ('pane' in node) return node;
    const first = walk(node.first, path + '0'), second = walk(node.second, path + '1');
    return selected.has(path) ? { ...node, ratio: 1 - node.ratio, first: second, second: first } : { ...node, first, second };
  }
  return selected.size ? walk(tree, '') : tree;
}
