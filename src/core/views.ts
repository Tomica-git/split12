export interface ViewRecord { id: string; title: string; createdAt: number }
export interface ViewSummary extends ViewRecord { tabId?: number; tabIds?: number[] }
export function validViewId(value: unknown): value is string { return value === 'main' || (typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)); }
export function viewIdFromUrl(value: string): string { const id = new URL(value).searchParams.get('view'); return validViewId(id) ? id : 'main'; }
export function viewWorkspaceKey(id: string): string { return id === 'main' ? 'workspace' : `workspace:${id}`; }
export function parseViewTombstones(value: unknown): Set<string> {
  if (!value || typeof value !== 'object') return new Set();
  const stored = value as { schemaVersion?: unknown; ids?: unknown };
  return new Set(stored.schemaVersion === 1 && Array.isArray(stored.ids) ? stored.ids.filter(validViewId) : []);
}
export function parseViewRegistry(value: unknown): ViewRecord[] {
  if (!value || typeof value !== 'object') return [];
  const stored = value as { schemaVersion?: unknown; views?: unknown };
  if (stored.schemaVersion !== 1 || !Array.isArray(stored.views)) return [];
  const seen = new Set<string>();
  return stored.views.filter((item): item is ViewRecord => {
    if (!item || typeof item !== 'object' || !validViewId(item.id) || seen.has(item.id) || typeof item.title !== 'string' || !Number.isFinite(item.createdAt)) return false;
    seen.add(item.id); return true;
  }).map(item => ({ id: item.id, title: item.title.slice(0, 120), createdAt: item.createdAt }));
}
/** The smallest 「ビュー N」 no listed view uses, so a new view never repeats a name in the list (R-95). */
export function nextViewTitle(items: readonly { title: string }[]): string {
  const titles = new Set(items.map(item => item.title));
  let number = 1;
  while (titles.has(`ビュー ${number}`)) number++;
  return `ビュー ${number}`;
}
/** `base` itself when unused, otherwise `base 2`, `base 3` … */
export function uniqueViewTitle(items: readonly { title: string }[], base: string): string {
  const titles = new Set(items.map(item => item.title));
  if (!titles.has(base)) return base;
  let number = 2;
  while (titles.has(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}
