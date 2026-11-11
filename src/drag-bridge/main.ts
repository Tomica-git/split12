import { matchesShortcut } from '../core/shortcuts';
import { appActionForKey, zoomActionForKey } from '../core/appActions';

// Compute event time using the same wall clock in every document, while
// accounting for time the event spent waiting in this document's queue.
function eventTime(event: Event): number { return Date.now() - Math.max(0, performance.now() - event.timeStamp); }
let inputReported = false;
function reportInput(event: Event): void {
  inputReported = true;
  void chrome.runtime.sendMessage({ type: 'app/activate', at: eventTime(event) }).catch(() => undefined);
}
window.addEventListener('blur', () => { inputReported = false; });

// Only the extension worker decides whether this frame belongs to a split view.
function signal(active: boolean, startedHere = false): void {
  const at = Date.now();
  window.parent.postMessage({ type: 'split8/drag-state', active, startedHere, at }, `chrome-extension://${chrome.runtime.id}`);
  void chrome.runtime.sendMessage({ type: 'drag/state', active, startedHere, at }).catch(() => undefined);
}
const urlTypes = (transfer: DataTransfer | null): boolean => !!transfer && [...transfer.types].some(type => type === 'text/uri-list' || type === 'text/plain');
// Capture phase: a page that stops propagation below the document must not hide the drag from the view.
window.addEventListener('dragstart', event => { if (event.isTrusted && !startLinkDrag(event)) signal(true, true); }, true);
window.addEventListener('dragend', event => { if (event.isTrusted) signal(false); }, true);
// An external drag may enter an embedded page without starting in this view.
window.addEventListener('dragenter', event => { if (event.isTrusted && urlTypes(event.dataTransfer)) signal(true); }, true);
// A URL drag that reaches this embedded page before the view's shield exists would be dropped here.
// Claim it so the drop fires, report its position for the view's preview, and relay the drop (R-79).
// Synchronous check that this document sits inside the extension's split page, independent of the async config.
const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;
const inSplitView = (): boolean => window !== window.top && (appEnabled || Array.from(location.ancestorOrigins ?? []).includes(extensionOrigin));
// Chrome refuses same-page, cross-site native drags (crbug.com/59081), so a link dragged inside a
// pane never reaches the view or another site's pane. Links are therefore dragged by emulation: the
// native drag is cancelled, this page keeps the pointer, and positions are reported to the view (R-80).
let linkDrag: { id: number; url: string; pointerId: number; startX: number; startY: number; moved: boolean; element: Element } | undefined;
let lastPointerId = 1;
let lastLinkMoveAt = 0;
window.addEventListener('pointerdown', event => { if (event.isTrusted && event.button === 0) lastPointerId = event.pointerId; }, true);
const postTop = (data: Record<string, unknown>): void => { window.top?.postMessage({ ...data, at: Date.now() }, extensionOrigin); };
const pointerRatio = (event: { clientX: number; clientY: number }): { x: number; y: number } => ({ x: event.clientX / innerWidth, y: event.clientY / innerHeight });
function startLinkDrag(event: DragEvent): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest('a[href]');
  const custom = target?.closest('[draggable="true"]');
  const url = anchor instanceof HTMLAnchorElement ? anchor.href : '';
  // Shift keeps Chrome's native drag (for dragging out to another window). Page-owned draggables stay native.
  if (!anchor || !/^https?:/i.test(url) || (custom && custom !== anchor) || event.shiftKey || !inSplitView()) return false;
  event.preventDefault();
  const id = Date.now() + Math.random();
  linkDrag = { id, url, pointerId: lastPointerId, startX: event.clientX, startY: event.clientY, moved: false, element: anchor };
  try { anchor.setPointerCapture(lastPointerId); } catch { /* implicit mouse capture still routes the pointer here */ }
  const title = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || anchor.querySelector('img')?.alt?.slice(0, 100) || '';
  postTop({ type: 'split8/link-drag', phase: 'start', id, url, title, ...pointerRatio(event) });
  // The worker verifies this trusted start; the view applies the drop only for a verified id and URL.
  void chrome.runtime.sendMessage({ type: 'app/link-drag', id, url, title, at: eventTime(event) }).catch(() => undefined);
  return true;
}
window.addEventListener('message', event => {
  if (event.source !== window.top || event.origin !== extensionOrigin || event.data?.type !== 'split8/link-drag-done' || linkDrag?.id !== event.data.id) return;
  const drag = linkDrag;
  if (!drag) return;
  linkDrag = undefined;
  try { if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
});
function endLinkDrag(phase: 'end' | 'cancel', event?: PointerEvent): void {
  const drag = linkDrag;
  if (!drag) return;
  linkDrag = undefined;
  try { if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
  const ratio = event ? pointerRatio(event) : { x: 0, y: 0 };
  postTop({ type: 'split8/link-drag', phase, id: drag.id, ...ratio });
  if (phase === 'end' && event) void chrome.runtime.sendMessage({ type: 'app/link-drop', id: drag.id, url: drag.url, x: ratio.x, y: ratio.y, at: eventTime(event) }).catch(() => undefined);
}
window.addEventListener('pointermove', event => {
  if (!linkDrag || !event.isTrusted || event.pointerId !== linkDrag.pointerId) return;
  if (!linkDrag.moved && Math.hypot(event.clientX - linkDrag.startX, event.clientY - linkDrag.startY) >= 6) linkDrag.moved = true;
  const now = Date.now();
  if (now - lastLinkMoveAt < 16) return;
  lastLinkMoveAt = now;
  postTop({ type: 'split8/link-drag', phase: 'move', id: linkDrag.id, ...pointerRatio(event) });
}, true);
window.addEventListener('pointerup', event => {
  if (!linkDrag || !event.isTrusted || event.pointerId !== linkDrag.pointerId) return;
  const moved = linkDrag.moved;
  endLinkDrag(moved ? 'end' : 'cancel', event);
  if (!moved) return;
  // The release after a drag must not count as a click on the link.
  const swallow = (click: Event): void => { click.preventDefault(); click.stopImmediatePropagation(); };
  window.addEventListener('click', swallow, true);
  setTimeout(() => window.removeEventListener('click', swallow, true), 300);
}, true);
window.addEventListener('pointercancel', event => { if (linkDrag && event.pointerId === linkDrag.pointerId) endLinkDrag('cancel'); }, true);
window.addEventListener('blur', () => { if (linkDrag) endLinkDrag('cancel'); });
document.addEventListener('selectstart', event => { if (linkDrag) event.preventDefault(); }, true);
let lastOverAt = 0;
window.addEventListener('dragover', event => {
  if (!event.isTrusted || !inSplitView() || !urlTypes(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  const now = Date.now();
  if (now - lastOverAt < 50) return;
  lastOverAt = now;
  window.parent.postMessage({ type: 'split8/drag-over', x: event.clientX / innerWidth, y: event.clientY / innerHeight, at: now }, `chrome-extension://${chrome.runtime.id}`);
}, true);
window.addEventListener('drop', event => {
  // Bubble phase: a page that handled the drop itself has already prevented it or stopped it.
  if (!event.isTrusted || event.defaultPrevented || !inSplitView() || !urlTypes(event.dataTransfer)) return;
  // Always stop the page from navigating to the dropped URL; the view decides what happens.
  event.preventDefault();
  const transfer = event.dataTransfer!;
  void chrome.runtime.sendMessage({
    type: 'app/drop-url', uriList: transfer.getData('text/uri-list').slice(0, 4000), html: transfer.getData('text/html').slice(0, 20000), plain: transfer.getData('text/plain').slice(0, 4000),
    x: event.clientX / innerWidth, y: event.clientY / innerHeight, shift: event.shiftKey, at: eventTime(event),
  }).catch(() => undefined);
});

// A click inside an embedded page does not bubble to the extension page. Report
// trusted primary presses even while the asynchronous shortcut configuration is
// loading; the worker independently verifies the tab, frame and document.
window.addEventListener('pointerdown', event => {
  if (!event.isTrusted || event.button !== 0 || (event.ctrlKey && event.pointerType === 'mouse') || window === window.top) return;
  reportInput(event);
}, true);

let shortcuts: { up: string; down: string; directions?: Record<string, string> } | undefined;
let appEnabled = false;
function refreshShortcuts(): void {
  void chrome.runtime.sendMessage({ type: 'app/config' }).then(result => { appEnabled = result?.enabled === true; }).catch(() => { appEnabled = false; });
  void chrome.runtime.sendMessage({ type: 'shortcut/config' }).then(result => {
    shortcuts = result && typeof result.up === 'string' && typeof result.down === 'string' ? result : undefined;
  }).catch(() => { shortcuts = undefined; });
}
refreshShortcuts();
window.addEventListener('focus', refreshShortcuts);
// Titles are sent only to the extension worker; it verifies the originating pane.
function reportTitle(): void {
  if (window === window.top || !document.title.trim()) return;
  void chrome.runtime.sendMessage({ type: 'app/title', title: document.title.trim().slice(0, 300), url: location.href }).catch(() => undefined);
}
document.addEventListener('DOMContentLoaded', () => {
  reportTitle();
  if (document.head) new MutationObserver(reportTitle).observe(document.head, { childList: true, subtree: true, characterData: true });
});
window.addEventListener('keydown', event => {
  if (!event.isTrusted) return;
  if (linkDrag && event.key === 'Escape') { endLinkDrag('cancel'); event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (!inputReported && window !== window.top) reportInput(event);
  // Let the page handle Escape first. A page that consumes it keeps its own
  // dialog/menu behavior; only an unconsumed trusted Escape reaches the view.
  if (appEnabled && event.key === 'Escape' && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    const at = eventTime(event);
    setTimeout(() => {
      if (!event.defaultPrevented) void chrome.runtime.sendMessage({ type: 'app/pressed', action: 'escape-maximize', at }).catch(() => undefined);
    }, 0);
    return;
  }
  if (appEnabled && event.repeat && zoomActionForKey(event)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  const editable = event.target instanceof Element && Boolean(event.target.closest('input,textarea,[contenteditable="true"]'));
  const action = appEnabled ? appActionForKey(event, true, editable) : null;
  if (action !== 'split-add' && action?.startsWith('split-') && shortcuts?.directions?.[action]) return;
  if (action) {
    event.preventDefault(); event.stopImmediatePropagation();
    void chrome.runtime.sendMessage({ type: 'app/pressed', action, at: eventTime(event) }).catch(() => undefined);
    return;
  }
  if (!shortcuts) return;
  const delta = matchesShortcut(shortcuts.up, event) ? 1 : matchesShortcut(shortcuts.down, event) ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  void chrome.runtime.sendMessage({ type: 'shortcut/pressed', delta }).catch(() => undefined);
}, true);
