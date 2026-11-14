import { normalizeHost } from '../core/host';
import { buildSessionRules } from '../core/rules';
import { isOpenableUrl } from '../core/url';
import { setupXCsrf } from './x-csrf';
import { setupViews } from './views';
import { parseViewTombstones } from '../core/views';
import { setupTemplates } from './templates';
import { rootPaneFrame, setupAppActions } from './appActions';
import { isAppAction } from '../core/appActions';
import type { SplitRequest, SplitResponse } from '../shared/messages';

const splitBase = chrome.runtime.getURL('split.html');
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.catch(() => undefined);
  return result;
}
function isSplitUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const expected = new URL(splitBase);
    return url.protocol === expected.protocol && url.host === expected.host && url.pathname === expected.pathname;
  } catch { return false; }
}
async function savedTabId(): Promise<number | undefined> {
  const { splitTabId } = await chrome.storage.session.get('splitTabId');
  return typeof splitTabId === 'number' ? splitTabId : undefined;
}
async function savedTabIds(): Promise<number[]> {
  const { splitTabIds, splitTabId } = await chrome.storage.session.get(['splitTabIds', 'splitTabId']);
  const ids = Array.isArray(splitTabIds) ? splitTabIds.filter((id): id is number => typeof id === 'number') : [];
  if (typeof splitTabId === 'number') ids.push(splitTabId);
  return [...new Set(ids)];
}
async function rememberTab(id: number): Promise<void> {
  const ids = await savedTabIds();
  if (!ids.includes(id)) ids.push(id);
  const current = await savedTabId();
  await chrome.storage.session.set({ splitTabIds: ids, splitTabId: current ?? id });
}
async function liveSplitTab(): Promise<chrome.tabs.Tab | undefined> {
  const id = await savedTabId();
  if (id === undefined) return undefined;
  try {
    const tab = await chrome.tabs.get(id);
    return isSplitUrl(tab.url) || isSplitUrl(tab.pendingUrl) ? tab : undefined;
  } catch { return undefined; }
}
async function readHosts(): Promise<string[]> {
  const { allowlist: stored } = await chrome.storage.local.get('allowlist');
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
  const allowlist = stored as { schemaVersion?: unknown; hosts?: unknown };
  if (allowlist.schemaVersion !== 1 || !Array.isArray(allowlist.hosts)) return [];
  return [...new Set<string>((allowlist.hosts as unknown[])
    .filter((host): host is string => typeof host === 'string')
    .map(normalizeHost).filter((host): host is string => host !== null))].sort();
}
async function applyRules(hosts: string[]): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map(rule => rule.id),
    addRules: buildSessionRules({ tabIds: await savedTabIds(), hosts }),
  });
}
async function clearSplitTab(tabId: number): Promise<void> {
  const ids = (await savedTabIds()).filter(id => id !== tabId);
  await chrome.storage.session.set({ splitTabIds: ids });
  if (await savedTabId() === tabId) {
    if (ids.length) await chrome.storage.session.set({ splitTabId: ids[0] });
    else await chrome.storage.session.remove('splitTabId');
  }
  await applyRules(await readHosts());
}
async function focusTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id !== undefined) await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
}
async function openOrFocusSplitViewImpl(): Promise<number> {
  const existing = await liveSplitTab();
  if (existing?.id !== undefined) {
    await focusTab(existing);
    return existing.id;
  }
  const deleted = parseViewTombstones((await chrome.storage.local.get('viewTombstones')).viewTombstones);
  const tab = await chrome.tabs.create({ url: deleted.has('main') ? `${splitBase}?view=${crypto.randomUUID()}` : splitBase });
  if (tab.id === undefined) throw new Error('分割ビューを開けませんでした');
  await rememberTab(tab.id);
  await applyRules(await readHosts());
  return tab.id;
}
export const openOrFocusSplitView = (): Promise<number> => serial(openOrFocusSplitViewImpl);

// One Split12 per window (R-93): the action shows this window's Split12, or opens a new view next to the pressed tab.
export const openNewViewFromAction = (source: chrome.tabs.Tab): Promise<number> => serial(async () => {
  if (source.windowId === undefined || source.index === undefined) throw new Error('操作元のタブを確認できません');
  const inWindow = (await chrome.tabs.query({ windowId: source.windowId })).filter(tab => tab.id !== undefined && (isSplitUrl(tab.url) || isSplitUrl(tab.pendingUrl)));
  const existing = inWindow.find(tab => tab.id === source.id) ?? inWindow.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (existing?.id !== undefined) { await focusTab(existing); return existing.id; }
  // 2026-11-12 user decision B: open it in this window, so pressing again shows it instead of adding more.
  const tab = await chrome.tabs.create({ url: `${splitBase}?view=${crypto.randomUUID()}`, windowId: source.windowId, index: source.index + 1, active: true });
  if (tab.id === undefined) throw new Error('分割ビューを開けませんでした');
  await rememberTab(tab.id);
  await applyRules(await readHosts());
  return tab.id;
});

