import { frameActions, isAppAction } from '../core/appActions';
import { isOpenableUrl } from '../core/url';

type Hooks = { tabIds(): Promise<number[]>; isSplitUrl(url: string | undefined): boolean };
// about:blank/srcdoc are accepted only as nested documents; their ancestor must
// still lead to an HTTP(S) pane in a registered Split8 tab.
const isFrameUrl = (url: string | undefined): boolean => isOpenableUrl(url) || (typeof url === 'string' && /^about:(?:blank|srcdoc)(?:[?#].*)?$/i.test(url));
// Resolve nested site frames to the direct child whose boot navigation the view recorded.
export async function rootPaneFrame(tabId: number, frameId: number, documentId?: string): Promise<number | undefined> {
  let current = frameId;
  for (let depth = 0; depth < 32 && current > 0; depth++) {
    const frame = await chrome.webNavigation.getFrame({ tabId, frameId: current });
    if (!frame || frame.errorOccurred || !isFrameUrl(frame.url) || (depth === 0 && documentId && frame.documentId !== documentId)) return;
    if (frame.parentFrameId === 0) return isOpenableUrl(frame.url) ? current : undefined;
    current = frame.parentFrameId;
  }
}
export function setupAppActions(hooks: Hooks): void {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['app/config', 'app/pressed', 'app/activate', 'app/title', 'app/drop-url', 'app/link-drop', 'app/link-drag'].includes(message?.type)) return;
    if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.frameId || !sender.documentId || !isFrameUrl(sender.url)) { respond({ enabled: false }); return; }
    void (async () => {
      const id = sender.tab!.id!;
      if (!(await hooks.tabIds()).includes(id)) return { enabled: false };
      const tab = await chrome.tabs.get(id);
      if (!hooks.isSplitUrl(tab.url) || (tab.pendingUrl && !hooks.isSplitUrl(tab.pendingUrl))) return { enabled: false };
      const frameId = await rootPaneFrame(id, sender.frameId!, sender.documentId);
      if (frameId === undefined) return { enabled: false };
      if (message.type === 'app/config') return { enabled: true };
      if (message.type === 'app/title') {
        if (frameId !== sender.frameId || typeof message.title !== 'string' || !message.title.trim() || message.title.length > 300 || !isOpenableUrl(message.url) || sender.url !== message.url) return { enabled: false };
        await chrome.runtime.sendMessage({ type: 'pane/title', tabId: id, frameId, title: message.title, url: message.url });
        return { enabled: true };
      }
      if (message.type === 'app/link-drag') {
        if (typeof message.at !== 'number' || !Number.isFinite(message.at) || typeof message.id !== 'number' || !isOpenableUrl(message.url)) return { enabled: false };
        await chrome.runtime.sendMessage({ type: 'pane/link-drag', tabId: id, frameId, nested: frameId !== sender.frameId, id: message.id, url: message.url, title: typeof message.title === 'string' ? message.title.slice(0, 100) : '', at: message.at });
        return { enabled: true };
      }
      if (message.type === 'app/link-drop') {
        const coordinate = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 50 ? value : undefined;
        const x = coordinate(message.x), y = coordinate(message.y);
        if (typeof message.at !== 'number' || !Number.isFinite(message.at) || typeof message.id !== 'number' || !isOpenableUrl(message.url) || x === undefined || y === undefined) return { enabled: false };
        await chrome.runtime.sendMessage({ type: 'pane/link-drop', tabId: id, frameId, nested: frameId !== sender.frameId, id: message.id, url: message.url, x, y, at: message.at });
        return { enabled: true };
      }
      if (message.type === 'app/drop-url') {
        if (typeof message.at !== 'number' || !Number.isFinite(message.at)) return { enabled: false };
        const clip = (value: unknown, limit: number): string => typeof value === 'string' ? value.slice(0, limit) : '';
        const ratio = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : .5;
        await chrome.runtime.sendMessage({
          type: 'pane/drop-url', tabId: id, frameId, nested: frameId !== sender.frameId, uriList: clip(message.uriList, 4000), html: clip(message.html, 20000), plain: clip(message.plain, 4000),
          x: ratio(message.x), y: ratio(message.y), shift: message.shift === true, at: message.at,
        });
        return { enabled: true };
      }
      if (message.type === 'app/activate') {
        if (typeof message.at !== 'number' || !Number.isFinite(message.at)) return { enabled: false };
        await chrome.runtime.sendMessage({ type: 'pane/activate', tabId: id, frameId, at: message.at });
        return { enabled: true };
      }
      if (!isAppAction(message.action) || !frameActions.includes(message.action)) return { enabled: false };
      if (typeof message.at !== 'number' || !Number.isFinite(message.at)) return { enabled: false };
      await chrome.runtime.sendMessage({ type: 'app/action', tabId: id, frameId, action: message.action, at: message.at });
      return { enabled: true };
    })().then(respond).catch(() => respond({ enabled: false }));
    return true;
  });
}
