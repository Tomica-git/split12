import type { PaneState } from './workspace';
import { MAX_PANES } from './layout';

export function targetPane(count: number, panes: readonly PaneState[]): { index: number; count: number } | null {
  const empty = panes.slice(0, count).findIndex(pane => !pane.url);
  if (empty >= 0) return { index: empty, count };
  // Hidden panes may still hold saved URLs; never overwrite them implicitly.
  for (let index = count; index < Math.min(MAX_PANES, panes.length); index++) {
    if (!panes[index]!.url) return { index, count: index + 1 };
  }
  return null;
}
