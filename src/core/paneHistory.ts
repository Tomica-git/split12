export interface PaneHistory { entries: string[]; index: number }
export type HistoryAction = { type: 'commit'; url: string; forwardBack?: boolean; traverseIndex?: number } | { type: 'clear' };
export const emptyHistory = (): PaneHistory => ({ entries: [], index: -1 });
export const canGoBack = (state: PaneHistory): boolean => state.index > 0;
export const canGoForward = (state: PaneHistory): boolean => state.index >= 0 && state.index < state.entries.length - 1;

export function paneHistory(state: PaneHistory, action: HistoryAction): PaneHistory {
  if (action.type === 'clear') return emptyHistory();
  const entries = [...state.entries];
  if (action.traverseIndex !== undefined && action.traverseIndex >= 0 && action.traverseIndex < entries.length) {
    entries[action.traverseIndex] = action.url;
    return { entries, index: action.traverseIndex };
  }
  if (action.forwardBack) {
    if (state.index > 0 && entries[state.index - 1] === action.url) return { entries, index: state.index - 1 };
    if (state.index < entries.length - 1 && entries[state.index + 1] === action.url) return { entries, index: state.index + 1 };
  }
  if (entries[state.index] === action.url) return state;
  const next = entries.slice(0, state.index + 1).concat(action.url).slice(-50);
  return { entries: next, index: next.length - 1 };
}
