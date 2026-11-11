import { MAX_PANES, type Orientation } from './layout';
import { normalizeDisplayName } from './names';
import { defaultTree, validTree, type SplitTree } from './splitTree';
import { mapTree, workspaceTree } from './workspaceOperations';
import { workspaceOrder, type Workspace } from './workspace';

export interface TemplateShape { count: number; orientation: Orientation; tree: SplitTree }
export interface LayoutTemplate extends TemplateShape { id: string; name: string; createdAt: number; updatedAt: number }
export const MAX_TEMPLATES = 50;

function cleanTree(tree: SplitTree): SplitTree {
  return 'pane' in tree ? { pane: tree.pane } : { axis: tree.axis, ratio: tree.ratio, first: cleanTree(tree.first), second: cleanTree(tree.second) };
}
export function parseTemplateShape(value: unknown): TemplateShape | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!Number.isInteger(item.count) || (item.count as number) < 1 || (item.count as number) > MAX_PANES
    || (item.orientation !== 'landscape' && item.orientation !== 'portrait') || !validTree(item.tree, item.count as number)) return null;
  return { count: item.count as number, orientation: item.orientation, tree: cleanTree(item.tree) };
}
export function shapeFromWorkspace(workspace: Workspace): TemplateShape {
  const order = workspaceOrder(workspace);
  const inverse = Array.from({ length: MAX_PANES }, (_, slot) => order.indexOf(slot));
  return { count: workspace.count, orientation: workspace.orientation, tree: mapTree(workspaceTree(workspace), inverse) };
}
export function treeForOrder(shape: TemplateShape, order: readonly number[]): SplitTree { return mapTree(shape.tree, order); }
export function parseTemplates(value: unknown): LayoutTemplate[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const stored = value as { schemaVersion?: unknown; templates?: unknown };
  if (stored.schemaVersion !== 1 || !Array.isArray(stored.templates)) return [];
  const ids = new Set<string>(), templates: LayoutTemplate[] = [];
  for (const value of stored.templates) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>, shape = parseTemplateShape(item), name = normalizeDisplayName(item.name, 40);
    if (!shape || !name || typeof item.id !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(item.id) || ids.has(item.id)
      || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) continue;
    ids.add(item.id); templates.push({ id: item.id, name, createdAt: item.createdAt, updatedAt: item.updatedAt, ...shape });
    if (templates.length === MAX_TEMPLATES) break;
  }
  return templates;
}
function stack(panes: number[], axis: 'x' | 'y'): SplitTree {
  if (panes.length === 1) return { pane: panes[0]! };
  return { axis, ratio: 1 / panes.length, first: { pane: panes[0]! }, second: stack(panes.slice(1), axis) };
}
export function templateCandidates(count: number): Array<TemplateShape & { key: string; name: string }> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PANES) return [];
  const candidates: Array<TemplateShape & { key: string; name: string }> = [
    { key: 'landscape', name: '均等・横並び', count, orientation: 'landscape', tree: defaultTree(count, 'landscape') },
    { key: 'portrait', name: '均等・縦並び', count, orientation: 'portrait', tree: defaultTree(count, 'portrait') },
  ];
  if (count > 1) {
    const remaining = Array.from({ length: count - 1 }, (_, index) => index + 1);
    candidates.push({ key: 'right', name: '主枠＋右列', count, orientation: 'landscape', tree: { axis: 'x', ratio: .6, first: { pane: 0 }, second: stack(remaining, 'y') } });
    candidates.push({ key: 'bottom', name: '主枠＋下段', count, orientation: 'landscape', tree: { axis: 'y', ratio: .6, first: { pane: 0 }, second: stack(remaining, 'x') } });
  }
  if (count === 4) candidates.push({ key: 'three-one', name: '3＋1', count, orientation: 'landscape', tree: defaultTree(4, 'landscape', true) });
  const seen = new Set<string>();
  return candidates.filter(item => { const key = JSON.stringify(item.tree); if (seen.has(key)) return false; seen.add(key); return true; });
}
