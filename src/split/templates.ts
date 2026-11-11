import { measureTree } from '../core/splitTree';
import { templateCandidates, type LayoutTemplate, type TemplateShape } from '../core/templates';
import type { SplitRequest, SplitResponse } from '../shared/messages';
import { text } from '../ui/strings';

export function createTemplates(options: {
  current(): TemplateShape;
  request(message: SplitRequest): Promise<SplitResponse>;
  apply(shape: TemplateShape): void;
}): { open(): void } {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog template-dialog'; dialog.setAttribute('aria-label', text.templatesTitle);
  dialog.innerHTML = `<div class="dialog-top"><h2>${text.templatesTitle}</h2><button type="button" class="dialog-close" aria-label="${text.done}">×</button></div>
    <p class="dialog-description">枠の数と配置を保存します。ページのURLや倍率は含まれません。</p>
    <div class="template-current"><div class="template-current-preview"></div><div><label>名前 <input class="template-name" aria-label="${text.templateName}" maxlength="40"></label>
      <div class="template-actions"><button type="button" class="template-current-save">現在の配置を保存</button><button type="button" class="template-new">${text.templateNew}</button><button type="button" class="template-save" disabled>${text.templateSave}</button></div><div class="template-confirm" hidden></div></div></div>
    <p class="template-status" role="status" aria-live="polite"></p><h3>ショートカット</h3><div class="template-shortcuts"></div><h3>保存済み</h3><div class="template-list" role="list"></div>
    <h3>配置の候補</h3><div class="template-actions"><label>枚数 <input type="number" class="candidate-count" aria-label="候補の枚数" min="1" max="12"></label>
      <button type="button" class="candidate-create">${text.templateCandidates}</button></div><div class="candidate-list" role="list"></div>`;
  document.body.append(dialog);
  const name = dialog.querySelector<HTMLInputElement>('.template-name')!;
  const status = dialog.querySelector<HTMLElement>('.template-status')!;
  const list = dialog.querySelector<HTMLElement>('.template-list')!;
  const candidates = dialog.querySelector<HTMLElement>('.candidate-list')!;
  const candidateCount = dialog.querySelector<HTMLInputElement>('.candidate-count')!;
  const save = dialog.querySelector<HTMLButtonElement>('.template-save')!;
  let templates: LayoutTemplate[] = [];
  let shortcutIds: string[] = ['', '', ''];
  let shortcutWrites: Promise<void> = Promise.resolve();
  let selectedId: string | undefined;
  let returnFocus: HTMLElement | null = null;
  function preview(shape: TemplateShape): HTMLElement {
    const element = document.createElement('div'); element.className = 'template-preview'; element.setAttribute('aria-hidden', 'true');
    for (const [slot, box] of measureTree(shape.tree).panes) {
      const cell = document.createElement('span'); cell.textContent = String(slot + 1);
      Object.assign(cell.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });
      element.append(cell);
    }
    return element;
  }
  function button(label: string, action: () => void, accessible?: string): HTMLButtonElement {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = label;
    if (accessible) item.setAttribute('aria-label', accessible);
    item.addEventListener('click', action); return item;
  }
  function showError(reason: string): void {
    status.textContent = reason === 'template-full' ? 'テンプレートは50件までです。' : reason === 'invalid-template' ? '名前と配置を確認してください。' : reason === 'duplicate-template-name' ? '同じ名前のテンプレートがあります。' : 'テンプレートを保存できませんでした。';
  }
  async function load(): Promise<void> {
    const response = await options.request({ type: 'templates/list' }).catch(() => ({ ok: false as const, reason: 'unavailable' }));
    if (!response.ok) { showError(response.reason); return; }
    templates = response.templates ?? [];
    const stored = (await chrome.storage.local.get('templateShortcutIds')).templateShortcutIds;
    shortcutIds = Array.from({ length: 3 }, (_, i) => Array.isArray(stored) && typeof stored[i] === 'string' ? stored[i] : '');
    if (!templates.some(item => item.id === selectedId)) selectedId = undefined;
    render();
  }
  async function mutate(message: SplitRequest): Promise<boolean> {
    const response = await options.request(message).catch(() => ({ ok: false as const, reason: 'unavailable' }));
    if (!response.ok) { showError(response.reason); return false; }
    templates = response.templates ?? [];
    if (message.type === 'templates/create') selectedId = templates.at(-1)?.id;
    if (!templates.some(item => item.id === selectedId)) selectedId = undefined;
    status.textContent = '保存しました。'; render(); return true;
  }
  function apply(shape: TemplateShape): void { dialog.close(); options.apply(shape); }
  function confirmInline(container: HTMLElement, question: string, action: () => void): void {
    container.replaceChildren();
    const label = document.createElement('span'); label.textContent = question;
    container.hidden = false;
    container.append(label, button('実行する', action), button('キャンセル', () => { container.hidden = true; render(); }));
  }
  function render(): void {
    dialog.querySelector('.template-current-preview')!.replaceChildren(preview(options.current()));
    const shortcuts = dialog.querySelector<HTMLElement>('.template-shortcuts')!;
    shortcuts.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const label = document.createElement('label'); label.textContent = `ショートカット ${i + 1} `;
      const select = document.createElement('select'); select.setAttribute('aria-label', `テンプレートショートカット ${i + 1}`);
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = '未設定'; select.append(empty);
      for (const item of templates) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; select.append(option); }
      select.value = shortcutIds[i] ?? '';
      select.addEventListener('change', () => {
        shortcutIds[i] = select.value;
        const snapshot = [...shortcutIds];
        shortcutWrites = shortcutWrites.catch(() => undefined).then(() => chrome.storage.local.set({ templateShortcutIds: snapshot }));
      });
      label.append(select); shortcuts.append(label);
    }
    save.disabled = !selectedId;
    list.replaceChildren();
    if (!templates.length) { const empty = document.createElement('p'); empty.textContent = '保存済みのテンプレートはありません。'; list.append(empty); return; }
    for (const item of templates) {
      const row = document.createElement('div'); row.className = 'template-row'; row.setAttribute('role', 'listitem');
      const info = document.createElement('div'); info.className = 'template-row-info';
      const choose = button(item.name, () => {
        selectedId = item.id; name.value = item.name; status.textContent = `「${item.name}」を選択しました。`;
        list.querySelectorAll<HTMLButtonElement>('.template-name-button').forEach(element => element.setAttribute('aria-pressed', String(element === choose)));
        save.disabled = false;
      }, `${item.name}を選択`);
      choose.className = 'template-name-button';
      choose.title = 'ダブルクリックで名前を変更';
      choose.addEventListener('dblclick', () => {
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = 40; input.value = item.name;
        input.setAttribute('aria-label', 'テンプレート名を変更');
        let saving = false;
        choose.replaceWith(input); input.focus(); input.select();
        input.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); input.replaceWith(choose); choose.focus(); }
          else if (event.key === 'Enter' && !event.isComposing && !saving) {
            event.preventDefault(); saving = true; input.disabled = true;
            void mutate({ type: 'templates/rename', id: item.id, name: input.value }).then(ok => {
              if (ok) name.value = templates.find(template => template.id === item.id)?.name ?? name.value;
              else { saving = false; input.disabled = false; input.focus(); }
            });
          }
        });
        input.addEventListener('blur', () => { if (!saving && input.isConnected) input.replaceWith(choose); });
      });
      choose.setAttribute('aria-pressed', String(item.id === selectedId));
      const actions = document.createElement('div'); actions.className = 'template-actions';
      actions.append(button('適用', () => apply(item), `${item.name}を適用`), button('削除', () => confirmInline(actions, `「${item.name}」を削除しますか？`, () => { void mutate({ type: 'templates/delete', id: item.id }); }), `${item.name}を削除`));
      info.append(choose, actions); row.append(preview(item), info); list.append(row);
    }
  }
  dialog.querySelector('.dialog-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
  dialog.querySelector('.template-new')!.addEventListener('click', () => { void mutate({ type: 'templates/create', name: name.value, shape: options.current() }); });
  dialog.querySelector('.template-current-save')!.addEventListener('click', () => {
    void mutate({ type: 'templates/create', name: name.value.trim() || '現在の配置', shape: options.current() });
  });
  save.addEventListener('click', () => {
    const selected = templates.find(item => item.id === selectedId);
    if (!selected) return;
    const area = dialog.querySelector<HTMLElement>('.template-confirm')!;
    confirmInline(area, `「${selected.name}」に現在の配置を保存しますか？`, () => { void mutate({ type: 'templates/update', id: selected.id, shape: options.current() }).then(ok => { if (ok) area.hidden = true; }); });
  });
  dialog.querySelector('.candidate-create')!.addEventListener('click', () => {
    const count = Number(candidateCount.value), items = templateCandidates(count);
    candidates.replaceChildren();
    if (!items.length) { status.textContent = '候補の枚数は1〜12で指定してください。'; return; }
    status.textContent = '候補を作成しました。適用するまで現在の配置は変わりません。';
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'template-row'; row.setAttribute('role', 'listitem');
      const info = document.createElement('div'); info.className = 'template-row-info';
      const label = document.createElement('strong'); label.textContent = item.name;
      const actions = document.createElement('div'); actions.className = 'template-actions';
      actions.append(button('適用', () => apply(item), `${item.name}の候補を適用`), button('保存', () => { void mutate({ type: 'templates/create', name: name.value.trim() || item.name, shape: item }); }, `${item.name}の候補を保存`));
      info.append(label, actions); row.append(preview(item), info); candidates.append(row);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.layoutTemplates && dialog.open) void load(); });
  return { open() {
    if (dialog.open) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    status.textContent = ''; candidates.replaceChildren(); dialog.querySelector<HTMLElement>('.template-confirm')!.hidden = true; candidateCount.value = String(options.current().count);
    dialog.showModal(); render(); void load();
  } };
}
