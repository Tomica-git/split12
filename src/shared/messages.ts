import type { AppAction } from '../core/appActions';
import type { ViewSummary } from '../core/views';
import type { LayoutTemplate, TemplateShape } from '../core/templates';
export type SplitRequest =
  | { type: 'split/register' }
  | { type: 'split/create' }
  | { type: 'views/register' | 'views/list' | 'views/create' }
  | { type: 'views/focus'; id: string }
  | { type: 'views/rename'; id: string; title: string }
  | { type: 'views/delete'; id: string; expectedTabIds: number[] }
  | { type: 'views/reorder'; ids: string[] }
  | { type: 'templates/list' }
  | { type: 'templates/create'; name: string; shape: TemplateShape }
  | { type: 'templates/update'; id: string; shape: TemplateShape }
  | { type: 'templates/rename'; id: string; name: string }
  | { type: 'templates/delete'; id: string }
  | { type: 'allowlist/add' | 'allowlist/remove'; hosts: string[] }
  | { type: 'service-worker/clear'; url: string };
export type SplitResponse =
  | { ok: true; tabId?: number; hosts?: string[]; views?: ViewSummary[]; templates?: LayoutTemplate[]; forkUrl?: string }
  | { ok: false; reason: string; tabId?: number };
export type AddUrlMessage = { type: 'pane/add-url'; url: string; tabId: number; confirmLoad?: boolean; axis?: 'x' | 'y'; before?: boolean; frameId?: number; link?: boolean };
export type AppActionMessage = { type: 'app/action'; tabId: number; action: AppAction; frameId?: number; at?: number };
