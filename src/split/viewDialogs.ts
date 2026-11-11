import type { ViewSummary } from '../core/views';

export function createViewDialogs(): { rename(view: ViewSummary): Promise<string | null>; remove(view: ViewSummary): Promise<boolean>; removeMany(views: ViewSummary[]): Promise<boolean> } {
  const dialog = document.createElement('dialog'); dialog.className = 'dialog view-dialog'; document.body.append(dialog);
  function open(views: ViewSummary[], mode: 'rename' | 'remove' | 'remove-many'): Promise<string | null> {
    if (dialog.open) return Promise.resolve(null);
    const view = views[0]!;
    dialog.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = mode === 'rename' ? 'ビューの名前を変更' : mode === 'remove' ? 'ビューを削除' : 'ビューをまとめて削除';
    dialog.setAttribute('aria-label', title.textContent);
    const description = document.createElement('p'); description.className = 'dialog-description';
    const tabCount = views.reduce((sum, item) => sum + (item.tabIds?.length ?? 0), 0);
    description.textContent = mode === 'rename' ? '一覧と現在のビューに表示する名前を入力してください。'
      : mode === 'remove' ? `「${view.title}」を削除しますか？ このビューの保存内容を削除し、開いている場合は ${tabCount} 個のビューを閉じます。`
      : `選択した ${views.length} 件のビューを削除しますか？ 保存内容を削除し、開いている場合は合計 ${tabCount} 個のビューのタブを閉じます。通常のタブは閉じません。`;
    const input = document.createElement('input'); input.className = 'view-name'; input.setAttribute('aria-label', 'ビュー名'); input.maxLength = 80; input.value = view.title;
    const names = document.createElement('ul'); names.className = 'view-dialog-list';
    if (mode === 'remove-many') for (const item of views) { const li = document.createElement('li'); li.textContent = item.title; names.append(li); }
    const actions = document.createElement('div'); actions.className = 'view-dialog-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'キャンセル';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = mode === 'rename' ? 'primary-button' : 'danger-button'; confirm.textContent = mode === 'rename' ? '変更する' : '削除する';
    actions.append(cancel, confirm); dialog.append(title, description);
    if (mode === 'rename') dialog.append(input); else if (mode === 'remove-many') dialog.append(names);
    dialog.append(actions);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise(resolve => {
      let result: string | null = null;
      const close = () => { dialog.removeEventListener('close', close); previous?.focus({ preventScroll: true }); resolve(result); };
      dialog.addEventListener('close', close);
      cancel.addEventListener('click', () => dialog.close());
      confirm.addEventListener('click', () => { if (mode === 'rename' && !input.value.trim()) { input.focus(); return; } result = mode === 'rename' ? input.value : 'delete'; dialog.close(); });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); confirm.click(); } });
      dialog.showModal(); if (mode === 'rename') { input.focus(); input.select(); } else cancel.focus();
    });
  }
  return {
    rename: view => open([view], 'rename'),
    remove: async view => (await open([view], 'remove')) !== null,
    removeMany: async views => views.length > 0 && (await open(views, 'remove-many')) !== null,
  };
}
