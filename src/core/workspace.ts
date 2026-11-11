import { MAX_PANES, type Orientation } from './layout';
import { isOpenableUrl } from './url';
import { validTree, type SplitTree } from './splitTree';

export const MIN_ZOOM = 30, MAX_ZOOM = 300;
// Preserve the old 67% option while providing the complete 10% sequence.
export const ZOOMS: number[] = [...Array.from({ length: (MAX_ZOOM - MIN_ZOOM) / 10 + 1 }, (_, i) => (MIN_ZOOM + i * 10) / 100), .67].sort((a, b) => b - a);
export type Zoom = number;
export function normalizeZoom(value: unknown): Zoom {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const percent = Math.round(value * 100);
  return percent >= MIN_ZOOM && percent <= MAX_ZOOM && Math.abs(value * 100 - percent) < 1e-6 ? percent / 100 : 1;
}
export function stepZoom(value: Zoom, direction: -1 | 1): Zoom {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) + direction * 10)) / 100;
}
export interface PaneState { url: string; zoom: Zoom; title?: string }
export interface Workspace { schemaVersion: 1; count: number; orientation: Orientation; panes: PaneState[]; layout?: SplitTree; order?: number[]; fixedSlot?: number }
export const defaultOrder = (): number[] => Array.from({ length: MAX_PANES }, (_, index) => index);
export function workspaceOrder(workspace: Workspace): number[] { return workspace.order ?? defaultOrder(); }
export function workspaceFixed(workspace: Workspace): number {
  const visible = workspaceOrder(workspace).slice(0, workspace.count);
  return workspace.fixedSlot !== undefined && visible.includes(workspace.fixedSlot) ? workspace.fixedSlot : visible[0]!;
}
export function validOrder(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === MAX_PANES && new Set(value).size === MAX_PANES && value.every(n => Number.isInteger(n) && n >= 0 && n < MAX_PANES);
}
export function defaultWorkspace(): Workspace {
  return { schemaVersion: 1, count: 4, orientation: 'landscape', panes: Array.from({ length: MAX_PANES }, () => ({ url: '', zoom: 1 })) };
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseWorkspace(value: unknown): Workspace {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isInteger(value.count)
    || (value.count as number) < 1 || (value.count as number) > MAX_PANES
    || (value.orientation !== 'landscape' && value.orientation !== 'portrait')
    || !Array.isArray(value.panes) || ![8, MAX_PANES].includes(value.panes.length)
    || (value.panes.length === 8 && (value.count as number) > 8)
    || value.panes.some((pane: unknown) => !isRecord(pane) || typeof pane.url !== 'string' || typeof pane.zoom !== 'number')) {
    return defaultWorkspace();
  }
  const order = validOrder(value.order) ? [...value.order] : defaultOrder();
  return {
    schemaVersion: 1,
    count: value.count as number,
    orientation: value.orientation,
    ...(validOrder(value.order) ? { order } : {}),
    ...(Number.isInteger(value.fixedSlot) && order.slice(0, value.count as number).includes(value.fixedSlot as number) ? { fixedSlot: value.fixedSlot as number } : {}),
    ...(validTree(value.layout, value.count as number, order.slice(0, value.count as number)) ? { layout: value.layout } : {}),
    panes: [...value.panes, ...Array.from({ length: MAX_PANES - value.panes.length }, () => ({ url: '', zoom: 1 }))].map((pane: Record<string, unknown>) => ({
      url: isOpenableUrl(pane.url) ? pane.url : '',
      zoom: normalizeZoom(pane.zoom),
      ...(isOpenableUrl(pane.url) && typeof pane.title === 'string' && pane.title.trim() ? { title: pane.title.trim().slice(0, 300) } : {}),
    })),
  };
}
