/** Keep the accessible name separate from the optional, current shortcut hint. */
export function installShortcutHints(): void {
  const mappings: Record<string, { command?: string; commands?: string[]; mac?: string; other?: string; replaceFallback?: boolean }> = {
    'toolbar-hide': { command: 'toggle-toolbar', mac: '⌥⇧H', other: 'Alt+Shift+H' },
    'toolbar-reopen': { command: 'toggle-toolbar', mac: '⌥⇧H', other: 'Alt+Shift+H' },
    'sidebar-toggle': { command: 'toggle-sidebar', mac: '⌘B', other: 'Ctrl+B' },
    'count-minus': { command: 'pane-decrease' }, 'count-plus': { command: 'pane-increase' },
    'view-create': { command: 'new-view' },
    undo: { command: 'layout-undo', mac: '⌘⇧[', other: 'Ctrl+Shift+[' },
    redo: { command: 'layout-redo', mac: '⌘⇧]', other: 'Ctrl+Shift+]' },
    back: { command: 'page-back', mac: '⌃−', other: 'Ctrl+−' },
    forward: { command: 'page-forward', mac: '⌃⇧−', other: 'Ctrl+Shift+−' },
    close: { command: 'close-pane', other: 'Ctrl+Shift+D' },
    'split-up': { command: 'split-up', mac: '⌘⇧W（Chrome優先の場合あり）', replaceFallback: true },
    'split-left': { command: 'split-left', mac: '⌘⇧A（Chrome優先の場合あり）', replaceFallback: true },
    'split-y': { command: 'split-down', mac: '⌘⇧S（Chrome優先の場合あり）', replaceFallback: true },
    'split-x': { command: 'split-right', mac: '⌘⇧D（Chrome優先の場合あり）', replaceFallback: true },
    zoom: { commands: ['zoom-in', 'zoom-out'], mac: "⌘⇧' / ⌘⇧;" },
  };
  const labels = new WeakMap<HTMLButtonElement, string>();
  let commands = new Map<string, string>();
  let lastRefresh = 0;
  let loaded = false;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  function update(button: HTMLButtonElement): void {
    if (button.classList.contains('pane-number')) return;
    const label = labels.get(button) ?? button.title ?? button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
    if (!labels.has(button)) labels.set(button, label || button.getAttribute('aria-label') || button.textContent?.trim() || '');
    const name = labels.get(button)!;
    const mapping = [...button.classList].map(item => mappings[item]).find(Boolean);
    const configured = (mapping?.commands ?? (mapping?.command ? [mapping.command] : [])).map(command => commands.get(command));
    const values = [...configured, mapping?.replaceFallback && configured.some(Boolean) ? undefined : mac ? mapping?.mac : mapping?.other].filter((value): value is string => Boolean(value));
    button.title = !loaded ? name : `${name}（${values.length ? [...new Set(values)].join(' / ') : 'ショートカット未設定'}）`;
  }
  function updateAll(): void { document.querySelectorAll<HTMLButtonElement>('.toolbar button, .view-sidebar button, .pane-bar button, .toolbar-reopen').forEach(update); }
  async function refresh(): Promise<void> {
    try { const values = await chrome.commands.getAll(); commands = new Map(values.map(value => [value.name ?? '', value.shortcut ?? ''])); loaded = true; updateAll(); } catch { /* Keep the last verified values. */ }
  }
  function enter(event: Event): void {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.toolbar button, .view-sidebar button, .pane-bar button, .toolbar-reopen') : null;
    if (!button) return;
    update(button);
    if (Date.now() - lastRefresh > 1000) { lastRefresh = Date.now(); void refresh(); }
  }
  document.addEventListener('pointerover', enter); document.addEventListener('focusin', enter);
  window.addEventListener('focus', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh();
}