async function waitForTabReady(tabId: number): Promise<void> {
  if ((await chrome.tabs.get(tabId)).status === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed); };
    const updated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') { cleanup(); resolve(); }
    };
    const removed = (id: number) => { if (id === tabId) { cleanup(); reject(new Error('分割タブが閉じられました')); } };
    chrome.tabs.onUpdated.addListener(updated); chrome.tabs.onRemoved.addListener(removed);
    void chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') { cleanup(); resolve(); } }).catch(error => { cleanup(); reject(error); });
  });
}
async function addContextUrl(url: string, preferredTabId?: number, confirmLoad = false, axis?: 'x' | 'y', frameId?: number, before = false, link = false): Promise<boolean> {
  if (!isOpenableUrl(url)) return false;
  const target = await serial(async () => {
    let existing: chrome.tabs.Tab | undefined;
    if (preferredTabId !== undefined && (await savedTabIds()).includes(preferredTabId)) {
      try { const tab = await chrome.tabs.get(preferredTabId); if (isSplitUrl(tab.url) || isSplitUrl(tab.pendingUrl)) existing = tab; } catch { /* closed */ }
    }
    existing ??= await liveSplitTab();
    if (existing?.id !== undefined) {
      await focusTab(existing);
      return { tabId: existing.id, created: false };
    }
    const deleted = parseViewTombstones((await chrome.storage.local.get('viewTombstones')).viewTombstones);
    const tab = await chrome.tabs.create({ url: `${splitBase}?add=${encodeURIComponent(url)}${axis ? `&axis=${axis}${before ? '&before=1' : ''}` : ''}${link ? '&link=1' : ''}${deleted.has('main') ? `&view=${crypto.randomUUID()}` : ''}` });
    if (tab.id === undefined) throw new Error('分割ビューを開けませんでした');
    await rememberTab(tab.id);
    await applyRules(await readHosts());
    return { tabId: tab.id, created: true };
  });
  if (target.created) return true;
  await waitForTabReady(target.tabId);
  const response = await chrome.runtime.sendMessage({ type: 'pane/add-url', url, tabId: target.tabId, confirmLoad, axis, before, frameId, link });
  return Boolean(response?.ok);
}

