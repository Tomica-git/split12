import { normalizeHost } from '../core/host';
import { MAX_PANES, type Orientation } from '../core/layout';
import { defaultTree, insertPaneAt, measureTree, movePaneToDivider, movePaneToSide, removePane, splitPane, swapPanes, type PaneSide, type SplitTree } from '../core/splitTree';
import { flipDividers } from '../core/dividerOperations';
import { findJunctions, type Junction } from '../core/junctions';
import { snapDividers, snapJunction, type SnapGuide } from '../core/snap';
import { parseTemplateShape, shapeFromWorkspace, treeForOrder, type TemplateShape } from '../core/templates';
import { addressSuggestions, type AddressSource } from '../core/suggestions';
import { closeWorkspacePane, mapTree, OperationHistory, workspaceTree } from '../core/workspaceOperations';
import { matchesShortcut } from '../core/shortcuts';
import { appActionForKey, isAppAction, zoomActionForKey, type AppAction } from '../core/appActions';
import { parseViewRegistry, parseViewTombstones, viewIdFromUrl, viewWorkspaceKey, type ViewSummary } from '../core/views';
import { isOpenableUrl, normalizeUserUrl } from '../core/url';
import { linkSideFromDirection, pickDroppedUrl } from '../core/linkDrop';
import { defaultWorkspace, parseWorkspace, workspaceFixed, workspaceOrder, stepZoom, type PaneState, type Workspace } from '../core/workspace';
import type { PaneHistory } from '../core/paneHistory';
import type { AddUrlMessage, AppActionMessage, SplitRequest, SplitResponse } from '../shared/messages';
import { text } from '../ui/strings';
import { createDialogs } from './dialogs';
import { Pane, type TabChoice } from './pane';
import { createTour } from './tour';
import { createToolbar } from './toolbar';
import { createSidebar } from './sidebar';
import { createTemplates } from './templates';
import { createViewDialogs } from './viewDialogs';
import { installShortcutHints } from './shortcutHints';
import { createPaneList } from './paneList';

const app = document.querySelector<HTMLElement>('#app')!;
const grid = document.createElement('main'); grid.className = 'grid'; grid.setAttribute('aria-label', '分割ビュー');
const toast = document.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status'); toast.hidden = true;
let workspace: Workspace = defaultWorkspace();
let tabId = -1;
let hosts: string[] = [];
let maximized: number | null = null;
let toolbarBeforeMaximized: boolean | null = null;
let maximizeActivatedAt = 0;
let selected = 0;
let lastSelectionAt = 0;
let lastSelectionClock = Date.now();
let lastShortcut: { delta: number; source: 'page' | 'command'; time: number } | undefined;
let fallbackShortcuts: { up: string; down: string; directions: Record<string, string> } = { up: '', down: '', directions: {} };
let saves: Promise<void> = Promise.resolve();
let persistEnabled = false;
let viewDeleted = false;
const viewId = viewIdFromUrl(location.href);
const workspaceKey = viewWorkspaceKey(viewId);
const frames = new Map<number, { index: number; nav: number }>();
const bootBase = chrome.runtime.getURL('pane-boot.html');

