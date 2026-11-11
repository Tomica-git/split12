type Hooks = { tabIds(): Promise<number[]>; hosts(): Promise<string[]>; isSplitUrl(value: string | undefined): boolean; serial<T>(work: () => Promise<T>): Promise<T> };

// Serialized by the same owner as the allowlist so revocation cannot be overtaken by an old delivery.
export function setupXCsrf(hooks: Hooks): void {
  async function owner(tabId: number, frameId: number, documentId?: string) {
    if (!frameId || !(await hooks.tabIds()).includes(tabId)) return undefined;
    const tab = await chrome.tabs.get(tabId);
    if (!hooks.isSplitUrl(tab.url) || (tab.pendingUrl && !hooks.isSplitUrl(tab.pendingUrl))) return undefined;
    const frame = await chrome.webNavigation.getFrame({ tabId, frameId });
    if (!frame || frame.parentFrameId !== 0 || !frame.documentId || (documentId && frame.documentId !== documentId) || new URL(frame.url).origin !== 'https://x.com') return undefined;
    return { tab, frame };
  }
  async function sync(tabId: number, frameId: number, documentId?: string): Promise<boolean> {
    const current = await owner(tabId, frameId, documentId);
    if (!current) return false;
    const allowed = (await hooks.hosts()).includes('x.com') && await chrome.permissions.contains({ origins: ['https://x.com/*'] });
    let value: string | null = null;
    if (allowed) {
      const stores = await chrome.cookies.getAllCookieStores();
      const storeId = stores.find(store => store.tabIds.includes(tabId))?.id;
      // Never fall back to another profile's default Cookie store.
      const cookie = storeId ? await chrome.cookies.get({ url: current.frame.url, name: 'ct0', storeId }) : null;
      if (cookie && !cookie.httpOnly && cookie.secure && ['x.com', '.x.com'].includes(cookie.domain)) value = cookie.value;
    }
    if (!await owner(tabId, frameId, current.frame.documentId)) return false;
    if (value === null) {
      await chrome.tabs.sendMessage(tabId, { type: 'x-csrf/disable' }, { documentId: current.frame.documentId });
      return true;
    }
    const result = await chrome.scripting.executeScript({
      target: { tabId, documentIds: [current.frame.documentId] }, world: 'MAIN', injectImmediately: true,
      func: (token: string | null) => {
        if (location.origin !== 'https://x.com' || self === top || parent !== top || location.ancestorOrigins.length !== 1) return false;
        const target = globalThis as unknown as Record<symbol, ((value: string | null) => void) | undefined>;
        const update = target[Symbol.for('split8.x-csrf')];
        if (!update) return false;
        update(token); return true;
      }, args: [value],
    });
    return Boolean(result[0]?.result);
  }
  async function refresh(): Promise<void> {
    for (const tabId of await hooks.tabIds()) {
      const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null);
      for (const frame of frames ?? []) if (frame.parentFrameId === 0 && frame.url.startsWith('https://x.com/')) await sync(tabId, frame.frameId, frame.documentId).catch(() => false);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'x-csrf/prepare') return;
    if (sender.id !== chrome.runtime.id || sender.origin !== 'https://x.com' || sender.tab?.id === undefined || !sender.frameId || !sender.documentId) { respond({ ok: false }); return; }
    void hooks.serial(() => sync(sender.tab!.id!, sender.frameId!, sender.documentId)).then(ok => respond({ ok })).catch(() => respond({ ok: false }));
    return true;
  });
  chrome.cookies.onChanged.addListener(({ cookie }) => {
    if (cookie.name === 'ct0' && ['x.com', '.x.com'].includes(cookie.domain)) void hooks.serial(refresh).catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.allowlist) void hooks.serial(refresh).catch(() => undefined);
  });
  chrome.permissions.onRemoved.addListener(() => { void hooks.serial(refresh).catch(() => undefined); });
}
