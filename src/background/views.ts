import { normalizeDisplayName } from '../core/names';
import { parseViewRegistry, parseViewTombstones, validViewId, viewIdFromUrl, viewWorkspaceKey, type ViewRecord, type ViewSummary } from '../core/views';

type Hooks = { tabIds(): Promise<number[]>; isSplitUrl(value: string | undefined): boolean; remember(id: number): Promise<void>; apply(): Promise<void>; serial<T>(work: () => Promise<T>): Promise<T> };
export function setupViews(hooks: Hooks): void {
  const base = chrome.runtime.getURL('split.html');
  const tabUrl = (tab: chrome.tabs.Tab) => hooks.isSplitUrl(tab.url) ? tab.url! : tab.pendingUrl!;
  const tabView = (tab: chrome.tabs.Tab) => viewIdFromUrl(tabUrl(tab));
  async function openViews(): Promise<chrome.tabs.Tab[]> {
    const ids = await hooks.tabIds();
    return (await chrome.tabs.query({})).filter(tab => tab.id !== undefined && ids.includes(tab.id) && (hooks.isSplitUrl(tab.url) || hooks.isSplitUrl(tab.pendingUrl)) && (!tab.pendingUrl || hooks.isSplitUrl(tab.pendingUrl)));
  }
  async function records(): Promise<ViewRecord[]> {
    const stored = await chrome.storage.local.get(null), deleted = parseViewTombstones(stored.viewTombstones);
    const items = parseViewRegistry(stored.viewRegistry).filter(item => !deleted.has(item.id));
    const ids = new Set(items.map(item => item.id));
    for (const key of Object.keys(stored)) {
      const id = key === 'workspace' ? 'main' : key.startsWith('workspace:') ? key.slice(10) : null;
      if (validViewId(id) && !deleted.has(id) && !ids.has(id)) { items.push({ id, title: `ビュー ${items.length + 1}`, createdAt: Date.now() }); ids.add(id); }
    }
    for (const tab of await openViews()) {
      const id = tabView(tab);
      if (!deleted.has(id) && !ids.has(id)) { items.push({ id, title: `ビュー ${items.length + 1}`, createdAt: Date.now() }); ids.add(id); }
    }
    if (JSON.stringify(parseViewRegistry(stored.viewRegistry)) !== JSON.stringify(items)) await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views: items } });
    return items;
  }
  const summaries = (items: ViewRecord[], tabs: chrome.tabs.Tab[]): ViewSummary[] => items.map(item => {
    const tabIds = tabs.filter(tab => tabView(tab) === item.id).flatMap(tab => tab.id === undefined ? [] : [tab.id]);
    return { ...item, tabId: tabIds[0], tabIds };
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['views/register', 'views/list', 'views/create', 'views/focus', 'views/rename', 'views/delete', 'views/reorder', 'views/state'].includes(message?.type)) return;
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined || !hooks.isSplitUrl(sender.url)) { respond({ ok: false, reason: 'unauthorized' }); return; }
    if (message.type === 'views/state') {
      const id = sender.tab.id, view = viewIdFromUrl(sender.url!);
      if (typeof message.empty !== 'boolean') { respond({ ok: false }); return; }
      void hooks.serial(async () => {
        if (!(await hooks.tabIds()).includes(id)) return { ok: false };
        const closing = ((await chrome.storage.session.get('closingViews')).closingViews ?? {}) as Record<string, { id?: unknown; empty?: unknown }>;
        await chrome.storage.session.set({ closingViews: { ...closing, [id]: { id: view, empty: message.empty } } });
        return { ok: true };
      }).then(respond).catch(() => respond({ ok: false }));
      return true;
    }
    void hooks.serial(async () => {
      const current = await chrome.tabs.get(sender.tab!.id!);
      if (!(await hooks.tabIds()).includes(current.id!) || !hooks.isSplitUrl(current.url) || (current.pendingUrl && !hooks.isSplitUrl(current.pendingUrl))) return { ok: false, reason: 'unauthorized' };
      const items = await records(), tabs = await openViews();
      const currentId = viewIdFromUrl(sender.url!);
      const deleted = parseViewTombstones((await chrome.storage.local.get('viewTombstones')).viewTombstones);
      if (deleted.has(currentId)) return { ok: false, reason: 'deleted-view' };
      if (message.type === 'views/register') {
        const closing = ((await chrome.storage.session.get('closingViews')).closingViews ?? {}) as Record<string, { id?: unknown; empty?: unknown }>;
        if (closing[current.id!]) { delete closing[current.id!]; await chrome.storage.session.set({ closingViews: closing }); }
      }
      if (message.type === 'views/create') {
        const titles = new Set(items.map(item => item.title));
        let number = 1;
        while (titles.has(`ビュー ${number}`)) number++;
        items.push({ id: crypto.randomUUID(), title: `ビュー ${number}`, createdAt: Date.now() });
        await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views: items } });
        return { ok: true, views: summaries(items, tabs) };
      }
      if (message.type === 'views/register' && tabs.some(tab => tab.id !== current.id && tabView(tab) === currentId)) {
        const id = crypto.randomUUID(), state = (await chrome.storage.local.get(viewWorkspaceKey(currentId)))[viewWorkspaceKey(currentId)];
        items.push({ id, title: `ビュー ${items.length + 1}（コピー）`, createdAt: Date.now() });
        await chrome.storage.local.set({ ...(state ? { [viewWorkspaceKey(id)]: state } : {}), viewRegistry: { schemaVersion: 1, views: items } });
        return { ok: true, forkUrl: `${base}?view=${id}` };
      }
      if (message.type === 'views/reorder') {
        // The new order must be a permutation of the known views; the registry order is what the list shows.
        const ids: string[] = Array.isArray(message.ids) ? message.ids.filter(validViewId) : [];
        const known = new Set(items.map(item => item.id));
        if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some(id => !known.has(id))) return { ok: false, reason: 'view-order-mismatch' };
        const ordered = ids.map(id => items.find(item => item.id === id)!);
        await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views: ordered } });
        return { ok: true, views: summaries(ordered, tabs) };
      }
      if (message.type === 'views/focus' || message.type === 'views/rename' || message.type === 'views/delete') {
        if (!validViewId(message.id) || deleted.has(message.id) || !items.some(item => item.id === message.id)) return { ok: false, reason: 'unknown-view' };
        if (message.type === 'views/focus') {
          const existing = tabs.find(tab => tabView(tab) === message.id);
          if (existing?.id !== undefined) { await chrome.tabs.update(existing.id, { active: true }); await chrome.windows.update(existing.windowId, { focused: true }); }
          else {
            const created = await chrome.tabs.create({ url: message.id === 'main' ? base : `${base}?view=${message.id}`, active: true, windowId: current.windowId, index: current.index + 1 });
            if (created.id === undefined) return { ok: false, reason: 'tab-not-created' };
            await hooks.remember(created.id); await hooks.apply();
          }
        } else if (message.type === 'views/rename') {
          const title = normalizeDisplayName(message.title, 80);
          if (!title) return { ok: false, reason: 'invalid-view-name' };
          items.find(item => item.id === message.id)!.title = title;
          await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views: items } });
        } else {
          const targets = tabs.filter(tab => tabView(tab) === message.id);
          const targetIds = targets.flatMap(tab => tab.id === undefined ? [] : [tab.id]).sort((a, b) => a - b);
          if (!Array.isArray(message.expectedTabIds) || message.expectedTabIds.some((id: unknown) => !Number.isInteger(id)) || JSON.stringify([...message.expectedTabIds].sort((a, b) => a - b)) !== JSON.stringify(targetIds)) return { ok: false, reason: 'view-changed' };
          if (deleted.size >= 10000) return { ok: false, reason: 'view-limit' };
          // Keep a live view when the one currently being operated is deleted.
          if (targetIds.includes(current.id!)) {
            const other = items.find(item => item.id !== message.id);
            const existing = other && tabs.find(tab => tabView(tab) === other.id);
            if (existing?.id !== undefined) { await chrome.tabs.update(existing.id, { active: true }); await chrome.windows.update(existing.windowId, { focused: true }); }
            else {
              const id = other?.id ?? crypto.randomUUID();
              const created = await chrome.tabs.create({ url: id === 'main' ? base : `${base}?view=${id}`, active: true, windowId: current.windowId, index: current.index + 1 });
              if (created.id === undefined) return { ok: false, reason: 'tab-not-created' };
              await hooks.remember(created.id); await hooks.apply();
            }
          }
          deleted.add(message.id);
          const remaining = items.filter(item => item.id !== message.id);
          await chrome.storage.local.set({ viewTombstones: { schemaVersion: 1, ids: [...deleted] }, viewRegistry: { schemaVersion: 1, views: remaining } });
          await Promise.all(targetIds.map(id => Promise.race([
            chrome.tabs.sendMessage(id, { type: 'view/deleted', viewId: message.id }, { frameId: 0 }).catch(() => undefined),
            new Promise(resolve => setTimeout(resolve, 2000)),
          ])));
          for (const id of targetIds) {
            try {
              const tab = await chrome.tabs.get(id);
              // The user can navigate a target while the confirmation and save handoff run.
              // Never close the tab unless it still points to this exact extension view.
              if (hooks.isSplitUrl(tab.url) && (!tab.pendingUrl || hooks.isSplitUrl(tab.pendingUrl)) && viewIdFromUrl(tab.url!) === message.id) await chrome.tabs.remove(id);
            } catch { /* The user already closed it. */ }
          }
          await chrome.storage.local.remove(viewWorkspaceKey(message.id));
          return { ok: true, views: summaries(remaining, tabs.filter(tab => !targetIds.includes(tab.id!))) };
        }
      }
      return { ok: true, views: summaries(items, tabs) };
    }).then(respond).catch(() => respond({ ok: false, reason: 'views-unavailable' }));
    return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    void hooks.serial(async () => {
      const closing = ((await chrome.storage.session.get('closingViews')).closingViews ?? {}) as Record<string, { id?: unknown; empty?: unknown }>;
      const entry = closing[tabId] as { id?: unknown; empty?: unknown } | undefined;
      if (!entry) return;
      delete closing[tabId]; await chrome.storage.session.set({ closingViews: closing });
      if (entry.empty !== true || !validViewId(entry.id)) return;
      const id = entry.id;
      const open = (await chrome.tabs.query({})).some(tab => (hooks.isSplitUrl(tab.url) && viewIdFromUrl(tab.url!) === id) || (hooks.isSplitUrl(tab.pendingUrl) && viewIdFromUrl(tab.pendingUrl!) === id));
      if (open) return;
      const key = viewWorkspaceKey(id);
      const stored = await chrome.storage.local.get([key, 'viewRegistry', 'viewTombstones']);
      const raw = stored[key] as { panes?: Array<{ url?: unknown }> } | undefined;
      if (!raw || !Array.isArray(raw.panes) || raw.panes.length !== 12 || raw.panes.some((pane: { url?: unknown }) => pane.url !== '')) return;
      const deleted = parseViewTombstones(stored.viewTombstones);
      if (deleted.size >= 10000) return;
      deleted.add(id);
      const views = parseViewRegistry(stored.viewRegistry).filter(view => view.id !== id);
      await chrome.storage.local.set({ viewRegistry: { schemaVersion: 1, views }, viewTombstones: { schemaVersion: 1, ids: [...deleted] } });
      await chrome.storage.local.remove(key);
    }).catch(() => undefined);
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (!change.url || hooks.isSplitUrl(change.url)) return;
    void hooks.serial(async () => {
      const closing = ((await chrome.storage.session.get('closingViews')).closingViews ?? {}) as Record<string, unknown>;
      if (closing[tabId]) { delete closing[tabId]; await chrome.storage.session.set({ closingViews: closing }); }
    }).catch(() => undefined);
  });
  // A late page write must never recreate the data of a deleted view.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const keys = Object.entries(changes).filter(([key, change]) => change.newValue !== undefined && (key === 'workspace' || key.startsWith('workspace:'))).map(([key]) => key);
    if (!keys.length) return;
    void hooks.serial(async () => {
      const deleted = parseViewTombstones((await chrome.storage.local.get('viewTombstones')).viewTombstones);
      const stale = keys.filter(key => deleted.has(key === 'workspace' ? 'main' : key.slice(10)));
      if (stale.length) await chrome.storage.local.remove(stale);
    });
  });
}
