import { MAX_PANES, type Orientation } from './layout';

export type SplitTree = { pane: number } | { axis: 'x' | 'y'; ratio: number; first: SplitTree; second: SplitTree };
export type Box = { x: number; y: number; width: number; height: number };
export type Divider = Box & { path: string; axis: 'x' | 'y'; ratio: number; parent: Box };
const bands: number[][] = [[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [3, 3, 3], [4, 3, 3], [4, 4, 3], [4, 4, 4]];

function join(nodes: SplitTree[], axis: 'x' | 'y'): SplitTree {
  if (nodes.length === 1) return nodes[0]!;
  return { axis, ratio: 1 / nodes.length, first: nodes[0]!, second: join(nodes.slice(1), axis) };
}
export function defaultTree(count: number, orientation: Orientation, wideBottom = false): SplitTree {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PANES) throw new RangeError('Invalid count');
  let index = 0;
  const rows = wideBottom && count === 4 ? [3, 1] : bands[count]!;
  return join(rows.map(n => join(Array.from({ length: n }, () => ({ pane: index++ })), orientation === 'landscape' ? 'x' : 'y')), orientation === 'landscape' ? 'y' : 'x');
}
export function measureTree(tree: SplitTree): { panes: Map<number, Box>; dividers: Divider[] } {
  const panes = new Map<number, Box>(); const dividers: Divider[] = [];
  function walk(node: SplitTree, box: Box, path: string): void {
    if ('pane' in node) { panes.set(node.pane, box); return; }
    const ratio = node.ratio;
    if (node.axis === 'x') {
      const width = box.width * ratio;
      dividers.push({ x: box.x + width, y: box.y, width: 0, height: box.height, path, axis: 'x', ratio, parent: box });
      walk(node.first, { ...box, width }, path + '0');
      walk(node.second, { ...box, x: box.x + width, width: box.width - width }, path + '1');
    } else {
      const height = box.height * ratio;
      dividers.push({ x: box.x, y: box.y + height, width: box.width, height: 0, path, axis: 'y', ratio, parent: box });
      walk(node.first, { ...box, height }, path + '0');
      walk(node.second, { ...box, y: box.y + height, height: box.height - height }, path + '1');
    }
  }
  walk(tree, { x: 0, y: 0, width: 1, height: 1 }, '');
  return { panes, dividers };
}
export function updateDivider(tree: SplitTree, path: string, change: (node: Exclude<SplitTree, { pane: number }>) => SplitTree): SplitTree {
  if ('pane' in tree) return tree;
  if (!path) return change(tree);
  return path[0] === '0' ? { ...tree, first: updateDivider(tree.first, path.slice(1), change) } : { ...tree, second: updateDivider(tree.second, path.slice(1), change) };
}
export function swapPanes(tree: SplitTree, a: number, b: number): SplitTree {
  if ('pane' in tree) return { pane: tree.pane === a ? b : tree.pane === b ? a : tree.pane };
  return { ...tree, first: swapPanes(tree.first, a, b), second: swapPanes(tree.second, a, b) };
}
export function splitPane(tree: SplitTree, pane: number, added: number, axis: 'x' | 'y', before = false): SplitTree {
  if ('pane' in tree) return tree.pane === pane ? { axis, ratio: .5, first: before ? { pane: added } : tree, second: before ? tree : { pane: added } } : tree;
  return { ...tree, first: splitPane(tree.first, pane, added, axis, before), second: splitPane(tree.second, pane, added, axis, before) };
}

