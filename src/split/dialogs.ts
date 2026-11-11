import { isOpenableUrl } from '../core/url';
import { actionLabels, isAppAction } from '../core/appActions';
import { text } from '../ui/strings';

export function createDialogs(callbacks: {
  hosts(): string[]; removeHost(host: string): Promise<void>; addUrl(url: string): Promise<boolean>; usedUrls(): string[];
}): { settings(): void; shortcuts(): void; tabs(): Promise<void> } {
  const settings = document.createElement('dialog');
  settings.className = 'dialog';
  const tabs = document.createElement('dialog');
  tabs.className = 'dialog';
  const shortcuts = document.createElement('dialog'); shortcuts.className = 'dialog';
  document.body.append(settings, tabs, shortcuts);
  function heading(dialog: HTMLDialogElement, title: string, description: string): HTMLElement {
    dialog.replaceChildren();
    dialog.setAttribute('aria-label', title);
    const top = document.createElement('div'); top.className = 'dialog-top';
    const titleElement = document.createElement('h2'); titleElement.textContent = title;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'dialog-close'; close.textContent = '×'; close.setAttribute('aria-label', text.done); close.addEventListener('click', () => dialog.close());
    top.append(titleElement, close); dialog.append(top);
    const p = document.createElement('p'); p.className = 'dialog-description'; p.textContent = description; dialog.append(p);
    const list = document.createElement('div'); list.className = 'dialog-list'; dialog.append(list);
    return list;
  }
  function renderSettings(): void {
    const list = heading(settings, text.allowedList, text.allowedDescription);
    const hosts = callbacks.hosts();
    if (!hosts.length) { list.textContent = text.noHosts; list.classList.add('muted'); }
    for (const host of hosts) {
      const row = document.createElement('div'); row.className = 'dialog-row';
      const label = document.createElement('span'); label.textContent = host;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = text.remove; remove.setAttribute('aria-label', `${host} を削除`);
      remove.addEventListener('click', () => { void callbacks.removeHost(host).then(renderSettings); });
      row.append(label, remove); list.append(row);
    }
    const displayHeading = document.createElement('h3'); displayHeading.textContent = '表示'; settings.append(displayHeading);
    const displayList = document.createElement('div'); displayList.className = 'dialog-list'; settings.append(displayList);
    const diagnosticRow = document.createElement('label'); diagnosticRow.className = 'dialog-row setting-row';
    const diagnosticText = document.createElement('span'); diagnosticText.textContent = 'ドラッグ診断を左下に表示する';
    const diagnosticToggle = document.createElement('input'); diagnosticToggle.type = 'checkbox'; diagnosticToggle.setAttribute('aria-label', 'ドラッグ診断を左下に表示する');
    void chrome.storage.local.get('ui').then(({ ui }) => { diagnosticToggle.checked = (ui as { dragDiagnostic?: unknown } | undefined)?.dragDiagnostic === true; });
    diagnosticToggle.addEventListener('change', () => {
      void chrome.storage.local.get('ui').then(({ ui }) => chrome.storage.local.set({ ui: { ...(ui && typeof ui === 'object' ? ui : {}), schemaVersion: 1, dragDiagnostic: diagnosticToggle.checked } }));
    });
    diagnosticRow.append(diagnosticText, diagnosticToggle); displayList.append(diagnosticRow);
    const diagnosticHint = document.createElement('p'); diagnosticHint.className = 'dialog-description'; diagnosticHint.textContent = 'リンクのドロップがうまくいかないときの調査用です。受け取ったイベントの数と判定した先を表示します。';
    settings.append(diagnosticHint);
    const shortcutHeading = document.createElement('h3'); shortcutHeading.textContent = 'キーボードショートカット'; settings.append(shortcutHeading);
    appendShortcuts(settings);
  }
  function appendShortcuts(dialog: HTMLDialogElement): void {
    const shortcutList = document.createElement('div'); shortcutList.className = 'dialog-list'; dialog.append(shortcutList);
    void chrome.commands.getAll().then(commands => {
      for (const command of commands) {
        if (!['pane-increase', 'pane-decrease', '_execute_action'].includes(command.name ?? '') && !isAppAction(command.name)) continue;
        const row = document.createElement('div'); row.className = 'dialog-row';
        const label = document.createElement('span'); label.textContent = command.name === '_execute_action' ? '分割ビューを開く' : isAppAction(command.name) ? actionLabels[command.name] : command.description ?? '';
        const value = document.createElement('kbd'); value.textContent = command.shortcut || '未設定';
        row.append(label, value); shortcutList.append(row);
      }
    });
    const hint = document.createElement('p'); hint.className = 'dialog-description';
    hint.textContent = 'ビュー内: Option/Alt+Shift+H 上部ツールバーの開閉、⌘/Ctrl+N 新規、⌘/Ctrl+B 一覧、⌘/Ctrl+↑↓ 一覧移動、⌘/Ctrl+Option/Alt+N 固定枠を追加、Ctrl+Shift+D 選択枠を削除、⌘+Shift+W/A/S/D 固定枠の上/左/下/右に追加、⌘/Ctrl+Shift+[ / ] 配置を戻す・やり直す。選択枠の倍率は ⌘+Shift+＋ / −、ページ履歴は Ctrl+− / Ctrl+Shift+−。ChromeやOSが優先するキーは届かない場合があります。上のボタンや変更可能な拡張ショートカットも使えます。サイト編集中のB・↑↓・N・Kは横取りしません。';
    dialog.append(hint);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'primary-button'; edit.textContent = 'ショートカットを変更';
    edit.title = 'Chromeのショートカット設定で「変更を元に戻す」と「変更をやり直す」を登録・変更できます。';
    edit.addEventListener('click', () => { void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
    dialog.append(edit);
  }
  async function openTabs(): Promise<void> {
    const list = heading(tabs, text.tabsTitle, '追加したいページを選んでください。');
    const seen = new Set(callbacks.usedUrls());
    const available = (await chrome.tabs.query({ currentWindow: true })).filter(tab => {
      if (!isOpenableUrl(tab.url) || seen.has(tab.url)) return false;
      seen.add(tab.url);
      return true;
    });
    if (!available.length) { list.textContent = text.noTabs; list.classList.add('muted'); }
    for (const tab of available) {
      const label = document.createElement('label'); label.className = 'tab-choice';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = tab.url!;
      const details = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = tab.title || tab.url!;
      const url = document.createElement('small'); url.textContent = tab.url!;
      details.append(title, url); label.append(checkbox, details); list.append(label);
    }
    const add = document.createElement('button'); add.className = 'primary-button'; add.type = 'button'; add.textContent = text.tabsAdd;
    add.addEventListener('click', () => {
      void (async () => {
        const checked = [...list.querySelectorAll<HTMLInputElement>('input:checked')];
        for (const input of checked) if (!await callbacks.addUrl(input.value)) break;
        tabs.close();
      })();
    });
    tabs.append(add); tabs.showModal();
  }
  return {
    settings: () => { renderSettings(); settings.showModal(); },
    shortcuts: () => { heading(shortcuts, 'キーボードショートカット', '操作と現在の割り当てを確認できます。変更は Chrome の設定で行います。').remove(); appendShortcuts(shortcuts); shortcuts.showModal(); },
    tabs: openTabs,
  };
}
