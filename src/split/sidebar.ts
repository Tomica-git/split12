import type { ViewSummary } from '../core/views';
import { text } from '../ui/strings';

export type SidebarCallbacks = {
  currentId: string;
  create(): void;
  focus(id: string): Promise<void>;
  rename(view: ViewSummary): void;
  remove(view: ViewSummary): void;
  removeMany(views: ViewSummary[]): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  showList(view: ViewSummary): void;
  closeSidebar(): void;
};

export function createSidebar(callbacks: SidebarCallbacks) {
  const { currentId } = callbacks;
  const element = document.createElement('aside'); element.className = 'view-sidebar'; element.hidden = true;
  element.setAttribute('aria-label', text.sessions);
  element.innerHTML = `<div class="sidebar-heading"><strong>${text.sessions}</strong><button type="button" class="sidebar-close" aria-label="セッション一覧を閉じる">×</button></div>
<div class="sidebar-target" aria-live="polite"></div>
<div class="sidebar-actions"><button type="button" class="view-open">開く</button><button type="button" class="view-delete">削除</button><button type="button" class="view-create" aria-label="${text.newView}">追加</button><button type="button" class="view-edit" aria-pressed="false" aria-label="一覧を編集">編集</button></div>
<div class="sidebar-edit-actions" hidden><span class="sidebar-edit-count" aria-live="polite">0件選択</span><button type="button" class="view-delete-selected" disabled>選択を削除</button></div>
<nav class="view-list" aria-label="${text.viewList}"></nav>
<p class="sidebar-hint">クリックで選択、ダブルクリックで開きます。名前の変更は右クリックかF2、並べ替えと複数削除は「編集」から。</p>`;
  element.querySelector('.view-create')!.addEventListener('click', callbacks.create);
  element.querySelector('.sidebar-close')!.addEventListener('click', callbacks.closeSidebar);
  const list = element.querySelector<HTMLElement>('.view-list')!;
  const openButton = element.querySelector<HTMLButtonElement>('.view-open')!, deleteButton = element.querySelector<HTMLButtonElement>('.view-delete')!;
  const editButton = element.querySelector<HTMLButtonElement>('.view-edit')!, editActions = element.querySelector<HTMLElement>('.sidebar-edit-actions')!;
  const editCount = element.querySelector<HTMLElement>('.sidebar-edit-count')!, deleteSelected = element.querySelector<HTMLButtonElement>('.view-delete-selected')!;
  let rows: ViewSummary[] = [];
  let focusedId = currentId;
  let editing = false;
  const selectedIds = new Set<string>();
  let dragId: string | undefined;
  const menu = document.createElement('div'); menu.className = 'pane-context-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'ビューの操作'); document.body.append(menu);
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) menu.hidden = true; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.hidden = true; });
  function openMenu(view: ViewSummary, x: number, y: number): void {
    menu.replaceChildren();
    for (const [name, action] of [['一覧', callbacks.showList], ['名前変更', callbacks.rename], ['削除', callbacks.remove]] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = name;
      button.addEventListener('click', () => { menu.hidden = true; action(view); }); menu.append(button);
    }
    menu.hidden = false; const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, innerWidth - rect.width))}px`; menu.style.top = `${Math.max(0, Math.min(y, innerHeight - rect.height))}px`;
    menu.querySelector<HTMLButtonElement>('button')!.focus();
  }
  function updateActions(): void {
    const view = rows.find(item => item.id === focusedId);
    element.querySelector('.sidebar-target')!.textContent = view ? `操作対象: ${view.title}` : '操作対象なし';
    openButton.disabled = !view || view.id === currentId; deleteButton.disabled = !view;
    openButton.setAttribute('aria-label', view ? `${view.title} を開く` : '開く');
    deleteButton.setAttribute('aria-label', view ? `${view.title} を削除` : '削除');
    for (const button of list.querySelectorAll<HTMLButtonElement>('.view-choice')) { button.dataset.selected = String(button.dataset.view === focusedId); button.tabIndex = button.dataset.view === focusedId ? 0 : -1; }
  }
  function updateEditCount(): void { editCount.textContent = `${selectedIds.size}件選択`; deleteSelected.disabled = !selectedIds.size; }
  function setEditing(value: boolean): void {
    editing = value;
    editButton.setAttribute('aria-pressed', String(value)); editButton.textContent = value ? '完了' : '編集';
    editActions.hidden = !value; element.classList.toggle('editing', value);
    if (!value) selectedIds.clear();
    updateEditCount(); render(rows);
  }
  editButton.addEventListener('click', () => setEditing(!editing));
  deleteSelected.addEventListener('click', () => {
    const views = rows.filter(view => selectedIds.has(view.id));
    if (views.length) void callbacks.removeMany(views).then(() => { selectedIds.clear(); updateEditCount(); });
  });
  openButton.addEventListener('click', () => { const view = rows.find(item => item.id === focusedId); if (view && view.id !== currentId) void callbacks.focus(view.id); });
  deleteButton.addEventListener('click', () => { const view = rows.find(item => item.id === focusedId); if (view) callbacks.remove(view); });
  function reorderTo(id: string, position: number): void {
    const ids = rows.map(view => view.id).filter(item => item !== id);
    ids.splice(Math.max(0, Math.min(ids.length, position)), 0, id);
    if (ids.join('\n') !== rows.map(view => view.id).join('\n')) void callbacks.reorder(ids);
  }
  function render(views: ViewSummary[]): void {
    const hadFocus = list.contains(document.activeElement);
    rows = views;
    for (const id of [...selectedIds]) if (!rows.some(view => view.id === id)) selectedIds.delete(id);
    updateEditCount();
    if (!rows.some(view => view.id === focusedId)) focusedId = rows.find(view => view.id === currentId)?.id ?? rows[0]?.id ?? '';
    list.replaceChildren(...rows.map((view, index) => {
      const row = document.createElement('div'); row.className = 'view-row'; row.dataset.view = view.id;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'view-choice'; button.dataset.view = view.id;
      button.textContent = view.title + (view.tabId === undefined ? ` · ${text.savedView}` : '');
      button.setAttribute('aria-current', view.id === currentId ? 'page' : 'false'); button.tabIndex = view.id === focusedId ? 0 : -1;
      button.addEventListener('focus', () => { focusedId = view.id; updateActions(); });
      button.addEventListener('click', () => { focusedId = view.id; updateActions(); });
      // Double-click opens the view; renaming stays on F2 and the context menu (R-81).
      button.addEventListener('dblclick', () => { if (!editing && view.id !== currentId) void callbacks.focus(view.id); });
      button.addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); callbacks.rename(view); } });
      button.addEventListener('contextmenu', event => { event.preventDefault(); button.focus(); openMenu(view, event.clientX, event.clientY); });
      if (!editing) { row.append(button); return row; }
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'view-select'; checkbox.checked = selectedIds.has(view.id);
      checkbox.setAttribute('aria-label', `${view.title} を選択`);
      checkbox.addEventListener('change', () => { if (checkbox.checked) selectedIds.add(view.id); else selectedIds.delete(view.id); updateEditCount(); });
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'view-handle'; handle.textContent = '☰'; handle.draggable = true;
      handle.setAttribute('aria-label', `${view.title} を移動`); handle.title = 'ドラッグして並べ替え';
      handle.addEventListener('dragstart', event => { if (!event.dataTransfer) { event.preventDefault(); return; } dragId = view.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-split12-view', 'view'); row.classList.add('drag-source'); });
      handle.addEventListener('dragend', () => { dragId = undefined; row.classList.remove('drag-source'); });
      row.addEventListener('dragover', event => { if (dragId !== undefined && dragId !== view.id) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; row.classList.add('drop-before'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
      row.addEventListener('drop', event => {
        row.classList.remove('drop-before');
        if (dragId === undefined || dragId === view.id) return;
        event.preventDefault();
        const from = dragId; dragId = undefined;
        const position = rows.findIndex(item => item.id === view.id) - (rows.findIndex(item => item.id === from) < index ? 1 : 0);
        reorderTo(from, position);
      });
      const up = document.createElement('button'); up.type = 'button'; up.className = 'view-move view-move-up'; up.textContent = '▲'; up.setAttribute('aria-label', `${view.title} を上へ`); up.disabled = index === 0;
      up.addEventListener('click', () => reorderTo(view.id, index - 1));
      const down = document.createElement('button'); down.type = 'button'; down.className = 'view-move view-move-down'; down.textContent = '▼'; down.setAttribute('aria-label', `${view.title} を下へ`); down.disabled = index === rows.length - 1;
      down.addEventListener('click', () => reorderTo(view.id, index + 1));
      row.append(checkbox, handle, button, up, down);
      return row;
    }));
    updateActions();
    if (hadFocus) list.querySelector<HTMLButtonElement>(`[data-view="${focusedId}"]`)?.focus();
  }
  function move(delta: number): void {
    if (element.hidden || !rows.length) return;
    const index = Math.max(0, rows.findIndex(view => view.id === focusedId));
    focusedId = rows[Math.max(0, Math.min(rows.length - 1, index + delta))]!.id;
    for (const button of list.querySelectorAll<HTMLButtonElement>('.view-choice')) button.tabIndex = button.dataset.view === focusedId ? 0 : -1;
    list.querySelector<HTMLButtonElement>(`.view-choice[data-view="${focusedId}"]`)?.focus();
  }
  list.addEventListener('keydown', event => { if (!event.metaKey && !event.ctrlKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && (event.target as Element).classList.contains('view-choice')) { event.preventDefault(); event.stopPropagation(); move(event.key === 'ArrowUp' ? -1 : 1); } });
  return { element, render, move, setCreating(value: boolean) { element.querySelector<HTMLButtonElement>('.view-create')!.disabled = value; } };
}
