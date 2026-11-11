import { workspaceOrder, type Workspace } from '../core/workspace';

export function createPaneList(callbacks: { current(): Workspace; close(slot: number): void; clear(slot: number): void; maximize(slot: number): void; reorder(from: number, to: number): void }) {
  const dialog = document.createElement('dialog'); dialog.className = 'dialog pane-list-dialog'; dialog.setAttribute('aria-label', 'タブ一覧'); document.body.append(dialog);
  let workspace: Workspace, editable = false, heading = '', dragSlot: number | undefined;
  function render(): void {
    dialog.replaceChildren();
    const top = document.createElement('div'); top.className = 'dialog-top';
    const title = document.createElement('h2'); title.textContent = heading;
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '一覧を閉じる'); close.addEventListener('click', () => dialog.close());
    top.append(title, close); dialog.append(top);
    if (!editable) { const note = document.createElement('p'); note.textContent = 'このビューの枠を操作するには、そのビューを開いてください。'; dialog.append(note); }
    const list = document.createElement('div'); list.className = 'pane-list'; list.setAttribute('role', 'list');
    workspaceOrder(workspace).slice(0, workspace.count).forEach((slot, index) => {
      const url = workspace.panes[slot]!.url;
      const row = document.createElement('div'); row.className = 'pane-list-row'; row.setAttribute('role', 'listitem');
      const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'pane-list-handle'; handle.textContent = '☰'; handle.setAttribute('aria-label', `タブ ${index + 1} を移動`); handle.draggable = editable; handle.disabled = !editable;
      handle.addEventListener('dragstart', event => { if (!editable || !event.dataTransfer) { event.preventDefault(); return; } dragSlot = slot; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-split12-pane', 'pane'); row.classList.add('drag-source'); });
      handle.addEventListener('dragend', () => { dragSlot = undefined; row.classList.remove('drag-source'); });
      row.addEventListener('dragover', event => { if (editable && dragSlot !== undefined && dragSlot !== slot) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; } });
      row.addEventListener('drop', event => { if (editable && dragSlot !== undefined && dragSlot !== slot) { event.preventDefault(); const from = dragSlot; dragSlot = undefined; callbacks.reorder(from, slot); workspace = callbacks.current(); render(); } });
      const number = document.createElement('span'); number.className = 'pane-list-number'; number.textContent = String(index + 1);
      const icon = document.createElement('img'); icon.alt = ''; icon.className = 'pane-list-icon';
      if (/^https?:\/\//i.test(url)) { const image = new URL(chrome.runtime.getURL('/_favicon/')); image.searchParams.set('pageUrl', url); image.searchParams.set('size', '32'); icon.src = image.toString(); } else icon.hidden = true;
      const info = document.createElement('button'); info.type = 'button'; info.className = 'pane-list-info';
      let label = workspace.panes[slot]!.title || '空のタブ';
      if (url && !workspace.panes[slot]!.title) { try { label = new URL(url).hostname; } catch { label = url; } }
      const strong = document.createElement('strong'); strong.textContent = label;
      const small = document.createElement('small'); small.textContent = url || 'ページは開いていません';
      info.append(strong, small); info.title = editable ? 'ダブルクリックで最大化' : '表示中のビューを開くと最大化できます';
      if (editable) info.addEventListener('dblclick', () => { dialog.close(); callbacks.maximize(slot); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'pane-list-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `タブ ${index + 1} を閉じる`); remove.disabled = !editable;
      remove.addEventListener('click', () => { callbacks.close(slot); workspace = callbacks.current(); render(); });
      const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'pane-list-clear'; clear.setAttribute('aria-label', `タブ ${index + 1} を空にする`); clear.title = 'ページを閉じて空の枠にする'; clear.disabled = !editable || !url;
      clear.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
      clear.addEventListener('click', () => { callbacks.clear(slot); workspace = callbacks.current(); render(); });
      row.append(handle, number, icon, info, remove, clear); list.append(row);
    });
    dialog.append(list);
  }
  return { open(value: Workspace, name: string, current: boolean) { workspace = value; editable = current; heading = `${name}のタブ一覧`; render(); if (!dialog.open) dialog.showModal(); } };
}
