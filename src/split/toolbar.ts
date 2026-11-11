import { MAX_PANES, type Orientation } from '../core/layout';
import { text } from '../ui/strings';

export function createToolbar(actions: {
  count(value: number): void; orientation(value: Orientation): void; settings(): void; shortcuts(): void; preset(): void; split(axis: 'x' | 'y', before?: boolean): void; newView(): void; guide(): void; undo(): void; redo(): void; sidebar(): void; templates(): void; templateShortcut(index: number): void; toggleToolbar(): void; paneList(): void;
}): { element: HTMLElement; update(count: number, orientation: Orientation): void; history(undo: boolean, redo: boolean): void; currentView(name: string): void } {
  const bar = document.createElement('header');
  bar.className = 'toolbar';
  bar.innerHTML = `<button type="button" class="brand toolbar-hide" aria-label="上部ツールバーを閉じる" title="上部ツールバーを閉じる"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>Split12</strong><span class="brand-sub">MULTI VIEW</span></button><span class="current-view" aria-label="選択中のビュー"></span><button type="button" class="toolbar-action sidebar-toggle" aria-expanded="false">${text.sidebar}</button>
    <div class="toolbar-group count-group" role="group" aria-label="${text.count}"><span class="group-label">表示数</span><div class="segmented count-controls"><button type="button" class="count-minus" aria-label="表示数を減らす">−</button><input class="count-input" type="number" min="1" max="${MAX_PANES}" step="1" aria-label="表示数"><span aria-hidden="true">/ ${MAX_PANES}</span><button type="button" class="count-plus" aria-label="表示数を増やす">＋</button></div></div>
    <div class="split-group" role="group" aria-label="固定タブに追加">
      <button type="button" class="toolbar-action split-left" aria-label="左に追加" title="固定タブの左に追加（右クリックでリンクの追加方向を固定）"><svg class="split-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect class="si-new" x="3.75" y="4.75" width="5.5" height="10.5" rx="1.25"/><rect class="si-frame" x="3" y="4" width="14" height="12" rx="2"/><path d="M10 4.75V15.25"/><path class="si-plus" d="M6.5 8.25v3.5M4.75 10h3.5"/></svg></button>
      <button type="button" class="toolbar-action split-x" aria-label="右に追加（左右に追加）" title="固定タブの右に追加（右クリックでリンクの追加方向を固定）"><svg class="split-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect class="si-new" x="10.75" y="4.75" width="5.5" height="10.5" rx="1.25"/><rect class="si-frame" x="3" y="4" width="14" height="12" rx="2"/><path d="M10 4.75V15.25"/><path class="si-plus" d="M13.5 8.25v3.5M11.75 10h3.5"/></svg></button>
      <button type="button" class="toolbar-action split-up" aria-label="上に追加" title="固定タブの上に追加（右クリックでリンクの追加方向を固定）"><svg class="split-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect class="si-new" x="3.75" y="4.75" width="12.5" height="4.5" rx="1.25"/><rect class="si-frame" x="3" y="4" width="14" height="12" rx="2"/><path d="M3.75 10H16.25"/><path class="si-plus" d="M10 5.5v3M8.5 7h3"/></svg></button>
      <button type="button" class="toolbar-action split-y" aria-label="下に追加（上下に追加）" title="固定タブの下に追加（右クリックでリンクの追加方向を固定）"><svg class="split-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><rect class="si-new" x="3.75" y="10.75" width="12.5" height="4.5" rx="1.25"/><rect class="si-frame" x="3" y="4" width="14" height="12" rx="2"/><path d="M3.75 10H16.25"/><path class="si-plus" d="M10 11.5v3M8.5 13h3"/></svg></button>
    </div>
    <button type="button" class="toolbar-action undo" aria-label="${text.undo}" title="${text.undo}" disabled>↶</button><button type="button" class="toolbar-action redo" aria-label="${text.redo}" title="${text.redo}" disabled>↷</button><button type="button" class="toolbar-action pane-list-open">一覧</button>
    <div class="toolbar-group direction-group" role="group" aria-label="並び方"><div class="segmented direction-buttons"></div></div>
    <div class="toolbar-spacer"></div><button type="button" class="toolbar-action preset" title="上3枚と下1枚">3＋1</button><button type="button" class="toolbar-action templates" aria-haspopup="dialog">${text.templates}</button><div class="toolbar-template-shortcuts" role="group" aria-label="テンプレートショートカット"><button type="button" class="toolbar-action template-shortcut" aria-label="テンプレートショートカット 1">1</button><button type="button" class="toolbar-action template-shortcut" aria-label="テンプレートショートカット 2">2</button><button type="button" class="toolbar-action template-shortcut" aria-label="テンプレートショートカット 3">3</button></div>
    <div class="toolbar-help"><button type="button" class="toolbar-action guide">${text.guide}</button><button type="button" class="toolbar-action settings" aria-label="${text.settings}">⚙ <span>${text.settings}</span></button></div>`;
  const countInput = bar.querySelector<HTMLInputElement>('.count-input')!;
  const minus = bar.querySelector<HTMLButtonElement>('.count-minus')!;
  const plus = bar.querySelector<HTMLButtonElement>('.count-plus')!;
  let currentCount = 1;
  const directions = bar.querySelector('.direction-buttons')!;
  function commitCount(): void {
    const value = countInput.valueAsNumber;
    if (Number.isInteger(value) && value >= 1 && value <= MAX_PANES) { if (value !== currentCount) actions.count(value); }
    else countInput.value = String(currentCount);
  }
  countInput.addEventListener('change', commitCount);
  countInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); commitCount(); } else if (event.key === 'Escape') { countInput.value = String(currentCount); } });
  minus.addEventListener('click', () => actions.count(Math.max(1, currentCount - 1)));
  plus.addEventListener('click', () => actions.count(Math.min(MAX_PANES, currentCount + 1)));
  for (const [value, label, symbol] of [['landscape', text.landscape, '▥'], ['portrait', text.portrait, '▤']] as const) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.orientation = value; button.textContent = `${symbol} ${label}`;
    button.addEventListener('click', () => actions.orientation(value)); directions.append(button);
  }
  bar.querySelector('.settings')!.addEventListener('click', actions.settings);
  bar.querySelector('.guide')!.addEventListener('click', actions.guide);
  bar.querySelector('.undo')!.addEventListener('click', actions.undo);
  bar.querySelector('.redo')!.addEventListener('click', actions.redo);
  bar.querySelector('.pane-list-open')!.addEventListener('click', actions.paneList);
  bar.querySelector('.templates')!.addEventListener('click', actions.templates);
  bar.querySelector('.toolbar-hide')!.addEventListener('click', actions.toggleToolbar);
  bar.querySelectorAll<HTMLButtonElement>('.template-shortcut').forEach((button, index) => button.addEventListener('click', () => actions.templateShortcut(index)));
  bar.querySelector('.sidebar-toggle')!.addEventListener('click', actions.sidebar);
  bar.querySelector('.preset')!.addEventListener('click', actions.preset);
  bar.querySelector('.split-x')!.addEventListener('click', () => actions.split('x'));
  bar.querySelector('.split-y')!.addEventListener('click', () => actions.split('y'));
  bar.querySelector('.split-left')!.addEventListener('click', () => actions.split('x', true));
  bar.querySelector('.split-up')!.addEventListener('click', () => actions.split('y', true));
  const fixedDirections = { '.split-left': 'left', '.split-x': 'right', '.split-up': 'up', '.split-y': 'down' } as const;
  let fixedDirection = '';
  function showFixedDirection(value: unknown): void {
    fixedDirection = typeof value === 'string' && ['left', 'right', 'up', 'down'].includes(value) ? value : '';
    for (const [selector, direction] of Object.entries(fixedDirections)) {
      const button = bar.querySelector<HTMLButtonElement>(selector)!;
      const fixed = direction === fixedDirection;
      button.classList.toggle('link-direction-fixed', fixed);
      button.setAttribute('aria-description', fixed ? 'リンクの追加方向に固定中。右クリックで解除' : '右クリックでリンクの追加方向に固定');
    }
  }
  for (const [selector, direction] of Object.entries(fixedDirections)) bar.querySelector(selector)!.addEventListener('contextmenu', event => {
    event.preventDefault();
    const next = fixedDirection === direction ? '' : direction;
    showFixedDirection(next);
    void chrome.storage.local.set({ fixedLinkDirection: next });
  });
  void chrome.storage.local.get('fixedLinkDirection').then(saved => showFixedDirection(saved.fixedLinkDirection));
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.fixedLinkDirection) showFixedDirection(changes.fixedLinkDirection.newValue); });
  function update(count: number, orientation: Orientation): void {
    currentCount = count; countInput.value = String(count);
    minus.disabled = count <= 1; plus.disabled = count >= MAX_PANES;
    directions.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      const active = button.dataset.orientation === orientation;
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  return { element: bar, update, currentView(name) { bar.querySelector('.current-view')!.textContent = name; }, history(undo, redo) { bar.querySelector<HTMLButtonElement>('.undo')!.disabled = !undo; bar.querySelector<HTMLButtonElement>('.redo')!.disabled = !redo; } };
}