async function handleRequest(message: SplitRequest, sender: chrome.runtime.MessageSender): Promise<SplitResponse> {
  if (sender.id !== chrome.runtime.id || !isSplitUrl(sender.url) || sender.tab?.id === undefined) {
    return { ok: false, reason: 'unauthorized' };
  }
  const tabId = sender.tab.id;
  if (message.type === 'split/register') {
    await rememberTab(tabId);
    const hosts = await readHosts();
    await applyRules(hosts);
    return { ok: true, tabId, hosts };
  }
  if (message.type === 'split/create') {
    const created = await chrome.tabs.create({ url: `${splitBase}?view=${crypto.randomUUID()}`, windowId: sender.tab.windowId, index: sender.tab.index + 1, active: true });
    if (created.id === undefined) throw new Error('分割ビューを開けませんでした');
    await rememberTab(created.id);
    await applyRules(await readHosts());
    return { ok: true, tabId: created.id };
  }
  if (message.type === 'allowlist/add' || message.type === 'allowlist/remove') {
    const current = new Set(await readHosts());
    for (const value of message.hosts) {
      const host = typeof value === 'string' ? normalizeHost(value) : null;
      if (!host) continue;
      if (message.type === 'allowlist/add') current.add(host);
      else current.delete(host);
    }
    const hosts = [...current].sort();
    await chrome.storage.local.set({ allowlist: { schemaVersion: 1, hosts } });
    await applyRules(hosts);
    return { ok: true, hosts };
  }
  if (message.type === 'service-worker/clear') {
    // A site's own service worker answers pane navigations itself, so the tab-scoped rules never see the response.
    if (!isOpenableUrl(message.url)) return { ok: false, reason: 'invalid-url' };
    const host = normalizeHost(message.url);
    if (!host || !(await readHosts()).some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return { ok: false, reason: 'not-allowed' };
    await chrome.browsingData.remove({ origins: [new URL(message.url).origin] }, { serviceWorkers: true });
    return { ok: true };
  }
  return { ok: false, reason: 'unknown-message' };
}
chrome.runtime.onMessage.addListener((message: SplitRequest, sender, sendResponse) => {
  if (!message || !['split/register', 'split/create', 'allowlist/add', 'allowlist/remove', 'service-worker/clear'].includes(message.type)) return;
  void serial(() => handleRequest(message, sender))
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({ ok: false, reason: error instanceof Error ? error.message : '操作に失敗しました' }));
  return true;
});
chrome.runtime.onMessage.addListener((message: { type?: string; active?: unknown; startedHere?: unknown; at?: unknown }, sender) => {
  if (message?.type !== 'drag/state' || typeof message.active !== 'boolean' || typeof message.at !== 'number' || !Number.isFinite(message.at) || sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.frameId) return;
  const id = sender.tab.id;
  void savedTabIds().then(ids => {
    if (ids.includes(id)) return chrome.runtime.sendMessage({ type: 'pane/drag-state', tabId: id, active: message.active, startedHere: message.startedHere === true, at: message.at });
  }).catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message: { type?: string; delta?: unknown }, sender, sendResponse) => {
  if (!['shortcut/config', 'shortcut/pressed'].includes(message?.type ?? '') || sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !sender.frameId) return;
  const id = sender.tab.id;
  void (async () => {
    if (!(await savedTabIds()).includes(id)) return undefined;
    if (message.type === 'shortcut/config') {
      const commands = await chrome.commands.getAll();
      return { up: commands.find(command => command.name === 'pane-increase')?.shortcut ?? '', down: commands.find(command => command.name === 'pane-decrease')?.shortcut ?? '', directions: Object.fromEntries(commands.filter(command => command.name?.startsWith('split-')).map(command => [command.name!, command.shortcut ?? ''])) };
    }
    if (message.delta === 1 || message.delta === -1) await chrome.runtime.sendMessage({ type: 'pane/change-count', tabId: id, delta: message.delta, source: 'page' });
    return undefined;
  })().then(sendResponse).catch(() => sendResponse(undefined));
  return true;
});
chrome.action.onClicked.addListener(tab => { void openNewViewFromAction(tab).catch(() => undefined); });
async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (tab?.id === undefined || (!isAppAction(command) && command !== 'pane-increase' && command !== 'pane-decrease')) return;
  if (!(await savedTabIds()).includes(tab.id)) return;
  const current = await chrome.tabs.get(tab.id);
  if (!isSplitUrl(current.url) || (current.pendingUrl && !isSplitUrl(current.pendingUrl))) return;
  const message = isAppAction(command) ? { type: 'app/action', tabId: tab.id, action: command }
    : { type: 'pane/change-count', tabId: tab.id, delta: command === 'pane-increase' ? 1 : -1 };
  await chrome.runtime.sendMessage(message).catch(() => undefined);
}
chrome.commands.onCommand.addListener((command, tab) => { void handleCommand(command, tab); });
chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({ id: 'split8-page', title: 'このページを分割ビューに追加', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'split8-link', title: 'リンクを分割ビューで開く', contexts: ['link'] });
    for (const [direction, title] of [['left', '左'], ['right', '右'], ['up', '上'], ['down', '下']] as const) {
      chrome.contextMenus.create({ id: `split8-link-${direction}`, parentId: 'split8-link', title: `${title}に分割して追加`, contexts: ['link'] });
    }
  });
});
async function handleContextMenu(info: Pick<chrome.contextMenus.OnClickData, 'menuItemId' | 'linkUrl' | 'pageUrl'> & { frameId?: number }, tab?: chrome.tabs.Tab): Promise<boolean> {
  // Legacy IDs can still arrive from an update or a previously queued click.
  const id = String(info.menuItemId);
  const link = ['split8-link', 'split8-link-x', 'split8-link-y', 'split8-link-left', 'split8-link-right', 'split8-link-up', 'split8-link-down'].includes(id);
  const url = link ? info.linkUrl : info.menuItemId === 'split8-page' ? info.pageUrl : undefined;
  const axis = ['split8-link-x', 'split8-link-left', 'split8-link-right'].includes(id) ? 'x' : ['split8-link-y', 'split8-link-up', 'split8-link-down'].includes(id) ? 'y' : undefined;
  const before = id === 'split8-link-left' || id === 'split8-link-up';
  const frameId = tab?.id !== undefined && info.frameId && (await savedTabIds()).includes(tab.id) ? await rootPaneFrame(tab.id, info.frameId) : undefined;
  return url ? addContextUrl(url, tab?.id, false, axis, frameId, before, link) : false;
}
chrome.contextMenus.onClicked.addListener((info, tab) => { void handleContextMenu(info, tab).catch(() => undefined); });
chrome.tabs.onRemoved.addListener((tabId) => {
  void serial(async () => { if ((await savedTabIds()).includes(tabId)) await clearSplitTab(tabId); });
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !isSplitUrl(changeInfo.url)) {
    void serial(async () => { if ((await savedTabIds()).includes(tabId)) await clearSplitTab(tabId); });
  }
});

// The E2E harness calls the same entry point as the action button.
Object.assign(globalThis, { __split8Test: { openOrFocusSplitView, openNewViewFromAction, handleContextMenu, handleCommand } });
setupXCsrf({ tabIds: savedTabIds, hosts: readHosts, isSplitUrl, serial });
setupViews({ tabIds: savedTabIds, isSplitUrl, remember: rememberTab, apply: async () => applyRules(await readHosts()), serial });
setupTemplates({ tabIds: savedTabIds, isSplitUrl, serial });
setupAppActions({ tabIds: savedTabIds, isSplitUrl });
