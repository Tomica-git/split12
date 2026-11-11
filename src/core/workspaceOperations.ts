import { defaultTree, removePane, type SplitTree } from './splitTree';
import { workspaceOrder, type Workspace } from './workspace';

export function mapTree(tree: SplitTree, order: readonly number[]): SplitTree {
  return 'pane' in tree ? { pane: order[tree.pane]! } : { ...tree, first: mapTree(tree.first, order), second: mapTree(tree.second, order) };
}
export function workspaceTree(workspace: Workspace): SplitTree {
  return workspace.layout ?? mapTree(defaultTree(workspace.count, workspace.orientation), workspaceOrder(workspace));
}
export function closeWorkspacePane(workspace: Workspace, slot: number): Workspace {
  const order = workspaceOrder(workspace);
  const index = order.indexOf(slot);
  if (index < 0 || index >= workspace.count) return workspace;
  const next = structuredClone(workspace);
  next.panes[slot] = { url: '', zoom: 1 };
  if (workspace.count === 1) return next;
  next.order = [...order.filter(id => id !== slot), slot];
  next.count--;
  next.layout = removePane(workspaceTree(workspace), slot)!;
  return next;
}

export class OperationHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  record(entry: T): void { this.past.push(entry); this.past = this.past.slice(-50); this.future = []; }
  undo(): T | undefined { const entry = this.past.pop(); if (entry !== undefined) this.future.push(entry); return entry; }
  redo(): T | undefined { const entry = this.future.pop(); if (entry !== undefined) this.past.push(entry); return entry; }
  clear(): void { this.past = []; this.future = []; }
}
