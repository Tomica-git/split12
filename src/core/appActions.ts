export const actionLabels = {
  'new-view': '新しいビュー', 'toggle-sidebar': 'セッション一覧の開閉', 'close-pane': '選択中のタブを削除',
  'layout-undo': '変更を元に戻す', 'layout-redo': '変更をやり直す', 'page-back': '選択枠のページを戻る',
  'page-forward': '選択枠のページを進む', 'split-add': '固定枠を分割して追加', 'view-up': '一覧の前のビューを選択', 'view-down': '一覧の次のビューを選択',
  'split-up': '固定枠の上に追加', 'split-left': '固定枠の左に追加', 'split-down': '固定枠の下に追加', 'split-right': '固定枠の右に追加',
  'zoom-in': '選択枠を10%拡大', 'zoom-out': '選択枠を10%縮小', 'escape-maximize': '最大化を解除', 'toggle-toolbar': '上部ツールバーの開閉',
} as const;
export type AppAction = keyof typeof actionLabels;
export function isAppAction(value: unknown): value is AppAction { return typeof value === 'string' && Object.hasOwn(actionLabels, value); }
export const frameActions: readonly AppAction[] = ['close-pane', 'layout-undo', 'layout-redo', 'page-back', 'page-forward', 'split-add', 'split-up', 'split-left', 'split-down', 'split-right', 'zoom-in', 'zoom-out', 'escape-maximize', 'toggle-toolbar'];
export function zoomActionForKey(event: KeyboardEvent): 'zoom-in' | 'zoom-out' | null {
  if (!event.metaKey || event.ctrlKey || !event.shiftKey || event.altKey || event.getModifierState?.('AltGraph')) return null;
  const key = event.key.toLowerCase();
  if (event.code === 'Semicolon' || event.code === 'Minus' || event.code === 'NumpadSubtract' || key === '-' || key === '_') return 'zoom-out';
  if (event.code === 'Quote' || key === "'" || key === '‘' || key === '’' || key === '+' || event.code === 'NumpadAdd' || (event.code === 'Equal' && key === '=')) return 'zoom-in';
  return null;
}
export function appActionForKey(event: KeyboardEvent, insideSite = false, editable = false): AppAction | null {
  if (event.isComposing || event.repeat || event.getModifierState?.('AltGraph')) return null;
  const key = event.key.toLowerCase();
  if (event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey) {
    const directions: Record<string, AppAction> = { w: 'split-up', a: 'split-left', s: 'split-down', d: 'split-right' };
    const direction = directions[key];
    if (direction) return direction;
  }
  if (event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey && (event.code === 'KeyH' || key === 'h')) return 'toggle-toolbar';
  if (event.ctrlKey && !event.metaKey && !event.altKey && (event.code === 'Minus' || key === '-' || key === '_')) return event.shiftKey ? 'page-forward' : 'page-back';
  const zoom = zoomActionForKey(event);
  if (zoom) return zoom;
  if (!(event.metaKey || event.ctrlKey) || (event.metaKey && event.ctrlKey)) return null;
  let action: AppAction | null = null;
  if (event.shiftKey && !event.altKey && ['[', '{', ']', '}'].includes(key)) action = key === '[' || key === '{' ? 'layout-undo' : 'layout-redo';
  else if (event.shiftKey && !event.altKey && key === 'd') action = 'close-pane';
  else if (!event.shiftKey && event.altKey && (key === 'n' || event.code === 'KeyN')) action = 'split-add';
  else if (!event.shiftKey && !event.altKey && key === 'n') action = 'new-view';
  else if (!editable && !event.shiftKey && !event.altKey && key === 'b') action = 'toggle-sidebar';
  else if (!editable && !event.shiftKey && !event.altKey && key === 'arrowup') action = 'view-up';
  else if (!editable && !event.shiftKey && !event.altKey && key === 'arrowdown') action = 'view-down';
  return insideSite && action && !frameActions.includes(action) ? null : action;
}