/** Add a new pane at a divider, pane edge, or the outside of the layout. */
export function insertPaneAt(tree: SplitTree, added: number, target: { kind: 'divider'; path: string } | { kind: 'pane'; slot: number; side: PaneSide } | { kind: 'outer'; side: PaneSide }, viewport: { width: number; height: number }): SplitTree | null {
  const original = measureTree(tree).panes;
  if (original.has(added) || original.size >= MAX_PANES || viewport.width <= 0 || viewport.height <= 0 || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return null;
  let result: SplitTree;
  if (target.kind === 'divider') {
    const divider = measureTree(tree).dividers.find(item => item.path === target.path);
    if (!divider) return null;
    result = updateDivider(tree, target.path, node => {
      const left = node.ratio * 2 / 3;
      return { ...node, ratio: left, second: { axis: node.axis, ratio: (1 / 3) / (1 - left), first: { pane: added }, second: node.second } };
    });
  } else {
    const axis = target.side === 'left' || target.side === 'right' ? 'x' : 'y';
    const before = target.side === 'left' || target.side === 'top';
    if (target.kind === 'pane') {
      if (!original.has(target.slot)) return null;
      result = splitPane(tree, target.slot, added, axis, before);
    } else result = { axis, ratio: before ? 1 / 3 : 2 / 3, first: before ? { pane: added } : tree, second: before ? tree : { pane: added } };
  }
  const after = measureTree(result).panes;
  if (!validTree(result, original.size + 1, [...original.keys(), added])) return null;
  for (const [slot, box] of after) {
    const old = original.get(slot);
    if (box.width * viewport.width + 1e-7 < Math.min(96, (old?.width ?? 1) * viewport.width) || box.height * viewport.height + 1e-7 < Math.min(64, (old?.height ?? 1) * viewport.height)) return null;
  }
  return result;
}
export function removePane(tree: SplitTree, pane: number): SplitTree | null {
  if ('pane' in tree) return tree.pane === pane ? null : tree;
  const first = removePane(tree.first, pane), second = removePane(tree.second, pane);
  return first && second ? { ...tree, first, second } : first ?? second;
}

export type PaneSide = 'left' | 'right' | 'top' | 'bottom';

/** Move an existing pane alongside one pane or the whole remaining layout. */
export function movePaneToSide(tree: SplitTree, pane: number, target: { kind: 'pane'; slot: number; side: PaneSide } | { kind: 'outer'; side: PaneSide }, viewport: { width: number; height: number }): SplitTree | null {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) return null;
  const before = measureTree(tree).panes, slots = [...before.keys()];
  if (!before.has(pane) || !validTree(tree, slots.length, slots) || (target.kind === 'pane' && (target.slot === pane || !before.has(target.slot)))) return null;
  const rest = removePane(tree, pane);
  if (!rest) return null;
  const axis = target.side === 'left' || target.side === 'right' ? 'x' : 'y';
  const first = target.side === 'left' || target.side === 'top';
  const result: SplitTree = target.kind === 'pane' ? splitPane(rest, target.slot, pane, axis, first)
    : { axis, ratio: first ? 1 / 3 : 2 / 3, first: first ? { pane } : rest, second: first ? rest : { pane } };
  if (!validTree(result, slots.length, slots)) return null;
  function sameShape(a: SplitTree, b: SplitTree): boolean {
    if ('pane' in a || 'pane' in b) return 'pane' in a && 'pane' in b && a.pane === b.pane;
    return a.axis === b.axis && sameShape(a.first, b.first) && sameShape(a.second, b.second);
  }
  if (sameShape(tree, result)) return null;
  const after = measureTree(result).panes;
  let changed = false;
  for (const [slot, oldBox] of before) {
    const box = after.get(slot)!;
    if (box.width * viewport.width + 1e-7 < Math.min(96, oldBox.width * viewport.width)
      || box.height * viewport.height + 1e-7 < Math.min(64, oldBox.height * viewport.height)) return null;
    if (Math.abs(box.x - oldBox.x) > 1e-7 || Math.abs(box.y - oldBox.y) > 1e-7 || Math.abs(box.width - oldBox.width) > 1e-7 || Math.abs(box.height - oldBox.height) > 1e-7) changed = true;
  }
  return changed ? result : null;
}

/** Move a pane into the selected divider without changing any pane identities. */
export function movePaneToDivider(tree: SplitTree, pane: number, path: string, viewport: { width: number; height: number }): SplitTree | null {
  if (!/^[01]*$/.test(path) || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0) return null;
  const before = measureTree(tree).panes;
  if (!before.has(pane)) return null;
  const slots = [...before.keys()];
  if (!validTree(tree, slots.length, slots)) return null;
  let target: SplitTree = tree;
  for (const part of path) {
    if ('pane' in target) return null;
    target = part === '0' ? target.first : target.second;
  }
  if ('pane' in target) return null;

  // Track the divider by object identity while pruning: its path may shift when
  // the source's old parent collapses. A divider that disappears cannot be used.
  let missingDivider = false;
  function move(node: SplitTree): SplitTree | null {
    if ('pane' in node) return node.pane === pane ? null : node;
    const first = move(node.first), second = move(node.second);
    if (node === target) {
      if (!first || !second) { missingDivider = true; return first ?? second; }
      // Give the inserted pane one third of this divider's extent; the
      // existing sides retain their proportions in the remaining two thirds.
      const leftRatio = node.ratio * 2 / 3;
      return { axis: node.axis, ratio: leftRatio, first,
        second: { axis: node.axis, ratio: (1 / 3) / (1 - leftRatio), first: { pane }, second } };
    }
    return first && second ? { ...node, first, second } : first ?? second;
  }
  const result = move(tree);
  if (!result || missingDivider || !validTree(result, slots.length, slots)) return null;
  const after = measureTree(result).panes;
  for (const [slot, oldBox] of before) {
    const box = after.get(slot)!;
    const minWidth = Math.min(96, oldBox.width * viewport.width);
    const minHeight = Math.min(64, oldBox.height * viewport.height);
    if (box.width * viewport.width + 1e-7 < minWidth || box.height * viewport.height + 1e-7 < minHeight) return null;
  }
  return result;
}
export function validTree(value: unknown, count: number, slots: readonly number[] = Array.from({ length: count }, (_, i) => i)): value is SplitTree {
  const found = new Set<number>();
  function check(node: unknown, depth: number): boolean {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > MAX_PANES) return false;
    const item = node as Record<string, unknown>;
    if ('pane' in item) {
      const n = item.pane;
      if (!Number.isInteger(n) || !slots.includes(n as number) || found.has(n as number)) return false;
      found.add(n as number); return true;
    }
    return (item.axis === 'x' || item.axis === 'y') && typeof item.ratio === 'number' && Number.isFinite(item.ratio) && item.ratio >= .05 && item.ratio <= .95 && check(item.first, depth + 1) && check(item.second, depth + 1);
  }
  return check(value, 0) && found.size === count;
}