function save(): void {
  if (!persistEnabled || viewDeleted) return;
  const snapshot = structuredClone(workspace);
  const empty = snapshot.panes.every(pane => pane.url === '') && !panes.some(pane => pane.needsAllow());
  if (!empty) void chrome.runtime.sendMessage({ type: 'views/state', empty: false }).catch(() => undefined);
  saves = saves.catch(() => undefined).then(async () => {
    if (!persistEnabled || viewDeleted) return;
    await chrome.storage.local.set({ [workspaceKey]: snapshot });
    if (empty && workspace.panes.every(pane => pane.url === '') && !panes.some(pane => pane.needsAllow())) await chrome.runtime.sendMessage({ type: 'views/state', empty: true }).catch(() => undefined);
  });
}
function changed(index: number, patch: Partial<PaneState>): void {
  if ('zoom' in patch && patch.zoom !== workspace.panes[index]!.zoom) {
    commitLayout(() => { Object.assign(workspace.panes[index]!, patch); }, true);
    return;
  }
  if (typeof patch.url === 'string' && patch.url !== workspace.panes[index]!.url) delete workspace.panes[index]!.title;
  Object.assign(workspace.panes[index]!, patch);
  save();
  if ('url' in patch) scheduleTabChoices();
}
let tabChoicesTimer: ReturnType<typeof setTimeout> | undefined;
let tabChoicesGeneration = 0;
let addressTabs: AddressSource[] = [];
const savedAddresses = new Map<string, AddressSource[]>();
function scheduleTabChoices(): void {
  clearTimeout(tabChoicesTimer);
  tabChoicesTimer = setTimeout(() => { void refreshTabChoices(); }, 100);
}
// Panes hidden by lowering the count keep their URL; those pages are not on screen, so they stay pickable.
function shownUrls(): string[] {
  return workspaceOrder(workspace).slice(0, workspace.count).map(slot => workspace.panes[slot]!.url).filter(Boolean);
}
// Empty panes list the window's own tabs so a page can be picked without typing its address.
async function refreshTabChoices(): Promise<void> {
  const generation = ++tabChoicesGeneration;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (generation !== tabChoicesGeneration) return;
  addressTabs = tabs.filter(tab => isOpenableUrl(tab.url)).map(tab => ({ url: tab.url!, title: tab.title }));
  const seen = new Set(shownUrls());
  const choices: TabChoice[] = [];
  for (const tab of tabs) {
    if (!isOpenableUrl(tab.url) || seen.has(tab.url)) continue;
    seen.add(tab.url);
    const icon = tab.favIconUrl && /^(?:https?|data):/i.test(tab.favIconUrl) ? tab.favIconUrl : undefined;
    const host = normalizeHost(tab.url) ?? new URL(tab.url).hostname;
    choices.push({ url: tab.url, title: tab.title || tab.url, host, icon });
  }
  for (const pane of panes) { pane.renderTabs(choices); pane.refreshSuggestions(); }
}
function rememberAddresses(key: string, value: unknown): void {
  if (key !== 'workspace' && !/^workspace:[a-f\d-]{36}$/i.test(key)) return;
  savedAddresses.set(key, parseWorkspace(value).panes.filter(pane => pane.url).map(pane => ({ url: pane.url })));
}
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached] as chrome.events.Event<() => void>[]) event.addListener(scheduleTabChoices);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.title || info.favIconUrl) scheduleTabChoices(); });
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  toast.textContent = message; toast.hidden = false;
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; toastTimer = undefined; }, 8000);
}
async function request(message: SplitRequest): Promise<SplitResponse> {
  const response: SplitResponse = await chrome.runtime.sendMessage(message);
  if (response.ok && response.hosts) hosts = response.hosts;
  return response;
}
async function allow(url: string): Promise<void> {
  const host = normalizeHost(url);
  if (!host) return;
  const response = await request({ type: 'allowlist/add', hosts: [host] });
  if (!response.ok) throw new Error(response.reason);
}
const paneCallbacks = {
  state: (index: number) => workspace.panes[index]!, changed,
  preparationChanged: save,
  suggest: (value: string) => addressSuggestions(value, [...workspace.panes.map(pane => ({ url: pane.url })), ...addressTabs, ...[...savedAddresses.values()].flat()]),
  select: (index: number) => selectPane(index),
  maximize: (index: number) => { maximized = maximized === index ? null : index; if (maximized !== null) maximizeActivatedAt = Date.now(); renderLayout(); },
  allow,
  clearServiceWorker: async (url: string) => (await request({ type: 'service-worker/clear', url })).ok,
  isAllowed: (host: string) => hosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`)),
  split: (index: number, axis: 'x' | 'y') => splitSelected(index, axis),
  reorder: (from: number, to: number) => {
    const visible = workspaceOrder(workspace).slice(0, workspace.count);
    if (!visible.includes(from) || !visible.includes(to)) return;
    commitLayout(() => { workspace.layout = swapPanes(workspaceTree(workspace), from, to); });
  },
  numberDrag: beginNumberDrag,
  close: closePane,
  canClose: () => !viewDeleted,
  context: showPaneMenu,
};
const panes = Array.from({ length: MAX_PANES }, (_, index) => new Pane(index, paneCallbacks));
const tour = createTour(() => panes.find(pane => pane.index === (maximized ?? selected))!.element);
type Structure = Pick<Workspace, 'count' | 'orientation' | 'layout' | 'order'>;
type PaneData = { state: PaneState; history: PaneHistory; needsAllow: boolean };
type Snapshot = { structure: Structure; selected: number; fixed: number; data: PaneData[] };
type LayoutEntry = { before: Snapshot; after: Snapshot; slots: number[]; zoomSlots: number[] };
const layoutHistory = new OperationHistory<LayoutEntry>();
let mutationDepth = 0;
let dividerDrag: (() => void) | undefined;
let numberDrag: (() => void) | undefined;
const dividerSelection = new Set<string>();
let dividerAxis: 'x' | 'y' | undefined;

function moveToDivider(slot: number, path: string): boolean {
  if (maximized !== null) return false;
  const rect = grid.getBoundingClientRect();
  const result = movePaneToDivider(workspaceTree(workspace), slot, path, { width: rect.width, height: rect.height });
  if (!result) { showToast('この境界には移動できません'); return false; }
  commitLayout(() => { workspace.layout = result; });
  return true;
}

function canMoveToDivider(slot: number, path: string): boolean {
  const rect = grid.getBoundingClientRect();
  return maximized === null && !!movePaneToDivider(workspaceTree(workspace), slot, path, { width: rect.width, height: rect.height });
}

function dividerAtPosition(x: number, y: number): HTMLButtonElement | undefined {
  if (maximized !== null || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
  if (junctionAtPosition(x, y)) return;
  return document.elementsFromPoint(x, y).find((element): element is HTMLButtonElement =>
    element instanceof HTMLButtonElement && element.classList.contains('split-divider'));
}

function junctionAtPosition(x: number, y: number): HTMLButtonElement | undefined {
  if (maximized !== null || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
  return document.elementsFromPoint(x, y).find((element): element is HTMLButtonElement =>
    element instanceof HTMLButtonElement && element.classList.contains('split-junction'));
}

function beginNumberDrag(slot: number, event: PointerEvent, button: HTMLButtonElement): void {
  if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || tour.isOpen || document.querySelector('dialog[open]')) return;
  if (dividerDrag) dividerDrag();
  if (numberDrag) numberDrag();
  const startX = event.clientX, startY = event.clientY;
  let moved = false;
  const preview = document.createElement('div'); preview.className = 'number-drop-preview'; preview.hidden = true; preview.setAttribute('aria-hidden', 'true'); grid.append(preview);
  const sideAt = (x: number, y: number): { kind: 'pane'; slot: number; side: PaneSide } | { kind: 'outer'; side: PaneSide } | undefined => {
    if (maximized !== null) return;
    const rect = grid.getBoundingClientRect();
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return;
    const edges: [PaneSide, number][] = [['left', x - rect.left], ['right', rect.right - x], ['top', y - rect.top], ['bottom', rect.bottom - y]];
    edges.sort((a, b) => a[1] - b[1]);
    if (edges[0]![1] <= 6) return { kind: 'outer', side: edges[0]![0] };
    const element = document.elementFromPoint(x, y);
    const pane = element?.closest<HTMLElement>('.pane');
    if (!pane || pane.hidden || element?.closest('.pane-bar')) return;
    const target = Number(pane.dataset.slot);
    if (!Number.isInteger(target) || target === slot || !workspaceOrder(workspace).slice(0, workspace.count).includes(target)) return;
    const box = pane.getBoundingClientRect(), view = pane.querySelector<HTMLElement>('.pane-view')!.getBoundingClientRect();
    const candidates: [PaneSide, number][] = [['left', x - box.left], ['right', box.right - x], ['top', y - view.top], ['bottom', box.bottom - y]];
    candidates.sort((a, b) => a[1] - b[1]);
    const limit = Math.min(28, box.width / 4, view.height / 4);
    return candidates[0]![1] >= 0 && candidates[0]![1] <= limit ? { kind: 'pane', slot: target, side: candidates[0]![0] } : undefined;
  };
  const resultForSide = (target: ReturnType<typeof sideAt>): SplitTree | null => {
    if (!target) return null;
    const rect = grid.getBoundingClientRect();
    return movePaneToSide(workspaceTree(workspace), slot, target, { width: rect.width, height: rect.height });
  };
  const targetAt = (x: number, y: number): number | undefined => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return;
    const pane = document.elementFromPoint(x, y)?.closest<HTMLElement>('.pane');
    if (!pane || pane.hidden || pane.classList.contains('max-hidden')) return;
    const target = Number(pane.dataset.slot);
    return Number.isInteger(target) && workspaceOrder(workspace).slice(0, workspace.count).includes(target) ? target : undefined;
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < 4) return;
    moved = true; app.classList.add('number-dragging');
    const junction = junctionAtPosition(next.clientX, next.clientY);
    const divider = dividerAtPosition(next.clientX, next.clientY);
    const side = !junction && !divider ? sideAt(next.clientX, next.clientY) : undefined;
    const result = resultForSide(side);
    preview.hidden = !side;
    preview.classList.toggle('invalid', !!side && !result);
    if (result) {
      const box = measureTree(result).panes.get(slot)!;
      Object.assign(preview.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });
    } else if (side) {
      Object.assign(preview.style, { left: '0', top: '0', width: '100%', height: '100%' });
    }
    document.querySelectorAll('.split-divider.number-drop-target, .split-divider.number-drop-invalid').forEach(element => element.classList.remove('number-drop-target', 'number-drop-invalid'));
    document.querySelectorAll('.split-junction.number-drop-invalid').forEach(element => element.classList.remove('number-drop-invalid'));
    junction?.classList.add('number-drop-invalid');
    if (divider?.dataset.path !== undefined) divider.classList.add(canMoveToDivider(slot, divider.dataset.path) ? 'number-drop-target' : 'number-drop-invalid');
    const target = divider || junction || side ? undefined : targetAt(next.clientX, next.clientY);
    panes.forEach(pane => pane.element.classList.toggle('drop-target', pane.index === target && target !== slot));
  };
  const cleanup = () => {
    app.classList.remove('number-dragging'); preview.remove(); panes.forEach(pane => pane.element.classList.remove('drop-target'));
    document.querySelectorAll('.split-divider.number-drop-target, .split-divider.number-drop-invalid, .split-junction.number-drop-invalid').forEach(element => element.classList.remove('number-drop-target', 'number-drop-invalid'));
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
    document.removeEventListener('visibilitychange', visibility); button.removeEventListener('lostpointercapture', cancel); numberDrag = undefined;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  const cancel = () => cleanup();
  const visibility = () => { if (document.hidden) cancel(); };
  const up = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    const junction = moved ? junctionAtPosition(next.clientX, next.clientY) : undefined;
    const divider = moved ? dividerAtPosition(next.clientX, next.clientY) : undefined;
    const side = moved && !divider && !junction ? sideAt(next.clientX, next.clientY) : undefined;
    const result = resultForSide(side);
    const path = divider?.dataset.path;
    const target = moved && !divider && !junction && !side ? targetAt(next.clientX, next.clientY) : undefined;
    cleanup();
    if (junction) showToast('交点ではなく境界線を選んでください');
    else if (path !== undefined) moveToDivider(slot, path);
    else if (side && result) commitLayout(() => { workspace.layout = result; });
    else if (side) showToast('この位置には移動できません');
    else if (target !== undefined && target !== slot) paneCallbacks.reorder(slot, target);
  };
  numberDrag = cancel;
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel, { once: true }); window.addEventListener('blur', cancel, { once: true }); window.addEventListener('resize', cancel, { once: true });
  document.addEventListener('visibilitychange', visibility); button.addEventListener('lostpointercapture', cancel, { once: true });
  button.setPointerCapture(event.pointerId);
}
function captureLayout(): Snapshot {
  return { structure: structuredClone({ count: workspace.count, orientation: workspace.orientation, layout: workspace.layout, order: workspaceOrder(workspace) }), selected, fixed: workspaceFixed(workspace),
    data: panes.map((pane, slot) => ({ state: structuredClone(workspace.panes[slot]!), history: pane.captureHistory(), needsAllow: pane.needsAllow() })) };
}
function recordLayout(before: Snapshot): void {
  const after = captureLayout();
  const slots = before.data.flatMap((data, slot) => data.state.url !== after.data[slot]!.state.url ? [slot] : []);
  const zoomSlots = before.data.flatMap((data, slot) => data.state.zoom !== after.data[slot]!.state.zoom ? [slot] : []);
  if (JSON.stringify(before.structure) !== JSON.stringify(after.structure) || slots.length || zoomSlots.length) layoutHistory.record({ before, after, slots, zoomSlots });
  toolbar.history(layoutHistory.canUndo, layoutHistory.canRedo);
}
function commitLayout(action: () => void, preserveDividerSelection = false): void {
  if (mutationDepth) { action(); return; }
  paneMenu.hidden = true;
  // A new command commits from the last settled layout, never from an unfinished drag.
  if (dividerDrag) dividerDrag();
  if (numberDrag) numberDrag();
  const before = captureLayout();
  mutationDepth++;
  try { action(); } finally { mutationDepth--; }
  if (!preserveDividerSelection) { dividerSelection.clear(); dividerAxis = undefined; }
  recordLayout(before); save(); renderLayout();
}
function restoreLayout(snapshot: Snapshot, slots: number[], zoomSlots: number[] = [], fixed = workspaceFixed(workspace), selection = selected, preserveDividerSelection = false): void {
  paneMenu.hidden = true;
  const previous = workspaceOrder(workspace).slice(0, workspace.count);
  Object.assign(workspace, structuredClone(snapshot.structure));
  const visible = workspaceOrder(workspace).slice(0, workspace.count);
  workspace.fixedSlot = visible.includes(fixed) ? fixed : visible.includes(snapshot.fixed) ? snapshot.fixed : visible[0]!;
  for (const slot of slots) {
    const data = snapshot.data[slot]!;
    const reset = !visible.includes(slot) || workspace.panes[slot]!.url !== data.state.url;
    workspace.panes[slot] = structuredClone(data.state);
    panes[slot]!.restoreHistory(data.history, reset, data.needsAllow);
  }
  // Zoom changes must not rewind a page that navigated after that change.
  for (const slot of zoomSlots) if (!slots.includes(slot)) workspace.panes[slot]!.zoom = snapshot.data[slot]!.state.zoom;
  for (const slot of previous) if (!visible.includes(slot) && !slots.includes(slot)) {
    panes[slot]!.parkPending();
    panes[slot]!.restoreHistory(panes[slot]!.captureHistory(), true, panes[slot]!.needsAllow());
  }
  selected = visible.includes(selection) ? selection : visible.includes(snapshot.selected) ? snapshot.selected : visible[0]!;
  if (maximized !== null && !visible.includes(maximized)) maximized = null;
  if (!preserveDividerSelection) { dividerSelection.clear(); dividerAxis = undefined; }
  save(); renderLayout();
}
function travelLayout(forward: boolean): void {
  if (dividerDrag || tour.isOpen) return;
  const entry = forward ? layoutHistory.redo() : layoutHistory.undo();
  if (!entry) return;
  const expected = forward ? entry.before : entry.after;
  if (JSON.stringify(captureLayout().structure) !== JSON.stringify(expected.structure)) {
    layoutHistory.clear(); toolbar.history(false, false); showToast('配置が変わったため変更履歴をリセットしました'); return;
  }
  const current = captureLayout();
  for (const slot of entry.slots) expected.data[slot] = current.data[slot]!;
  for (const slot of entry.zoomSlots) if (!entry.slots.includes(slot)) expected.data[slot]!.state.zoom = current.data[slot]!.state.zoom;
  const target = forward ? entry.after : entry.before;
  const targetVisible = workspaceOrder({ ...workspace, ...target.structure }).slice(0, target.structure.count);
  let fixed = workspaceFixed(workspace);
  if (!targetVisible.includes(fixed)) {
    // Remember a pin made after the operation when its pane disappears, so the
    // reverse trip can restore it unless the user has since selected another.
    expected.fixed = fixed;
    fixed = targetVisible.includes(target.fixed) ? target.fixed : targetVisible[0]!;
  } else if (entry.before.fixed !== entry.after.fixed && fixed === expected.fixed) fixed = target.fixed;
  const selection = entry.before.selected !== entry.after.selected && selected === expected.selected ? target.selected : selected;
  const zoomOnly = entry.zoomSlots.length > 0 && !entry.slots.length && JSON.stringify(entry.before.structure) === JSON.stringify(entry.after.structure);
  restoreLayout(target, entry.slots, entry.zoomSlots, fixed, selection, zoomOnly);
  toolbar.history(layoutHistory.canUndo, layoutHistory.canRedo);
}
function closePane(slot: number): void {
  if (!workspaceOrder(workspace).slice(0, workspace.count).includes(slot)) return;
  commitLayout(() => {
    const index = workspaceOrder(workspace).indexOf(slot);
    const wasFixed = workspaceFixed(workspace) === slot;
    const wasSelected = selected === slot;
    const next = closeWorkspacePane(workspace, slot);
    panes[slot]!.clear();
    workspace = next;
    if (wasFixed) workspace.fixedSlot = workspaceOrder(workspace)[Math.min(index, workspace.count - 1)]!;
    if (maximized === slot) maximized = null;
    if (wasSelected) selected = workspaceOrder(workspace)[Math.min(index, workspace.count - 1)]!;
  });
  panes[selected]!.element.tabIndex = -1;
  panes[selected]!.element.focus({ preventScroll: true });
}
const paneMenu = document.createElement('div');
paneMenu.className = 'pane-context-menu'; paneMenu.setAttribute('role', 'menu'); paneMenu.hidden = true;
document.body.append(paneMenu);
function showPaneMenu(slot: number, x: number, y: number, numberTarget: boolean): void {
  if (!workspaceOrder(workspace).slice(0, workspace.count).includes(slot)) return;
  paneMenu.replaceChildren();
  const actions: Array<readonly [string, () => void]> = [];
  if (numberTarget) actions.push([text.pinPane, () => { workspace.fixedSlot = slot; save(); renderSelected(); }], [text.tabsTitle, () => { void dialogs.tabs(); }]);
  actions.push([text.deletePane, () => closePane(slot)], [text.clearPane, () => commitLayout(() => panes[slot]!.clear())]);
  for (const [label, action] of actions) {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label;
    button.addEventListener('click', () => { paneMenu.hidden = true; if (workspaceOrder(workspace).slice(0, workspace.count).includes(slot)) action(); }); paneMenu.append(button);
  }
  paneMenu.hidden = false;
  const rect = paneMenu.getBoundingClientRect();
  Object.assign(paneMenu.style, { left: `${Math.max(0, Math.min(x, innerWidth - rect.width))}px`, top: `${Math.max(0, Math.min(y, innerHeight - rect.height))}px` });
  paneMenu.querySelector('button')!.focus();
}
document.addEventListener('pointerdown', event => { if (!paneMenu.contains(event.target as Node)) paneMenu.hidden = true; });
let dragEndTimer: ReturnType<typeof setTimeout> | undefined;
let dragWatchdog: ReturnType<typeof setTimeout> | undefined;
let localDrag = false;
let dragClearedAt = 0;
function clearDragging(): void {
  if (app.classList.contains('dragging') && diagnostic.detected === '枠内のページで開始' && diagnostic.docOver === 0 && diagnostic.relayOver === 0 && !diagnostic.result) {
    diagnostic.result = '受信0。Chromeは同じタブ内で別サイトへのネイティブなドラッグを遮断します（リンクは模擬ドラッグで追加されます）'; renderDiagnostic();
  }
  app.classList.remove('dragging');
  positionLinkZone(); clearLinkPlan();
  dragClearedAt = Date.now();
  localDrag = false;
  if (dragWatchdog !== undefined) clearTimeout(dragWatchdog);
  dragWatchdog = undefined;
}
function refreshDragWatchdog(): void {
  if (dragWatchdog !== undefined) clearTimeout(dragWatchdog);
  // Fallback only: a live drag repeats dragover, and pointer activity below clears a drag that ended silently.
  dragWatchdog = setTimeout(clearDragging, localDrag ? 120000 : 4000);
}
function setDragging(active: boolean, startedHere = false): void {
  if (dragEndTimer !== undefined) clearTimeout(dragEndTimer);
  if (active) {
    if (!app.classList.contains('dragging')) Object.assign(diagnostic, emptyDiagnostic());
    diagnostic.signals++;
    localDrag ||= startedHere; app.classList.add('dragging'); refreshDragWatchdog(); positionLinkZone();
    if (!diagnostic.detected || startedHere) diagnostic.detected = startedHere ? '枠内のページで開始' : '外部または枠の外から';
    renderDiagnostic();
  }
  else dragEndTimer = setTimeout(() => { clearDragging(); dragEndTimer = undefined; }, 250);
}
function changeCount(count: number): void {
  if (!mutationDepth) { commitLayout(() => changeCount(count)); return; }
  count = Math.max(1, Math.min(MAX_PANES, count));
  const previous = workspace.count;
  const order = workspaceOrder(workspace);
  const fixed = workspaceFixed(workspace);
  let tree = workspaceTree(workspace);
  for (let i = previous; i < count; i++) tree = splitPane(tree, count === previous + 1 && order.slice(0, i).includes(fixed) ? fixed : order[(i - previous) % i]!, order[i]!, workspace.orientation === 'landscape' ? 'x' : 'y');
  for (let i = previous - 1; i >= count; i--) tree = removePane(tree, order[i]!) ?? { pane: order[0]! };
  workspace.count = count; workspace.layout = tree;
  if (!order.slice(0, count).includes(fixed)) workspace.fixedSlot = order[0]!;
  scheduleTabChoices();
  if (maximized !== null && !order.slice(0, count).includes(maximized)) maximized = null;
  if (!order.slice(0, count).includes(selected)) selected = order[0]!;
  if (count < previous) for (let i = count; i < previous; i++) { panes[order[i]!]!.parkPending(); panes[order[i]!]!.destroyFrame(); }
  save(); renderLayout();
}
function applyTemplate(value: TemplateShape): void {
  const shape = parseTemplateShape(value);
  if (!shape || tour.isOpen || tabId < 0) return;
  commitLayout(() => {
    const order = workspaceOrder(workspace), previous = workspace.count, fixed = workspaceFixed(workspace);
    const visible = order.slice(0, shape.count);
    if (shape.count < previous) for (let i = shape.count; i < previous; i++) { panes[order[i]!]!.parkPending(); panes[order[i]!]!.destroyFrame(); }
    workspace.count = shape.count; workspace.orientation = shape.orientation; workspace.layout = treeForOrder(shape, order);
    if (!visible.includes(fixed)) workspace.fixedSlot = visible[0]!;
    if (!visible.includes(selected)) selected = visible[0]!;
    if (maximized !== null && !visible.includes(maximized)) maximized = null;
    scheduleTabChoices();
  });
}
function applyShortcut(delta: number, source: 'page' | 'command'): void {
  const time = performance.now();
  if (lastShortcut && lastShortcut.delta === delta && lastShortcut.source !== source && time - lastShortcut.time < 500) {
    lastShortcut = undefined; return;
  }
  lastShortcut = { delta, source, time };
  changeCount(workspace.count + delta);
}
async function refreshShortcuts(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const key = (name: string) => commands.find(command => command.name === name)?.shortcut ?? '';
  fallbackShortcuts = {
    up: key('pane-increase'),
    down: key('pane-decrease'),
    directions: Object.fromEntries(['split-up', 'split-left', 'split-down', 'split-right'].map(name => [name, key(name)])),
  };
}
window.addEventListener('focus', () => { void refreshShortcuts(); });
window.addEventListener('keydown', event => {
  if (event.isTrusted && !event.isComposing && zoomActionForKey(event) && (event.repeat || tour.isOpen || document.querySelector('dialog[open]'))) event.preventDefault();
}, true);
window.addEventListener('keydown', event => {
  if (!event.isTrusted) return;
  if (event.key === 'Escape') {
    if (linkDrag) { cancelLinkDrag('Escape'); event.preventDefault(); return; }
    const busy = Boolean(dividerDrag || numberDrag || !paneMenu.hidden || dividerSelection.size || tour.isOpen || document.querySelector('dialog[open]'));
    if (dividerDrag) dividerDrag();
    if (numberDrag) numberDrag();
    paneMenu.hidden = true; dividerSelection.clear(); dividerAxis = undefined; renderLayout();
    if (!busy && !event.defaultPrevented && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && maximized !== null) {
      maximized = null; renderLayout();
    }
  }
  if (tour.isOpen || document.querySelector('dialog[open]')) return;
  const editable = event.target instanceof Element && Boolean(event.target.closest('input,textarea,[contenteditable="true"]'));
  const action = appActionForKey(event, false, editable);
  if (action?.startsWith('split-') && fallbackShortcuts.directions[action]) return;
  if ((action === 'zoom-in' || action === 'zoom-out') && tabId >= 0) { event.preventDefault(); executeAction(action); return; }
  const delta = matchesShortcut(fallbackShortcuts.up, event) ? 1 : matchesShortcut(fallbackShortcuts.down, event) ? -1 : 0;
  if (delta) { event.preventDefault(); applyShortcut(delta, 'page'); return; }
  if ((action === 'view-up' || action === 'view-down') && sidebar.element.hidden) return;
  if (action && tabId >= 0) { event.preventDefault(); executeAction(action); }
});
// The ui object holds several settings; writers merge so one toggle never drops another.
async function saveUi(patch: Record<string, unknown>): Promise<void> {
  const stored = (await chrome.storage.local.get('ui')).ui;
  await chrome.storage.local.set({ ui: { ...(stored && typeof stored === 'object' ? stored : {}), ...patch, schemaVersion: 1 } });
}
let creatingView = false;
function newView(): void {
  if (creatingView) return;
  creatingView = true; sidebar.setCreating(true);
  void request({ type: 'views/create' }).then(response => {
    if (!response.ok || !response.views) { showToast('ビューを作成できませんでした'); return; }
    renderViews(response.views); showToast('ビューを作成しました。一覧で選んで開いてください。');
  }).catch(() => showToast('ビューを作成できませんでした')).finally(() => { creatingView = false; sidebar.setCreating(false); });
}
const viewDialogs = createViewDialogs();
const sidebar = createSidebar({
  currentId: viewId,
  create: newView,
  focus: async id => {
    const response = await request({ type: 'views/focus', id });
    if (!response.ok) showToast(response.reason);
  },
  rename: view => {
    void (async () => {
      const title = await viewDialogs.rename(view); if (title === null) return;
      const response = await request({ type: 'views/rename', id: view.id, title });
      if (!response.ok) showToast(response.reason === 'invalid-view-name' ? 'ビュー名を入力してください。' : '名前を変更できませんでした。');
      else if (response.views) renderViews(response.views);
    })().catch(() => showToast('名前を変更できませんでした。'));
  },
  remove: view => {
    void (async () => {
      if (!await viewDialogs.remove(view)) return;
      const response = await request({ type: 'views/delete', id: view.id, expectedTabIds: view.tabIds ?? (view.tabId === undefined ? [] : [view.tabId]) });
      if (!response.ok) { showToast(response.reason === 'view-changed' ? '開いているビューが変わりました。一覧を確認して再度お試しください。' : 'ビューを削除できませんでした。'); void refreshViews(); }
      else if (response.views) renderViews(response.views);
    })().catch(() => { if (!viewDeleted) showToast('ビューを削除できませんでした。'); });
  },
  removeMany: async views => {
    try {
      if (!await viewDialogs.removeMany(views)) return;
      // Delete the view shown here last, so this page can still send the other requests.
      const ordered = [...views.filter(view => view.id !== viewId), ...views.filter(view => view.id === viewId)];
      for (const view of ordered) {
        const response = await request({ type: 'views/delete', id: view.id, expectedTabIds: view.tabIds ?? (view.tabId === undefined ? [] : [view.tabId]) });
        if (!response.ok) { showToast(response.reason === 'view-changed' ? '開いているビューが変わりました。一覧を確認して再度お試しください。' : 'ビューを削除できませんでした。'); break; }
        if (response.views) renderViews(response.views);
      }
      await refreshViews();
    } catch { if (!viewDeleted) showToast('ビューを削除できませんでした。'); }
  },
  reorder: async ids => {
    try {
      const response = await request({ type: 'views/reorder', ids });
      if (!response.ok) { showToast('並べ替えを保存できませんでした。'); void refreshViews(); return; }
      if (response.views) renderViews(response.views);
    } catch { showToast('並べ替えを保存できませんでした。'); }
  },
  showList: view => {
    void (async () => {
      if (view.id === viewId) { paneList.open(workspace, view.title, true); return; }
      const key = viewWorkspaceKey(view.id);
      const stored = await chrome.storage.local.get(key);
      paneList.open(parseWorkspace(stored[key]), view.title, false);
    })().catch(() => showToast('一覧を開けませんでした。'));
  },
  closeSidebar: toggleSidebar,
});
function showViewName(name: string): void { toolbar.currentView(name); document.title = name ? `${name} - ${text.title}` : text.title; }
function renderViews(views: ViewSummary[]): void { sidebar.render(views); const current = views.find(view => view.id === viewId); if (current) showViewName(current.title); }
async function refreshViews(): Promise<void> {
  if (tabId < 0) return;
  const response = await request({ type: 'views/list' });
  if (response.ok && response.views) renderViews(response.views);
}
let viewsTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleViews(): void {
  if (sidebar.element.hidden) return;
  clearTimeout(viewsTimer); viewsTimer = setTimeout(() => { void refreshViews().catch(() => undefined); }, 100);
}
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated] as chrome.events.Event<() => void>[]) event.addListener(scheduleViews);
function setSidebarVisible(visible: boolean): void {
  if (!visible && sidebar.element.contains(document.activeElement)) toolbar.element.querySelector<HTMLButtonElement>('.sidebar-toggle')!.focus();
  sidebar.element.hidden = !visible;
  toolbar.element.querySelector('.sidebar-toggle')!.setAttribute('aria-expanded', String(visible));
}
function toggleSidebar(): void {
  const visible = sidebar.element.hasAttribute('hidden');
  setSidebarVisible(visible);
  void saveUi({ sidebarVisible: visible });
  if (visible) void refreshViews();
}
const toolbarReopen = document.createElement('button');
toolbarReopen.type = 'button'; toolbarReopen.className = 'toolbar-reopen'; toolbarReopen.hidden = true;
toolbarReopen.setAttribute('aria-label', '上部ツールバーを開く'); toolbarReopen.title = '上部ツールバーを開く'; toolbarReopen.textContent = '▾';
function toggleToolbar(): void {
  const hide = !toolbar.element.hidden;
  toolbar.element.hidden = hide; toolbarReopen.hidden = !hide;
  if (hide) toolbarReopen.focus({ preventScroll: true }); else toolbar.element.querySelector<HTMLButtonElement>('.toolbar-hide')?.focus({ preventScroll: true });
  applyGeometry();
}
toolbarReopen.addEventListener('click', toggleToolbar);
function executeAction(action: AppAction, frameId?: number, at?: number): void {
  if (tabId < 0 || tour.isOpen || document.querySelector('dialog[open]')) return;
  if (action === 'escape-maximize' && (maximized === null || !paneMenu.hidden || dividerDrag || numberDrag || (at !== undefined && at < maximizeActivatedAt))) return;
  let target = selected;
  if (frameId !== undefined) {
    const mapped = frames.get(frameId);
    if (!mapped || panes[mapped.index]!.nav !== mapped.nav || !workspaceOrder(workspace).slice(0, workspace.count).includes(mapped.index) || (maximized !== null && maximized !== mapped.index)) return;
    target = mapped.index;
    selectPane(target, at);
  }
  switch (action) {
    case 'toggle-toolbar': toggleToolbar(); break;
    case 'escape-maximize': maximized = null; renderLayout(); break;
    case 'new-view': newView(); break;
    case 'toggle-sidebar': toggleSidebar(); break;
    case 'close-pane': closePane(target); break;
    case 'layout-undo': travelLayout(false); break;
    case 'layout-redo': travelLayout(true); break;
    case 'page-back': panes[target]!.pageBack(); break;
    case 'page-forward': panes[target]!.pageForward(); break;
    case 'zoom-in':
    case 'zoom-out': changed(target, { zoom: stepZoom(workspace.panes[target]!.zoom, action === 'zoom-in' ? 1 : -1) }); break;
    case 'split-add': {
      if (dividerDrag) dividerDrag();
      const fixed = workspaceFixed(workspace);
      const rect = grid.getBoundingClientRect(), box = measureTree(workspaceTree(workspace)).panes.get(fixed)!;
      splitSelected(fixed, box.width * rect.width >= box.height * rect.height ? 'x' : 'y'); break;
    }
    case 'split-up': splitSelected(workspaceFixed(workspace), 'y', true); break;
    case 'split-left': splitSelected(workspaceFixed(workspace), 'x', true); break;
    case 'split-down': splitSelected(workspaceFixed(workspace), 'y'); break;
    case 'split-right': splitSelected(workspaceFixed(workspace), 'x'); break;
    case 'view-up': sidebar.move(-1); break;
    case 'view-down': sidebar.move(1); break;
  }
}
const toolbar = createToolbar({
  count: changeCount,
  orientation: (orientation: Orientation) => commitLayout(() => { workspace.orientation = orientation; workspace.layout = mapTree(defaultTree(workspace.count, orientation), workspaceOrder(workspace)); }),
  preset: () => commitLayout(() => { changeCount(4); workspace.orientation = 'landscape'; workspace.layout = mapTree(defaultTree(4, 'landscape', true), workspaceOrder(workspace)); }),
  split: (axis, before) => splitSelected(workspaceFixed(workspace), axis, before),
  newView, sidebar: toggleSidebar,
  settings: () => dialogs.settings(),
  shortcuts: () => dialogs.shortcuts(),
  guide: () => tour.open(),
  templates: () => templateDialog.open(),
  toggleToolbar,
  templateShortcut: index => { void (async () => {
    const stored = (await chrome.storage.local.get('templateShortcutIds')).templateShortcutIds;
    const id = Array.isArray(stored) && typeof stored[index] === 'string' ? stored[index] : '';
    if (!id) { showToast('テンプレート画面でショートカットを設定してください'); return; }
    const response = await request({ type: 'templates/list' });
    const item = response.ok ? response.templates?.find(template => template.id === id) : undefined;
    if (item) applyTemplate(item); else showToast('設定したテンプレートが見つかりません');
  })().catch(() => showToast('テンプレートを適用できませんでした')); },
  undo: () => travelLayout(false), redo: () => travelLayout(true),
  paneList: () => paneList.open(workspace, '現在のビュー', true),
});
const paneList = createPaneList({ current: () => workspace, close: closePane, clear: slot => commitLayout(() => panes[slot]!.clear()), maximize: slot => { selectPane(slot); paneCallbacks.maximize(slot); }, reorder: (from, to) => {
  const order = workspaceOrder(workspace), before = order.slice(0, workspace.count);
  const start = before.indexOf(from), end = before.indexOf(to);
  if (start < 0 || end < 0 || start === end) return;
  const after = [...before]; after.splice(start, 1); after.splice(end, 0, from);
  const layout = workspaceTree(workspace);
  commitLayout(() => { workspace.layout = layout; workspace.order = [...after, ...order.slice(workspace.count)]; });
} });
const templateDialog = createTemplates({ current: () => shapeFromWorkspace(workspace), request, apply: applyTemplate });
const dialogs = createDialogs({
  hosts: () => hosts,
  removeHost: async (host) => {
    const response = await request({ type: 'allowlist/remove', hosts: [host] });
    if (!response.ok) showToast(response.reason);
  },
  addUrl,
  usedUrls: shownUrls,
});
const body = document.createElement('div'); body.className = 'workspace-body';
body.append(sidebar.element, grid);
app.append(toolbar.element, body, toast, toolbarReopen);
panes.forEach(pane => grid.append(pane.element));
// URL drops add a pane wherever they land; a loaded page is never replaced (R-79).
type LinkSide = { kind: 'divider'; path: string } | { kind: 'pane'; slot: number; side: PaneSide } | { kind: 'outer'; side: PaneSide };
type LinkTarget = LinkSide | { kind: 'center'; slot: number } | { kind: 'junction' };
type LinkPlan = { mode: 'add'; slot: number; position: number; tree: SplitTree } | { mode: 'open'; slot: number } | { mode: 'invalid'; reason: string };
const linkPreview = document.createElement('div');
linkPreview.className = 'link-drop-preview'; linkPreview.hidden = true; linkPreview.setAttribute('aria-hidden', 'true'); grid.append(linkPreview);
const linkZone = document.createElement('div');
linkZone.className = 'link-drop-zone'; linkZone.hidden = true; linkZone.setAttribute('aria-hidden', 'true'); grid.append(linkZone);
const dragDiagnostic = document.createElement('div');
dragDiagnostic.className = 'drag-diagnostic'; dragDiagnostic.hidden = true; app.append(dragDiagnostic);
let fixedLinkSide: PaneSide = 'right';
const sideLabel: Record<PaneSide, string> = { left: '左', right: '右', top: '上', bottom: '下' };
// The diagnostic stays until the next drag starts, so a failed drop can still be read or copied afterwards.
const emptyDiagnostic = () => ({ detected: '', types: '', target: '', result: '', enter: 0, docOver: 0, gridOver: 0, drop: 0, relayOver: 0, relayDrop: 0, signals: 0, lastTarget: '' });
const diagnostic = emptyDiagnostic();
function describeElement(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target ? 'document' : '-');
  return `${target.tagName.toLowerCase()}${target.className ? `.${String(target.className).split(' ')[0]}` : ''}`;
}
let diagnosticEnabled = false;
void chrome.storage.local.get('ui').then(({ ui }) => { diagnosticEnabled = (ui as { dragDiagnostic?: unknown } | undefined)?.dragDiagnostic === true; renderDiagnostic(); });
function renderDiagnostic(_sticky = true): void {
  if (!diagnosticEnabled) { dragDiagnostic.hidden = true; return; }
  const parts = [['検知', diagnostic.detected], ['種類', diagnostic.types], ['先', diagnostic.target], ['結果', diagnostic.result]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  const counts = `受信 親enter ${diagnostic.enter} / 親over ${diagnostic.docOver}（枠内 ${diagnostic.gridOver}） / 親drop ${diagnostic.drop} / 中継over ${diagnostic.relayOver} / 中継drop ${diagnostic.relayDrop} / 通知 ${diagnostic.signals}｜最後の対象 ${diagnostic.lastTarget || '-'}`;
  const version = chrome.runtime.getManifest().version_name ?? chrome.runtime.getManifest().version;
  dragDiagnostic.textContent = `ドラッグ診断 v${version}（クリックでコピー）｜${[...parts, counts].join('｜')}`; dragDiagnostic.hidden = false;
}
dragDiagnostic.addEventListener('click', () => {
  void navigator.clipboard?.writeText(dragDiagnostic.textContent ?? '').then(() => showToast('ドラッグ診断をコピーしました')).catch(() => undefined);
});
const displayNumber = (slot: number): number => workspaceOrder(workspace).indexOf(slot) + 1;
function describeTarget(target: LinkTarget | undefined, plan?: LinkPlan): string {
  if (!target) return '対象外';
  const place = target.kind === 'divider' ? '境界線' : target.kind === 'outer' ? `外周の${sideLabel[target.side]}` : target.kind === 'junction' ? '交点'
    : target.kind === 'pane' ? `枠${displayNumber(target.slot)}の${sideLabel[target.side]}` : `枠${displayNumber(target.slot)}の中央`;
  const action = !plan ? '' : plan.mode === 'add' ? '追加' : plan.mode === 'open' ? '空の枠で開く' : plan.reason;
  return action ? `${place} → ${action}` : place;
}
function positionLinkZone(): void {
  const box = (app.classList.contains('dragging') || linkDrag) && maximized === null ? measureTree(workspaceTree(workspace)).panes.get(workspaceFixed(workspace)) : undefined;
  linkZone.hidden = !box;
  if (!box) return;
  const horizontal = fixedLinkSide === 'left' || fixedLinkSide === 'right';
  const width = horizontal ? box.width / 3 : box.width, height = horizontal ? box.height : box.height / 3;
  const x = fixedLinkSide === 'right' ? box.x + box.width - width : box.x, y = fixedLinkSide === 'bottom' ? box.y + box.height - height : box.y;
  Object.assign(linkZone.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
  linkZone.textContent = `固定タブの${sideLabel[fixedLinkSide]}に追加`;
  linkZone.dataset.slot = String(workspaceFixed(workspace));
}
void chrome.storage.local.get('fixedLinkDirection').then(saved => { fixedLinkSide = linkSideFromDirection(saved.fixedLinkDirection); positionLinkZone(); });
function linkTargetAt(x: number, y: number): LinkTarget | undefined {
  if (maximized !== null) return;
  const rect = grid.getBoundingClientRect();
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return;
  const element = document.elementFromPoint(x, y);
  if (!linkZone.hidden && element?.closest('.link-drop-zone')) return { kind: 'pane', slot: Number(linkZone.dataset.slot), side: fixedLinkSide };
  const edges: [PaneSide, number][] = [['left', x - rect.left], ['right', rect.right - x], ['top', y - rect.top], ['bottom', rect.bottom - y]];
  edges.sort((a, b) => a[1] - b[1]);
  if (edges[0]![1] <= 6) return { kind: 'outer', side: edges[0]![0] };
  if (junctionAtPosition(x, y)) return { kind: 'junction' };
  const divider = dividerAtPosition(x, y);
  if (divider?.dataset.path !== undefined) return { kind: 'divider', path: divider.dataset.path };
  const pane = element?.closest<HTMLElement>('.pane');
  if (!pane || pane.hidden) return;
  const slot = Number(pane.dataset.slot);
  if (!Number.isInteger(slot) || !workspaceOrder(workspace).slice(0, workspace.count).includes(slot)) return;
  if (element?.closest('.pane-bar')) return { kind: 'center', slot };
  const box = pane.getBoundingClientRect(), view = pane.querySelector<HTMLElement>('.pane-view')!.getBoundingClientRect();
  const sides: [PaneSide, number][] = [['left', x - box.left], ['right', box.right - x], ['top', y - view.top], ['bottom', box.bottom - y]];
  sides.sort((a, b) => a[1] - b[1]);
  return sides[0]![1] >= 0 && sides[0]![1] <= Math.min(28, box.width / 4, view.height / 4) ? { kind: 'pane', slot, side: sides[0]![0] } : { kind: 'center', slot };
}
function linkInsertion(target: LinkSide): { slot: number; position: number; tree: SplitTree } | undefined {
  const order = workspaceOrder(workspace);
  const position = order.findIndex((slot, index) => index >= workspace.count && !workspace.panes[slot]!.url);
  if (position < 0 || workspace.count >= MAX_PANES) return;
  const slot = order[position]!, rect = grid.getBoundingClientRect();
  const tree = insertPaneAt(workspaceTree(workspace), slot, target, { width: rect.width, height: rect.height });
  return tree ? { slot, position, tree } : undefined;
}
function planLink(target: LinkTarget): LinkPlan {
  if (target.kind === 'junction') return { mode: 'invalid', reason: '交点には追加できません。境界線か枠を選んでください' };
  let side: LinkSide;
  if (target.kind === 'center') {
    if (!workspace.panes[target.slot]!.url) return { mode: 'open', slot: target.slot };
    side = { kind: 'pane', slot: target.slot, side: fixedLinkSide };
  } else side = target;
  const insertion = linkInsertion(side);
  return insertion ? { mode: 'add', ...insertion } : { mode: 'invalid', reason: workspace.count >= MAX_PANES ? text.full : 'この位置には追加できません' };
}
const clearLinkHighlights = (): void => document.querySelectorAll('.split-divider.number-drop-target, .split-divider.number-drop-invalid, .split-junction.number-drop-invalid').forEach(element => element.classList.remove('number-drop-target', 'number-drop-invalid'));
function clearLinkPlan(): void { linkPreview.hidden = true; clearLinkHighlights(); panes.forEach(pane => pane.element.classList.remove('drop-target')); }
// Same feedback as a number drag: the hovered divider lights up, a junction turns red, the preview shows the new pane.
function highlightLinkTarget(x: number, y: number, target: LinkTarget | undefined, plan: LinkPlan | undefined): void {
  clearLinkHighlights();
  if (!target) return;
  if (target.kind === 'junction') junctionAtPosition(x, y)?.classList.add('number-drop-invalid');
  else if (target.kind === 'divider') dividerAtPosition(x, y)?.classList.add(plan?.mode === 'add' ? 'number-drop-target' : 'number-drop-invalid');
}
function showLinkPlan(target: LinkTarget | undefined, plan: LinkPlan | undefined): void {
  panes.forEach(pane => pane.element.classList.toggle('drop-target', plan?.mode === 'open' && pane.index === plan.slot));
  if (!plan || plan.mode === 'open') linkPreview.hidden = true;
  else {
    linkPreview.hidden = false; linkPreview.classList.toggle('invalid', plan.mode === 'invalid');
    const box = plan.mode === 'add' ? measureTree(plan.tree).panes.get(plan.slot)! : { x: 0, y: 0, width: 1, height: 1 };
    Object.assign(linkPreview.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });
  }
  diagnostic.target = describeTarget(target, plan); renderDiagnostic(true);
}
function applyLinkPlan(plan: LinkPlan, url: string): string {
  if (plan.mode === 'invalid') { showToast(plan.reason); return plan.reason; }
  if (plan.mode === 'open') {
    selectPane(plan.slot); void panes[plan.slot]!.openExplicit(url);
    return `空の枠で開く（枠${displayNumber(plan.slot)}）`;
  }
  commitLayout(() => {
    workspace.order = [...workspaceOrder(workspace)];
    workspace.order.splice(plan.position, 1); workspace.order.splice(workspace.count, 0, plan.slot);
    workspace.count++; workspace.layout = plan.tree;
    void panes[plan.slot]!.openExplicit(url);
    workspace.panes[plan.slot] = { ...workspace.panes[plan.slot]!, url };
  });
  return `追加（枠${displayNumber(plan.slot)}）`;
}
function dropLink(target: LinkTarget | undefined, data: { uriList: string; html: string; plain: string }): void {
  clearLinkPlan(); clearDragging();
  const picked = pickDroppedUrl(data);
  diagnostic.target = describeTarget(target);
  if (!target) diagnostic.result = '対象外のため何もしない';
  else if (!picked.url) { const reason = picked.reason === 'image' ? '画像ではなくリンクをドラッグしてください' : text.invalidUrl; showToast(reason); diagnostic.result = reason; }
  else {
    const plan = planLink(target);
    diagnostic.target = describeTarget(target, plan);
    diagnostic.result = `${applyLinkPlan(plan, picked.url)} ${picked.url}`;
  }
  renderDiagnostic(false);
}
function urlTransfer(event: DragEvent): boolean {
  return !!event.dataTransfer && [...event.dataTransfer.types].some(type => type === 'text/uri-list' || type === 'text/plain');
}
grid.addEventListener('dragover', event => {
  if (!urlTransfer(event)) return;
  diagnostic.gridOver++;
  const target = linkTargetAt(event.clientX, event.clientY);
  if (!target) { clearLinkPlan(); return; }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  const plan = planLink(target);
  showLinkPlan(target, plan);
  highlightLinkTarget(event.clientX, event.clientY, target, plan);
}, true);
grid.addEventListener('drop', event => {
  if (!urlTransfer(event)) return;
  diagnostic.drop++; diagnostic.lastTarget = `drop ${describeElement(event.target)}`;
  event.preventDefault(); event.stopImmediatePropagation();
  const transfer = event.dataTransfer!;
  dropLink(linkTargetAt(event.clientX, event.clientY), { uriList: transfer.getData('text/uri-list'), html: transfer.getData('text/html'), plain: transfer.getData('text/plain') });
}, true);
// Outside every target, a URL drop must neither navigate this tab nor fall through to a page.
document.addEventListener('dragover', event => {
  if (event.defaultPrevented || !urlTransfer(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
});
document.addEventListener('drop', event => { if (!event.defaultPrevented && urlTransfer(event)) event.preventDefault(); });
// Drops that landed inside an embedded page arrive relayed through the worker with their position in that frame.
function relayedPoint(index: number, x: number, y: number): { x: number; y: number } | undefined {
  const pane = panes[index];
  if (!pane || pane.element.hidden) return;
  const view = pane.element.querySelector('.pane-view')!.getBoundingClientRect();
  return { x: view.left + Math.min(Math.max(x, 0), 1) * view.width, y: view.top + Math.min(Math.max(y, 0), 1) * view.height };
}
let relayedPreviewTimer: ReturnType<typeof setTimeout> | undefined;
function previewRelayed(index: number, x: number, y: number): void {
  const point = relayedPoint(index, x, y);
  if (!point) return;
  const target = linkTargetAt(point.x, point.y);
  showLinkPlan(target, target && planLink(target));
  if (relayedPreviewTimer !== undefined) clearTimeout(relayedPreviewTimer);
  relayedPreviewTimer = setTimeout(clearLinkPlan, 400);
}
function dropRelayed(index: number, message: { nested: boolean; x: number; y: number; uriList: string; html: string; plain: string }): void {
  if (!workspaceOrder(workspace).slice(0, workspace.count).includes(index)) return;
  const point = message.nested ? undefined : relayedPoint(index, message.x, message.y);
  const target = (point && linkTargetAt(point.x, point.y)) ?? { kind: 'center' as const, slot: index };
  diagnostic.relayDrop++; diagnostic.detected = 'ページ側で受信して中継';
  dropLink(target, { uriList: message.uriList, html: message.html, plain: message.plain });
}
document.addEventListener('dragend', clearLinkPlan);
// Emulated link drag (R-80): Chrome blocks same-page, cross-site native drags, so the pane page cancels
// the native drag and announces the link. Blink then releases mouse capture, the view's overlay catches the
// pointer, and the view tracks it exactly like a number drag. The drop is applied only after the worker has
// verified that a trusted dragstart in that pane announced the same id and URL.
const linkGhost = document.createElement('div');
linkGhost.className = 'link-drag-ghost'; linkGhost.hidden = true; linkGhost.setAttribute('aria-hidden', 'true'); app.append(linkGhost);
let linkDrag: { id: number; index: number; url: string; verified: boolean; source: MessageEventSource | null } | undefined;
let linkDragWatchdog: ReturnType<typeof setTimeout> | undefined;
const verifiedLinkDrags = new Map<number, { url: string; at: number }>();
// Starts announced by windows the view cannot map to a pane (nested frames) wait for the worker's verified start.
const pendingLinkStarts = new Map<number, { source: MessageEventSource | null; at: number }>();
function paneViewPoint(index: number, x: number, y: number): { x: number; y: number } | undefined {
  const pane = panes[index];
  if (!pane || pane.element.hidden) return;
  const view = pane.element.querySelector('.pane-view')!.getBoundingClientRect();
  return { x: view.left + x * view.width, y: view.top + y * view.height };
}
function armLinkDragWatchdog(): void {
  if (linkDragWatchdog !== undefined) clearTimeout(linkDragWatchdog);
  linkDragWatchdog = setTimeout(() => cancelLinkDrag('時間切れ'), 20000);
}
function rememberVerifiedLinkDrag(id: number, url: string): void {
  const now = Date.now();
  for (const [key, entry] of verifiedLinkDrags) if (now - entry.at > 10000) verifiedLinkDrags.delete(key);
  verifiedLinkDrags.set(id, { url, at: now });
  if (linkDrag?.id === id && linkDrag.url === url) linkDrag.verified = true;
}
function beginLinkDrag(index: number, id: number, url: string, title: string, source: MessageEventSource | null): void {
  if (maximized !== null || tour.isOpen || !workspaceOrder(workspace).slice(0, workspace.count).includes(index) || !isOpenableUrl(url)) return;
  if (linkDrag) cancelLinkDrag('別のドラッグ開始');
  if (numberDrag) numberDrag();
  if (dividerDrag) dividerDrag();
  linkDrag = { id, index, url, verified: verifiedLinkDrags.get(id)?.url === url, source };
  app.classList.add('number-dragging');
  linkGhost.textContent = title || url; linkGhost.hidden = false;
  positionLinkZone();
  Object.assign(diagnostic, emptyDiagnostic(), { detected: `枠${displayNumber(index)}のリンクを模擬ドラッグ`, types: 'link（ネイティブのドラッグを使わず座標を追跡）' });
  renderDiagnostic();
  window.addEventListener('pointermove', onLinkPointerMove, true);
  window.addEventListener('pointerup', onLinkPointerUp, true);
  window.addEventListener('pointercancel', onLinkPointerCancel, true);
  window.addEventListener('blur', onLinkPointerCancel);
  armLinkDragWatchdog();
}
function updateLinkDrag(point: { x: number; y: number }): void {
  if (!linkDrag) return;
  diagnostic.relayOver++;
  Object.assign(linkGhost.style, { left: `${Math.round(point.x + 14)}px`, top: `${Math.round(point.y + 16)}px` });
  const target = linkTargetAt(point.x, point.y);
  // Releasing on the middle of the source pane cancels, like dropping a number back on its own pane.
  const own = target?.kind === 'center' && target.slot === linkDrag.index;
  const plan = target && !own ? planLink(target) : undefined;
  showLinkPlan(own ? undefined : target, plan);
  highlightLinkTarget(point.x, point.y, own ? undefined : target, plan);
  if (diagnostic.relayOver % 10 === 1) renderDiagnostic();
  armLinkDragWatchdog();
}
function onLinkPointerMove(event: PointerEvent): void { if (event.isTrusted) updateLinkDrag({ x: event.clientX, y: event.clientY }); }
function onLinkPointerUp(event: PointerEvent): void { if (event.isTrusted) void finalizeLinkDrag({ x: event.clientX, y: event.clientY }); }
function onLinkPointerCancel(): void { cancelLinkDrag('ポインター中断'); }
function teardownLinkDrag(): { id: number; index: number; url: string; verified: boolean; source: MessageEventSource | null } | undefined {
  const drag = linkDrag;
  linkDrag = undefined;
  if (linkDragWatchdog !== undefined) { clearTimeout(linkDragWatchdog); linkDragWatchdog = undefined; }
  window.removeEventListener('pointermove', onLinkPointerMove, true);
  window.removeEventListener('pointerup', onLinkPointerUp, true);
  window.removeEventListener('pointercancel', onLinkPointerCancel, true);
  window.removeEventListener('blur', onLinkPointerCancel);
  if (!numberDrag) app.classList.remove('number-dragging');
  linkGhost.hidden = true;
  clearLinkPlan(); positionLinkZone();
  if (drag) {
    // Tell the pane page its emulated drag is over; the id alone carries no page data.
    const source = drag.source as { postMessage?: (message: unknown, origin: string) => void } | null;
    try { source?.postMessage?.({ type: 'split8/link-drag-done', id: drag.id }, '*'); } catch { /* window may be gone */ }
  }
  return drag;
}
function cancelLinkDrag(reason: string): void {
  const drag = teardownLinkDrag();
  if (!drag) return;
  diagnostic.result = `中止（${reason}）`; renderDiagnostic();
}
async function finalizeLinkDrag(point: { x: number; y: number } | undefined): Promise<void> {
  const drag = teardownLinkDrag();
  if (!drag) return;
  if (!point) { diagnostic.result = '位置が不明のため中止'; renderDiagnostic(); return; }
  if (!drag.verified) {
    // The worker-verified start normally arrives within milliseconds of the page's announcement.
    const verified = await new Promise<boolean>(resolve => {
      const started = Date.now();
      const tick = (): void => {
        if (verifiedLinkDrags.get(drag.id)?.url === drag.url) resolve(true);
        else if (Date.now() - started > 800) resolve(false);
        else setTimeout(tick, 40);
      };
      tick();
    });
    if (!verified) { diagnostic.result = 'ページ側の開始通知を確認できず中止'; renderDiagnostic(); return; }
  }
  verifiedLinkDrags.delete(drag.id);
  const target = linkTargetAt(point.x, point.y);
  if (target?.kind === 'center' && target.slot === drag.index) { diagnostic.target = '元の枠の中央'; diagnostic.result = '元の枠に戻したため何もしない'; renderDiagnostic(); return; }
  diagnostic.relayDrop++;
  dropLink(target, { uriList: drag.url, html: '', plain: '' });
}
// Fallback when the pane page still receives the pointer (no overlay yet): it reports ratios of its viewport.
function finishLinkDropFromPane(index: number, message: { id: number; nested: boolean; x: number; y: number; url: string }): void {
  if (!linkDrag || linkDrag.id !== message.id || linkDrag.index !== index) return;
  rememberVerifiedLinkDrag(message.id, message.url);
  const point = message.nested ? undefined : paneViewPoint(index, message.x, message.y);
  void finalizeLinkDrag(point);
}
document.addEventListener('pointerdown', event => { if (linkDrag && event.isTrusted) cancelLinkDrag('別の操作'); }, true);
window.addEventListener('message', event => {
  const owner = panes.findIndex(pane => pane.ownsWindow(event.source));
  if (owner < 0 && event.data?.type === 'split8/link-drag' && event.data.phase === 'start' && typeof event.data.id === 'number') {
    for (const [key, entry] of pendingLinkStarts) if (Date.now() - entry.at > 10000) pendingLinkStarts.delete(key);
    pendingLinkStarts.set(event.data.id, { source: event.source, at: Date.now() });
    return;
  }
  if (owner < 0 || typeof event.data?.at !== 'number' || !Number.isFinite(event.data.at)) return;
  if (event.data.type === 'split8/drag-over' && typeof event.data.x === 'number' && typeof event.data.y === 'number') { diagnostic.relayOver++; previewRelayed(owner, event.data.x, event.data.y); return; }
  if (event.data.type === 'split8/link-drag' && typeof event.data.id === 'number') {
    const { phase, id, x, y } = event.data as { phase: unknown; id: number; x: unknown; y: unknown };
    if (phase === 'start' && typeof event.data.url === 'string') beginLinkDrag(owner, id, event.data.url, typeof event.data.title === 'string' ? event.data.title : '', event.source);
    else if (phase === 'move' && linkDrag?.id === id && linkDrag.index === owner && typeof x === 'number' && typeof y === 'number') { const point = paneViewPoint(owner, x, y); if (point) updateLinkDrag(point); }
    else if (phase === 'cancel' && linkDrag?.id === id) cancelLinkDrag('ページ側で中止');
    return;
  }
  if (event.data.type !== 'split8/drag-state' || typeof event.data.active !== 'boolean' || event.data.at <= dragClearedAt) return;
  setDragging(event.data.active, event.data.startedHere === true);
});
document.addEventListener('dragenter', event => {
  if (!event.dataTransfer) return;
  const types = [...event.dataTransfer.types];
  const url = types.some(type => type === 'text/uri-list' || type === 'text/plain');
  // Mark the drag first: a fresh drag resets the diagnostic, so count and record only afterwards.
  if (url) setDragging(true);
  diagnostic.enter++;
  diagnostic.types = types.join(', ') || '(なし)';
  renderDiagnostic();
});
document.addEventListener('dragover', event => {
  if (urlTransfer(event)) { diagnostic.docOver++; diagnostic.lastTarget = `over ${describeElement(event.target)}`; if (diagnostic.docOver % 10 === 1) renderDiagnostic(); }
  if (app.classList.contains('dragging')) refreshDragWatchdog();
}, true);
document.addEventListener('drop', clearDragging);
document.addEventListener('dragend', clearDragging);
document.addEventListener('pointerup', () => { if (localDrag) clearDragging(); });
// Browsers suppress pointer events while a drag is in progress, so real pointer activity means it has ended.
document.addEventListener('pointermove', event => { if (event.isTrusted && (event.movementX || event.movementY) && app.classList.contains('dragging')) clearDragging(); });
document.addEventListener('pointerdown', event => { if (event.isTrusted && app.classList.contains('dragging')) clearDragging(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) clearDragging(); });
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight)) { clearLinkPlan(); clearDragging(); }
});

function selectPane(index: number, at?: number): void {
  if (!workspaceOrder(workspace).slice(0, workspace.count).includes(index) || (maximized !== null && maximized !== index)) return;
  const now = Date.now();
  if (now < lastSelectionClock) lastSelectionAt = 0;
  lastSelectionClock = now;
  const time = at === undefined ? now : Math.min(at, now);
  if (at !== undefined && (!Number.isFinite(at) || time < lastSelectionAt)) return;
  lastSelectionAt = time;
  selected = index;
  renderSelected();
}
function renderSelected(): void {
  const fixed = workspaceFixed(workspace);
  panes.forEach((pane, index) => {
    pane.element.classList.toggle('active', index === selected);
    pane.element.classList.toggle('fixed', index === fixed);
    const states = [index === selected ? text.selectedPane : '', index === fixed ? text.fixedPane : ''].filter(Boolean).join('・');
    if (states) pane.element.setAttribute('aria-description', states); else pane.element.removeAttribute('aria-description');
  });
}
const dividerHandles = new Map<string, HTMLButtonElement>();
const junctionHandles = new Map<string, HTMLButtonElement>();
const guideHandles = new Map<'x' | 'y', HTMLElement>();
function showSnapGuides(guides: SnapGuide[]): void {
  for (const axis of ['x', 'y'] as const) {
    const guide = guides.find(item => item.axis === axis);
    let element = guideHandles.get(axis);
    if (guide && !element) {
      element = document.createElement('div'); element.className = `snap-guide ${axis}`; element.setAttribute('aria-hidden', 'true');
      grid.append(element); guideHandles.set(axis, element);
    }
    if (element) {
      element.hidden = !guide;
      if (guide) element.style[axis === 'x' ? 'left' : 'top'] = `${guide.position * 100}%`;
    }
  }
  grid.dataset.snap = guides.map(item => item.axis).join('');
}
let activeJunctionKey: string | undefined;
function junctionKey(point: Junction): string { return JSON.stringify([point.vertical.slice().sort(), point.horizontal.slice().sort()]); }
function dividerAtJunction(event: MouseEvent, point: Junction): HTMLButtonElement | undefined {
  const rect = grid.getBoundingClientRect();
  const dx = Math.abs(event.clientX - (rect.left + point.x * rect.width));
  const dy = Math.abs(event.clientY - (rect.top + point.y * rect.height));
  const preferred = dividerAxis ?? (dx < dy ? 'x' : 'y');
  const candidates = document.elementsFromPoint(event.clientX, event.clientY)
    .filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement && element.classList.contains('split-divider'));
  return candidates.find(element => element.classList.contains(preferred)) ?? candidates[0];
}
function applyGeometry(): void {
  const tree = workspaceTree(workspace), layout = measureTree(tree);
  for (const pane of panes) {
    if (pane.element.hidden) continue;
    const position = maximized === pane.index ? { x: 0, y: 0, width: 1, height: 1 } : layout.panes.get(pane.index)!;
    pane.element.classList.toggle('space-for-reopen', !toolbarReopen.hidden && position.x === 0 && position.y === 0);
    Object.assign(pane.element.style, { left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: `${position.width * 100}%`, height: `${position.height * 100}%` });
  }
  const needed = new Set<string>();
  if (maximized === null) for (const divider of layout.dividers) {
    const key = `${divider.axis}:${divider.path}`; needed.add(key);
    let handle = dividerHandles.get(key);
    if (!handle) {
      handle = document.createElement('button'); handle.type = 'button'; handle.className = `split-divider ${divider.axis}`;
      handle.dataset.path = divider.path;
      handle.setAttribute('aria-label', divider.axis === 'x' ? '左右の境界' : '上下の境界');
      handle.addEventListener('pointerdown', event => beginDividerDrag(event, divider.path, handle!));
      handle.addEventListener('dblclick', event => {
        if (event.button !== 0 || event.shiftKey) return;
        const paths = dividerSelection.has(divider.path) ? [...dividerSelection] : [divider.path];
        commitLayout(() => { workspace.layout = flipDividers(workspaceTree(workspace), paths); });
      });
      dividerHandles.set(key, handle); grid.append(handle);
    }
    handle.setAttribute('aria-pressed', String(dividerSelection.has(divider.path)));
    Object.assign(handle.style, { left: `${divider.x * 100}%`, top: `${divider.y * 100}%`, width: divider.axis === 'y' ? `${divider.width * 100}%` : '8px', height: divider.axis === 'x' ? `${divider.height * 100}%` : '8px' });
  }
  for (const [key, handle] of dividerHandles) if (!needed.has(key)) { handle.remove(); dividerHandles.delete(key); }
  const junctions = new Set<string>();
  if (maximized === null) for (const point of findJunctions(tree)) {
    const key = junctionKey(point); junctions.add(key);
    let handle = junctionHandles.get(key);
    if (!handle) {
      handle = document.createElement('button'); handle.type = 'button'; handle.className = 'split-junction';
      handle.setAttribute('aria-label', '境界の交点');
      handle.addEventListener('pointerdown', event => {
        const current = findJunctions(workspaceTree(workspace)).find(item => junctionKey(item) === key);
        if (!current) return;
        if (event.shiftKey) {
          const divider = dividerAtJunction(event, current);
          if (divider?.dataset.path !== undefined) beginDividerDrag(event, divider.dataset.path, divider);
          return;
        }
        beginJunctionDrag(event, current, handle!, key);
      });
      handle.addEventListener('dblclick', event => {
        if (event.button !== 0 || event.shiftKey) return;
        const current = findJunctions(workspaceTree(workspace)).find(item => junctionKey(item) === key);
        const divider = current && dividerAtJunction(event, current), path = divider?.dataset.path;
        if (path === undefined) return;
        const paths = dividerSelection.has(path) ? [...dividerSelection] : [path];
        commitLayout(() => { workspace.layout = flipDividers(workspaceTree(workspace), paths); });
      });
      junctionHandles.set(key, handle); grid.append(handle);
    }
    Object.assign(handle.style, { left: `${point.x * 100}%`, top: `${point.y * 100}%` });
  }
  for (const [key, handle] of junctionHandles) if (!junctions.has(key) && key !== activeJunctionKey) { handle.remove(); junctionHandles.delete(key); }
}
function beginJunctionDrag(event: PointerEvent, point: Junction, handle: HTMLButtonElement, key: string): void {
  if (event.button !== 0 || !event.isPrimary || tour.isOpen) return;
  event.preventDefault();
  if (dividerDrag) dividerDrag();
  dividerSelection.clear(); dividerAxis = undefined;
  const base = workspaceTree(workspace), before = captureLayout(), rect = grid.getBoundingClientRect();
  const startX = event.clientX, startY = event.clientY;
  let moved = false;
  activeJunctionKey = key;
  applyGeometry();
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < 3) return;
    moved = true; grid.classList.add('resizing');
    const result = snapJunction(base, point, (next.clientX - startX) / rect.width, (next.clientY - startY) / rect.height, rect.width, rect.height, next.altKey);
    workspace.layout = result.tree; showSnapGuides(result.guides);
    applyGeometry();
  };
  const cleanup = () => {
    grid.classList.remove('resizing'); showSnapGuides([]); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
    handle.removeEventListener('lostpointercapture', cancel); dividerDrag = undefined; activeJunctionKey = undefined;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  const cancel = () => { cleanup(); if (moved) restoreLayout(before, []); else applyGeometry(); };
  const up = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) return; cleanup(); if (moved) { recordLayout(before); save(); } applyGeometry(); };
  dividerDrag = cancel;
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel, { once: true }); window.addEventListener('blur', cancel, { once: true });
  window.addEventListener('resize', cancel, { once: true });
  handle.addEventListener('lostpointercapture', cancel, { once: true });
  handle.setPointerCapture(event.pointerId);
}
function beginDividerDrag(event: PointerEvent, path: string, handle: HTMLButtonElement): void {
  if (event.button !== 0 || tour.isOpen) return;
  event.preventDefault();
  if (dividerDrag) dividerDrag();
  const base = workspaceTree(workspace), divider = measureTree(base).dividers.find(item => item.path === path);
  if (!divider) return;
  if (event.shiftKey) {
    if (dividerAxis && dividerAxis !== divider.axis) { showToast('最初に選んだ方向の境界だけ追加できます'); return; }
    if (dividerSelection.has(path)) dividerSelection.delete(path); else dividerSelection.add(path);
    dividerAxis = dividerSelection.size ? divider.axis : undefined;
    applyGeometry(); return;
  }
  const paths = dividerSelection.has(path) ? [...dividerSelection] : [path];
  if (!dividerSelection.has(path)) { dividerSelection.clear(); dividerAxis = undefined; applyGeometry(); }
  const before = captureLayout(), rect = grid.getBoundingClientRect(), startX = event.clientX, startY = event.clientY;
  let moved = false;
  const move = (next: PointerEvent) => {
    if (!moved && Math.hypot(next.clientX - startX, next.clientY - startY) < 3) return;
    moved = true; grid.classList.add('resizing');
    const delta = divider.axis === 'x' ? (next.clientX - startX) / rect.width : (next.clientY - startY) / rect.height;
    const result = snapDividers(base, paths, delta, rect.width, rect.height, next.altKey);
    workspace.layout = result.tree; showSnapGuides(result.guides);
    applyGeometry();
  };
  const cleanup = () => {
    grid.classList.remove('resizing'); showSnapGuides([]); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
    handle.removeEventListener('lostpointercapture', cancel); dividerDrag = undefined;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  const cancel = () => { cleanup(); if (moved) restoreLayout(before, []); };
  const up = () => { cleanup(); if (moved) { recordLayout(before); save(); } };
  dividerDrag = cancel;
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  window.addEventListener('pointercancel', cancel, { once: true }); window.addEventListener('blur', cancel, { once: true });
  window.addEventListener('resize', cancel, { once: true });
  handle.addEventListener('lostpointercapture', cancel, { once: true });
  handle.setPointerCapture(event.pointerId);
}
function renderLayout(): void {
  if (maximized !== null && toolbarBeforeMaximized === null) {
    toolbarBeforeMaximized = toolbar.element.hasAttribute('hidden');
    toolbar.element.hidden = true; toolbarReopen.hidden = false;
  } else if (maximized === null && toolbarBeforeMaximized !== null) {
    toolbar.element.hidden = false; toolbarReopen.hidden = true;
    toolbarBeforeMaximized = null;
  }
  panes.forEach((pane, index) => {
    pane.closeSuggestions();
    const display = workspaceOrder(workspace).indexOf(index), visible = display < workspace.count;
    pane.setDisplayNumber(display); pane.element.hidden = !visible;
    pane.element.classList.toggle('max-hidden', maximized !== null && maximized !== index);
    pane.setMaximized(maximized === index);
    if (visible) pane.showVisible();
  });
  applyGeometry(); toolbar.update(workspace.count, workspace.orientation); renderSelected(); positionLinkZone();
}
function splitSelected(index: number, axis: 'x' | 'y', before = false): void {
  if (workspace.count >= MAX_PANES) { showToast(text.full); return; }
  const order = workspaceOrder(workspace);
  const next = order.findIndex((slot, position) => position >= workspace.count && !workspace.panes[slot]!.url);
  if (next < 0) { showToast(text.full); return; }
  commitLayout(() => {
    workspace.order = [...order]; const [slot] = workspace.order.splice(next, 1); workspace.order.splice(workspace.count, 0, slot!);
    workspace.layout = splitPane(workspaceTree(workspace), index, slot!, axis, before);
    workspace.count++;
    maximized = null;
  });
}
type Navigation = { tabId: number; frameId: number; url: string; transitionQualifiers?: string[] };
function onCommitted(details: Navigation): void {
  if (details.tabId !== tabId) return;
  const parsed = new URL(details.url);
  const boot = new URL(bootBase);
  if (parsed.protocol === boot.protocol && parsed.host === boot.host && parsed.pathname === boot.pathname) {
    const index = Number(parsed.searchParams.get('pane'));
    const nav = Number(parsed.searchParams.get('nav'));
    if (!Number.isInteger(index) || index < 0 || index >= MAX_PANES || panes[index]!.nav !== nav) return;
    for (const [id, mapped] of frames) if (mapped.index === index) frames.delete(id);
    frames.set(details.frameId, { index, nav });
    return;
  }
  const mapped = frames.get(details.frameId);
  if (!mapped || panes[mapped.index]!.nav !== mapped.nav) return;
  panes[mapped.index]!.onCommitted(details.url, details.transitionQualifiers?.includes('forward_back'));
}
chrome.webNavigation.onCommitted.addListener(onCommitted);
chrome.webNavigation.onHistoryStateUpdated.addListener(onCommitted);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(onCommitted);
chrome.webNavigation.onCompleted.addListener(details => {
  if (details.tabId !== tabId || !isOpenableUrl(details.url)) return;
  const mapped = frames.get(details.frameId);
  if (mapped && panes[mapped.index]!.nav === mapped.nav) panes[mapped.index]!.onCompleted();
});
chrome.webNavigation.onErrorOccurred.addListener(details => {
  if (details.tabId !== tabId) return;
  const mapped = frames.get(details.frameId);
  if (!mapped || panes[mapped.index]!.nav !== mapped.nav) return;
  panes[mapped.index]!.onError(details.url, details.error);
});

async function init(): Promise<void> {
  const allSaved = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(allSaved)) rememberAddresses(key, value);
  const saved = await chrome.storage.local.get([workspaceKey, 'ui']);
  workspace = parseWorkspace(saved[workspaceKey]);
  workspace.layout ??= workspaceTree(workspace);
  selected = workspaceOrder(workspace)[0]!;
  const response = await request({ type: 'split/register' });
  if (!response.ok) {
    if (response.reason === 'already-open' && response.tabId !== undefined) {
      const other = await chrome.tabs.get(response.tabId);
      await chrome.tabs.update(response.tabId, { active: true });
      await chrome.windows.update(other.windowId, { focused: true });
      const self = await chrome.tabs.getCurrent();
      if (self?.id !== undefined) await chrome.tabs.remove(self.id);
      return;
    }
    throw new Error(response.reason);
  }
  if (response.tabId === undefined) throw new Error('分割タブを登録できませんでした');
  tabId = response.tabId;
  const registered = await request({ type: 'views/register' });
  if (!registered.ok) {
    if (registered.reason === 'deleted-view') { location.replace(`${chrome.runtime.getURL('split.html')}?view=${crypto.randomUUID()}`); return; }
    throw new Error(registered.reason);
  }
  if (registered.forkUrl) { location.replace(registered.forkUrl); return; }
  if (registered.views) renderViews(registered.views);
  if (viewDeleted || parseViewTombstones((await chrome.storage.local.get('viewTombstones')).viewTombstones).has(viewId)) { viewDeleted = true; throw new Error('このビューは削除されました。'); }
  persistEnabled = true;
  const ui = saved.ui as { schemaVersion?: unknown; sidebarVisible?: unknown } | undefined;
  setSidebarVisible(ui?.schemaVersion === 1 && ui.sidebarVisible === true);
  renderLayout();
  void refreshTabChoices();
  const pending = new URL(location.href).searchParams.get('add');
  if (pending !== null) {
    const clean = new URL(location.href); const axis = clean.searchParams.get('axis'); const before = clean.searchParams.get('before') === '1'; const link = clean.searchParams.get('link') === '1'; clean.searchParams.delete('add'); clean.searchParams.delete('axis'); clean.searchParams.delete('before'); clean.searchParams.delete('link');
    history.replaceState(null, '', clean.href);
    await addUrl(pending, false, axis === 'x' || axis === 'y' ? axis : undefined, undefined, before, link);
  }
  save();
}

async function addUrl(url: string, confirmLoad = false, axis?: 'x' | 'y', frameId?: number, before = false, link = false): Promise<boolean> {
  if (!isOpenableUrl(url)) { showToast(text.invalidUrl); return false; }
  if (link && !axis) {
    const direction = (await chrome.storage.local.get('fixedLinkDirection')).fixedLinkDirection;
    if (direction === 'left' || direction === 'right' || direction === 'up' || direction === 'down') {
      axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
      before = direction === 'left' || direction === 'up';
    }
  }
  if (dividerDrag) dividerDrag();
  const order = workspaceOrder(workspace);
  const empty = order.findIndex((slot, index) => index >= workspace.count && !workspace.panes[slot]!.url);
  const slot = empty >= 0 ? order[workspace.count]! : order.slice(0, workspace.count).find(id => !workspace.panes[id]!.url);
  if (slot === undefined) { showToast(text.full); return false; }
  const tree = workspaceTree(workspace);
  const mapped = frameId !== undefined ? frames.get(frameId) : undefined;
  const source = axis ? workspaceFixed(workspace) : mapped && panes[mapped.index]!.nav === mapped.nav && order.slice(0, workspace.count).includes(mapped.index) ? mapped.index : workspaceFixed(workspace);
  let loading: Promise<boolean> = Promise.resolve(false);
  commitLayout(() => {
    // Only unloaded, hidden panes exchange saved data. Live iframe owners never change.
    // Keep the pre-existing persisted insertion contract as well as the saved page order.
    for (let position = empty; position > workspace.count; position--) {
      const a = order[position]!, b = order[position - 1]!;
      panes[a]!.exchangeHiddenHistory(panes[b]!);
      [workspace.panes[a], workspace.panes[b]] = [workspace.panes[b]!, workspace.panes[a]!];
    }
    loading = panes[slot]!.openExplicit(url, confirmLoad);
    if (empty >= 0) {
      changeCount(workspace.count + 1);
      if (axis || mapped) workspace.layout = splitPane(tree, source, slot, axis ?? (workspace.orientation === 'landscape' ? 'x' : 'y'), before);
      maximized = null;
    }
    // Reserve the target URL in the same history entry; the frame still waits for allow().
    workspace.panes[slot] = { ...workspace.panes[slot]!, url };
  });
  toast.hidden = true;
  return loading;
}
let additions: Promise<unknown> = Promise.resolve();
let ready: Promise<void>;
chrome.runtime.onMessage.addListener((message: AddUrlMessage | AppActionMessage | { type: 'pane/title'; tabId: number; frameId: number; title: string; url: string } | { type: 'view/deleted'; viewId: string } | { type: 'pane/activate'; tabId: number; frameId: number; at: number } | { type: 'pane/change-count'; tabId: number; delta: number; source?: 'page' } | { type: 'pane/drag-state'; tabId: number; active: boolean; startedHere?: boolean; at: number } | { type: 'pane/drop-url'; tabId: number; frameId: number; nested: boolean; uriList: string; html: string; plain: string; x: number; y: number; shift: boolean; at: number } | { type: 'pane/link-drop'; tabId: number; frameId: number; nested: boolean; id: number; url: string; x: number; y: number; at: number } | { type: 'pane/link-drag'; tabId: number; frameId: number; nested: boolean; id: number; url: string; title: string; at: number }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === 'view/deleted') {
    if (!sender.tab && message.viewId === viewId) { viewDeleted = true; persistEnabled = false; void saves.catch(() => undefined).then(() => sendResponse({ ok: true })); return true; }
    return;
  }
  if (message?.type === 'pane/title') {
    const mapped = frames.get(message.frameId);
    if (!sender.tab && message.tabId === tabId && mapped && panes[mapped.index]!.nav === mapped.nav && workspace.panes[mapped.index]!.url === message.url && typeof message.title === 'string' && message.title.length <= 300 && workspace.panes[mapped.index]!.title !== message.title) changed(mapped.index, { title: message.title });
    return;
  }
  if (message?.type === 'pane/activate') {
    const mapped = frames.get(message.frameId);
    if (!sender.tab && message.tabId === tabId && Number.isFinite(message.at) && mapped && panes[mapped.index]!.nav === mapped.nav) selectPane(mapped.index, message.at);
    return;
  }
  if (message?.type === 'app/action') {
    if (!sender.tab && message.tabId === tabId && isAppAction(message.action)) executeAction(message.action, message.frameId, message.at);
    return;
  }
  if (message?.type === 'pane/link-drag') {
    const mapped = frames.get(message.frameId);
    if (!sender.tab && message.tabId === tabId && mapped && typeof message.url === 'string' && typeof message.id === 'number') {
      rememberVerifiedLinkDrag(message.id, message.url);
      if (linkDrag?.id !== message.id) {
        const pending = pendingLinkStarts.get(message.id); pendingLinkStarts.delete(message.id);
        beginLinkDrag(mapped.index, message.id, message.url, typeof message.title === 'string' ? message.title : '', pending?.source ?? null);
      }
    }
    return;
  }
  if (message?.type === 'pane/link-drop') {
    const mapped = frames.get(message.frameId);
    if (!sender.tab && message.tabId === tabId && mapped && typeof message.url === 'string' && typeof message.id === 'number' && typeof message.x === 'number' && typeof message.y === 'number') finishLinkDropFromPane(mapped.index, { id: message.id, nested: message.nested === true, x: message.x, y: message.y, url: message.url });
    return;
  }
  if (message?.type === 'pane/drop-url') {
    const mapped = frames.get(message.frameId);
    if (!sender.tab && message.tabId === tabId && mapped && typeof message.uriList === 'string' && typeof message.html === 'string' && typeof message.plain === 'string') dropRelayed(mapped.index, { nested: message.nested === true, x: Number(message.x), y: Number(message.y), uriList: message.uriList, html: message.html, plain: message.plain });
    return;
  }
  if (message?.type === 'pane/drag-state') {
    if (message.tabId === tabId && typeof message.at === 'number' && Number.isFinite(message.at) && message.at > dragClearedAt) setDragging(message.active, message.startedHere === true);
    return;
  }
  if (message?.type === 'pane/change-count') {
    if (!tour.isOpen && message.tabId === tabId && (message.delta === 1 || message.delta === -1)) applyShortcut(message.delta, message.source === 'page' ? 'page' : 'command');
    return;
  }
  if (message?.type !== 'pane/add-url') return;
  if (message.tabId !== tabId) return;
  if (sender.tab) return;
  const action = additions.then(() => ready).then(() => addUrl(message.url, message.confirmLoad, message.axis, message.frameId, message.before, message.link));
  additions = action.catch(() => undefined);
  void action.then(ok => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
  return true;
});
installShortcutHints();
ready = init();
void refreshShortcuts();
void ready.catch((error: unknown) => showToast(error instanceof Error ? error.message : '分割ビューを開始できませんでした'));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.viewTombstones && parseViewTombstones(changes.viewTombstones.newValue).has(viewId)) { viewDeleted = true; persistEnabled = false; }
  if (area === 'local') for (const [key, change] of Object.entries(changes)) rememberAddresses(key, change.newValue);
  if (area === 'local' && changes.viewRegistry) {
    const current = parseViewRegistry(changes.viewRegistry.newValue).find(view => view.id === viewId); if (current) showViewName(current.title);
    scheduleViews();
  }
  if (area === 'local' && changes.fixedLinkDirection) { fixedLinkSide = linkSideFromDirection(changes.fixedLinkDirection.newValue); positionLinkZone(); }
  if (area === 'local' && changes.ui) {
    const ui = changes.ui.newValue as { schemaVersion?: unknown; sidebarVisible?: unknown; dragDiagnostic?: unknown } | undefined;
    diagnosticEnabled = ui?.dragDiagnostic === true; renderDiagnostic();
    setSidebarVisible(ui?.schemaVersion === 1 && ui.sidebarVisible === true);
    if (ui?.schemaVersion === 1 && ui.sidebarVisible === true) scheduleViews();
  }
  const value = changes.allowlist?.newValue as { schemaVersion?: number; hosts?: unknown } | undefined;
  if (area === 'local' && value?.schemaVersion === 1 && Array.isArray(value.hosts)) hosts = value.hosts.filter((item): item is string => typeof item === 'string');
});
