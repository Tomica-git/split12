export function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
  if (!shortcut || event.repeat || event.isComposing) return false;
  const normalized = shortcut.replaceAll('⌘', 'Command+').replaceAll('⌥', 'Alt+')
    .replaceAll('⇧', 'Shift+').replaceAll('⌃', 'Ctrl+')
    .replaceAll('↑', 'Up').replaceAll('↓', 'Down').replaceAll('←', 'Left').replaceAll('→', 'Right');
  const parts = normalized.split('+').filter(Boolean);
  const key = parts.pop()?.toLowerCase();
  const mods = new Set(parts.map(part => part.toLowerCase()));
  const eventKey = event.key.toLowerCase().replace(/^arrow/, '');
  const physicalKey = /^(Key[A-Z]|Digit[0-9])$/.test(event.code ?? '') ? event.code.slice(-1).toLowerCase() : '';
  return Boolean(key && (key === eventKey || key === physicalKey)
    && event.altKey === mods.has('alt')
    && event.shiftKey === mods.has('shift')
    && event.metaKey === (mods.has('command') || mods.has('meta'))
    && event.ctrlKey === (mods.has('ctrl') || mods.has('control') || mods.has('macctrl')));
}
