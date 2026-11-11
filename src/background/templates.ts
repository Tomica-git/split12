import { normalizeDisplayName } from '../core/names';
import { MAX_TEMPLATES, parseTemplateShape, parseTemplates } from '../core/templates';

type Hooks = { tabIds(): Promise<number[]>; isSplitUrl(value: string | undefined): boolean; serial<T>(work: () => Promise<T>): Promise<T> };
export function setupTemplates(hooks: Hooks): void {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['templates/list', 'templates/create', 'templates/update', 'templates/rename', 'templates/delete'].includes(message?.type)) return;
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined || !hooks.isSplitUrl(sender.url)) { respond({ ok: false, reason: 'unauthorized' }); return; }
    void hooks.serial(async () => {
      const tab = await chrome.tabs.get(sender.tab!.id!);
      if (!(await hooks.tabIds()).includes(tab.id!) || !hooks.isSplitUrl(tab.url) || (tab.pendingUrl && !hooks.isSplitUrl(tab.pendingUrl))) return { ok: false, reason: 'unauthorized' };
      const templates = parseTemplates((await chrome.storage.local.get('layoutTemplates')).layoutTemplates);
      if (message.type === 'templates/list') return { ok: true, templates };
      if (message.type === 'templates/create') {
        const shape = parseTemplateShape(message.shape), name = normalizeDisplayName(message.name, 40);
        if (!shape || !name) return { ok: false, reason: 'invalid-template' };
        if (templates.length >= MAX_TEMPLATES) return { ok: false, reason: 'template-full' };
        let unique = name, suffix = 2;
        while (templates.some(item => item.name === unique)) { const tail = `（${suffix++}）`; unique = `${Array.from(name).slice(0, 40 - Array.from(tail).length).join('')}${tail}`; }
        const now = Date.now(); templates.push({ id: crypto.randomUUID(), name: unique, createdAt: now, updatedAt: now, ...shape });
      } else {
        const index = templates.findIndex(item => item.id === message.id);
        if (index < 0) return { ok: false, reason: 'unknown-template' };
        if (message.type === 'templates/delete') templates.splice(index, 1);
        else if (message.type === 'templates/rename') {
          const name = normalizeDisplayName(message.name, 40);
          if (!name) return { ok: false, reason: 'invalid-template' };
          if (templates.some((item, i) => i !== index && item.name === name)) return { ok: false, reason: 'duplicate-template-name' };
          templates[index] = { ...templates[index]!, name, updatedAt: Date.now() };
        }
        else {
          const shape = parseTemplateShape(message.shape);
          if (!shape) return { ok: false, reason: 'invalid-template' };
          templates[index] = { ...templates[index]!, ...shape, updatedAt: Date.now() };
        }
      }
      await chrome.storage.local.set({ layoutTemplates: { schemaVersion: 1, templates } });
      return { ok: true, templates };
    }).then(respond).catch(() => respond({ ok: false, reason: 'templates-unavailable' }));
    return true;
  });
}
